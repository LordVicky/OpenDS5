import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EngineStatus } from '../shared/trigger-profiles';
import { GameSettingsCoordinator, type GameSettingsService } from './game-settings-coordinator';

class FakeService implements GameSettingsService {
  controllerProfileId = 'default';
  buttonRemappingProfileId = 'default';
  gameSettings = new Set<string>();
  ensured: Array<{ id: string; name: string }> = [];
  selections: string[] = [];

  getSelections() {
    return {
      controllerProfileId: this.controllerProfileId,
      buttonRemappingProfileId: this.buttonRemappingProfileId
    };
  }

  hasGameSettings(id: string): boolean {
    return this.gameSettings.has(id);
  }

  async ensureGameSettings(id: string, name: string): Promise<void> {
    this.gameSettings.add(id);
    this.ensured.push({ id, name });
  }

  async selectControllerProfile(profileId: string): Promise<void> {
    this.controllerProfileId = profileId;
    this.selections.push(`controller:${profileId}`);
  }

  async selectButtonRemappingProfile(profileId: string): Promise<void> {
    this.buttonRemappingProfileId = profileId;
    this.selections.push(`remap:${profileId}`);
  }
}

function engineStatus(activeProfileId: string, enabled = true): EngineStatus {
  return { enabled, suspended: false, activeProfileId, matchedBy: 'process', matchedName: 'game.exe' };
}

async function settle(coordinator: GameSettingsCoordinator): Promise<void> {
  // All coordinator work is serialized on one chain; an empty recover() call joins it.
  await coordinator.recover();
}

describe('GameSettingsCoordinator', () => {
  let dir: string;
  let service: FakeService;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'game-settings-'));
    service = new FakeService();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('selects game-owned profiles when a game with game settings becomes active, and restores on exit', async () => {
    service.controllerProfileId = 'my-profile';
    service.buttonRemappingProfileId = 'my-remap';
    service.gameSettings.add('cyberpunk');
    const coordinator = new GameSettingsCoordinator(service, dir);

    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);
    expect(service.controllerProfileId).toBe('game:cyberpunk');
    expect(service.buttonRemappingProfileId).toBe('game:cyberpunk');
    expect(coordinator.getStatus()).toEqual({
      appliedProfileId: 'cyberpunk',
      appliedBy: 'game-active',
      editingProfileId: null
    });

    coordinator.onEngineStatus(engineStatus('default', true));
    await settle(coordinator);
    expect(service.controllerProfileId).toBe('my-profile');
    expect(service.buttonRemappingProfileId).toBe('my-remap');
    expect(coordinator.getStatus().appliedProfileId).toBeNull();
  });

  it('leaves selections alone for a game without game settings', async () => {
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('elden-ring'));
    await settle(coordinator);
    expect(service.selections).toEqual([]);
    expect(coordinator.getStatus().appliedProfileId).toBeNull();
  });

  it('creates game settings on first edit scope entry and restores them on exit', async () => {
    const coordinator = new GameSettingsCoordinator(service, dir);
    const status = await coordinator.enterEditScope('cyberpunk', 'Cyberpunk 2077');
    expect(service.ensured).toEqual([{ id: 'cyberpunk', name: 'Cyberpunk 2077' }]);
    expect(service.controllerProfileId).toBe('game:cyberpunk');
    expect(status).toEqual({
      appliedProfileId: 'cyberpunk',
      appliedBy: 'editing',
      editingProfileId: 'cyberpunk'
    });

    await coordinator.exitEditScope();
    expect(service.controllerProfileId).toBe('default');
    expect(coordinator.getStatus().editingProfileId).toBeNull();
  });

  it('keeps the edited game selected over the running game, then falls back to the running game', async () => {
    service.gameSettings.add('cyberpunk');
    service.gameSettings.add('elden-ring');
    const coordinator = new GameSettingsCoordinator(service, dir);

    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);
    await coordinator.enterEditScope('elden-ring', 'Elden Ring');
    expect(service.controllerProfileId).toBe('game:elden-ring');

    await coordinator.exitEditScope();
    expect(service.controllerProfileId).toBe('game:cyberpunk');
    expect(coordinator.getStatus().appliedBy).toBe('game-active');
  });

  it('does not clobber a selection the user changed away from the game settings mid-game', async () => {
    service.gameSettings.add('cyberpunk');
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);

    // The user picks another controller profile by hand while playing.
    service.controllerProfileId = 'my-profile';

    coordinator.onEngineStatus(engineStatus('default'));
    await settle(coordinator);
    expect(service.controllerProfileId).toBe('my-profile');
    // The remap selection still pointed at the game, so it is restored.
    expect(service.buttonRemappingProfileId).toBe('default');
  });

  it('never captures a game-owned selection as the restore point', async () => {
    service.gameSettings.add('cyberpunk');
    service.controllerProfileId = 'game:stale';
    service.buttonRemappingProfileId = 'game:stale';
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);
    coordinator.onEngineStatus(engineStatus('default'));
    await settle(coordinator);
    expect(service.controllerProfileId).toBe('default');
    expect(service.buttonRemappingProfileId).toBe('default');
  });

  it('recovers a persisted restore point after a crash while game settings were applied', async () => {
    writeFileSync(
      path.join(dir, 'game-settings-state.json'),
      `${JSON.stringify({ restore: { controllerProfileId: 'my-profile', buttonRemappingProfileId: 'my-remap' } })}\n`,
      'utf8'
    );
    service.controllerProfileId = 'game:cyberpunk';
    service.buttonRemappingProfileId = 'game:cyberpunk';
    const coordinator = new GameSettingsCoordinator(service, dir);
    await coordinator.recover();
    expect(service.controllerProfileId).toBe('my-profile');
    expect(service.buttonRemappingProfileId).toBe('my-remap');
  });

  it('persists the restore point when applying and clears it when restoring', async () => {
    service.controllerProfileId = 'my-profile';
    service.gameSettings.add('cyberpunk');
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);
    const statePath = path.join(dir, 'game-settings-state.json');
    expect(JSON.parse(readFileSync(statePath, 'utf8')).restore.controllerProfileId).toBe('my-profile');

    coordinator.onEngineStatus(engineStatus('default'));
    await settle(coordinator);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).restore).toBeNull();
  });

  it('restores globals when the applied game profile is deleted', async () => {
    service.controllerProfileId = 'my-profile';
    service.gameSettings.add('cyberpunk');
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);

    await coordinator.onProfileDeleted('cyberpunk');
    expect(service.controllerProfileId).toBe('my-profile');
    expect(coordinator.getStatus()).toEqual({
      appliedProfileId: null,
      appliedBy: null,
      editingProfileId: null
    });
  });

  it('treats a disabled engine as no active game', async () => {
    service.gameSettings.add('cyberpunk');
    const coordinator = new GameSettingsCoordinator(service, dir);
    coordinator.onEngineStatus(engineStatus('cyberpunk'));
    await settle(coordinator);
    coordinator.onEngineStatus(engineStatus('cyberpunk', false));
    await settle(coordinator);
    expect(coordinator.getStatus().appliedProfileId).toBeNull();
    expect(service.controllerProfileId).toBe('default');
  });
});
