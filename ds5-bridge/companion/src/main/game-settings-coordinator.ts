import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BUTTON_REMAP_PROFILE_ID,
  DEFAULT_CONTROLLER_PROFILE_ID
} from '../shared/protocol';
import { gameSettingsProfileId, isGameSettingsProfileId } from '../shared/game-settings';
import { DEFAULT_PROFILE_ID, type EngineStatus } from '../shared/trigger-profiles';

/**
 * Game settings ride on the existing profile systems: each game (trigger profile) may own
 * a controller profile and a button-remap profile whose ids are `game:<triggerProfileId>`.
 * This coordinator only decides WHICH profiles are selected. It listens to the trigger
 * profile engine (the single source of game detection) and:
 *
 *  - when a game with game settings becomes active, remembers the user's global
 *    selections and selects the game-owned profiles;
 *  - when the game exits, restores the remembered global selections;
 *  - while the user is editing a game in the Game Profile tab ("Game settings" scope),
 *    keeps that game's profiles selected regardless of what is running, so every
 *    existing settings tab edits the game's snapshot through the normal live-sync.
 *
 * The restore point is persisted so a crash while a game's settings are applied cannot
 * permanently turn them into the user's globals.
 */

export interface GameSettingsStatus {
  /** Trigger profile id whose game settings are currently selected, or null. */
  appliedProfileId: string | null;
  appliedBy: 'editing' | 'game-active' | null;
  /** Trigger profile id being edited in Game scope, or null. */
  editingProfileId: string | null;
}

export interface GameSettingsSelections {
  controllerProfileId: string;
  buttonRemappingProfileId: string;
}

export interface GameSettingsService {
  getSelections(): GameSettingsSelections;
  hasGameSettings(triggerProfileId: string): boolean;
  ensureGameSettings(triggerProfileId: string, name: string): Promise<unknown>;
  selectControllerProfile(profileId: string): Promise<unknown>;
  selectButtonRemappingProfile(profileId: string): Promise<unknown>;
}

interface RestorePoint {
  controllerProfileId: string;
  buttonRemappingProfileId: string;
}

const STATE_FILE = 'game-settings-state.json';

function sanitizeRestoreId(id: string, fallback: string): string {
  // A game-owned id must never be a restore target: restoring into another game's
  // settings would chain overrides instead of returning to the user's globals.
  return isGameSettingsProfileId(id) ? fallback : id;
}

export class GameSettingsCoordinator extends EventEmitter {
  private readonly service: GameSettingsService;
  private readonly statePath: string;
  private activeGameProfileId: string | null = null;
  private editingProfileId: string | null = null;
  private appliedProfileId: string | null = null;
  private restore: RestorePoint | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(service: GameSettingsService, stateDir: string) {
    super();
    this.service = service;
    mkdirSync(stateDir, { recursive: true });
    this.statePath = path.join(stateDir, STATE_FILE);
    this.restore = this.readPersistedRestore();
  }

  /**
   * Crash recovery, run once at startup before any engine status arrives: a persisted
   * restore point with nothing applied means the app died while game settings were
   * selected. Put the globals back.
   */
  recover(): Promise<void> {
    return this.enqueue(async () => {
      if (this.restore === null || this.appliedProfileId !== null) return;
      await this.applyRestorePoint();
      this.emitStatus();
    });
  }

  /**
   * Wire to TriggerProfileEngine 'status' events. Suspension is deliberately ignored:
   * the engine suspends briefly around manual trigger tests while the game is still
   * running, and flapping the whole settings set for that would be wrong.
   */
  onEngineStatus(status: EngineStatus): void {
    // Only a detected running game activates the game scope. A manual pin
    // (matchedBy 'pin') is a trigger-profile override, not the game running,
    // so it must not swap the full settings set or mark the game active.
    const gameId = status.enabled && status.matchedBy === 'process'
      && status.activeProfileId !== DEFAULT_PROFILE_ID
      ? status.activeProfileId
      : null;
    if (gameId === this.activeGameProfileId) return;
    this.activeGameProfileId = gameId;
    void this.sync();
  }

  /**
   * Enters "Game settings" scope for a game: creates the game-owned profiles from the
   * current settings if this is the game's first edit, then selects them so the regular
   * tabs edit the game snapshot.
   *
   * The scope flips synchronously and the returned status already reflects it — profile
   * selection round-trips to the daemon take long enough that awaiting them made the
   * scope toggle feel dead. The queued apply emits a follow-up status when selections
   * have actually settled, and applyTarget reads editingProfileId at run time, so rapid
   * toggles converge on the last state.
   */
  enterEditScope(triggerProfileId: string, name: string): Promise<GameSettingsStatus> {
    this.editingProfileId = triggerProfileId;
    this.emitStatus();
    void this.enqueue(async () => {
      await this.service.ensureGameSettings(triggerProfileId, name);
      await this.applyTarget();
      this.emitStatus();
    });
    return Promise.resolve(this.getStatus());
  }

  /** Leaves "Game settings" scope; global selections come back unless the game is live. */
  exitEditScope(): Promise<GameSettingsStatus> {
    if (this.editingProfileId !== null) {
      this.editingProfileId = null;
      this.emitStatus();
      void this.enqueue(async () => {
        await this.applyTarget();
        this.emitStatus();
      });
    }
    return Promise.resolve(this.getStatus());
  }

  /** Cleanup hook for trigger profile deletion. */
  onProfileDeleted(triggerProfileId: string): Promise<void> {
    return this.enqueue(async () => {
      let changed = false;
      if (this.editingProfileId === triggerProfileId) {
        this.editingProfileId = null;
        changed = true;
      }
      if (this.activeGameProfileId === triggerProfileId) {
        this.activeGameProfileId = null;
        changed = true;
      }
      if (changed || this.appliedProfileId === triggerProfileId) {
        await this.applyTarget();
        this.emitStatus();
      }
    });
  }

  getStatus(): GameSettingsStatus {
    return {
      appliedProfileId: this.appliedProfileId,
      appliedBy: this.appliedProfileId === null
        ? null
        : this.appliedProfileId === this.editingProfileId
          ? 'editing'
          : 'game-active',
      editingProfileId: this.editingProfileId
    };
  }

  private sync(): Promise<void> {
    return this.enqueue(async () => {
      await this.applyTarget();
      this.emitStatus();
    });
  }

  private async applyTarget(): Promise<void> {
    const activeWithSettings = this.activeGameProfileId !== null
      && this.service.hasGameSettings(this.activeGameProfileId)
      ? this.activeGameProfileId
      : null;
    const target = this.editingProfileId ?? activeWithSettings;
    if (target === this.appliedProfileId) return;

    if (target !== null) {
      if (this.appliedProfileId === null) {
        const selections = this.service.getSelections();
        this.restore = {
          controllerProfileId: sanitizeRestoreId(selections.controllerProfileId, DEFAULT_CONTROLLER_PROFILE_ID),
          buttonRemappingProfileId: sanitizeRestoreId(selections.buttonRemappingProfileId, DEFAULT_BUTTON_REMAP_PROFILE_ID)
        };
        this.persistRestore();
      }
      await this.service.selectControllerProfile(gameSettingsProfileId(target));
      await this.service.selectButtonRemappingProfile(gameSettingsProfileId(target));
      this.appliedProfileId = target;
      return;
    }

    await this.applyRestorePoint();
  }

  private async applyRestorePoint(): Promise<void> {
    const restore = this.restore;
    if (restore) {
      const selections = this.service.getSelections();
      // Only put a selection back if it still points at game settings. If the user
      // manually picked another profile mid-game, that choice wins over the restore.
      if (isGameSettingsProfileId(selections.controllerProfileId)) {
        await this.service.selectControllerProfile(restore.controllerProfileId);
      }
      if (isGameSettingsProfileId(selections.buttonRemappingProfileId)) {
        await this.service.selectButtonRemappingProfile(restore.buttonRemappingProfileId);
      }
    }
    this.restore = null;
    this.persistRestore();
    this.appliedProfileId = null;
  }

  /**
   * Serializes selection changes so engine events and scope changes can never interleave
   * their select calls. The chain survives a rejecting job; the caller still sees it.
   */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.chain.then(fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private persistRestore(): void {
    try {
      writeFileSync(this.statePath, `${JSON.stringify({ restore: this.restore }, null, 2)}\n`, 'utf8');
    } catch {
      // Best-effort: losing the restore point only weakens crash recovery.
    }
  }

  private readPersistedRestore(): RestorePoint | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.statePath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return null;
      const restore = (parsed as Record<string, unknown>).restore;
      if (typeof restore !== 'object' || restore === null) return null;
      const candidate = restore as Record<string, unknown>;
      if (typeof candidate.controllerProfileId !== 'string' || typeof candidate.buttonRemappingProfileId !== 'string') {
        return null;
      }
      return {
        controllerProfileId: sanitizeRestoreId(candidate.controllerProfileId, DEFAULT_CONTROLLER_PROFILE_ID),
        buttonRemappingProfileId: sanitizeRestoreId(candidate.buttonRemappingProfileId, DEFAULT_BUTTON_REMAP_PROFILE_ID)
      };
    } catch {
      return null;
    }
  }
}
