import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROFILE_ID, type TriggerProfile } from '../shared/trigger-profiles';

export type ProcessLister = () => string[];

export interface ActiveProfileChange {
  profileId: string;
  matchedBy: 'pin' | 'process' | 'default';
  matchedName: string | null;
}

type GameWatcherOptions = {
  listProcesses?: ProcessLister;
  pollIntervalMs?: number;
  debounceMs?: number;
};

export function listProcProcesses(): string[] {
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const comm = readFileSync(`/proc/${entry}/comm`, 'utf8').trim().toLowerCase();
      if (comm) names.add(comm);
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
      const argv0 = cmdline.split('\0')[0];
      if (argv0) names.add(path.basename(argv0.replace(/\\/g, '/')).toLowerCase());
    } catch {
      // process exited mid-scan; ignore
    }
  }
  return [...names];
}

export class GameWatcher extends EventEmitter {
  private readonly listProcesses: ProcessLister;
  private readonly pollIntervalMs: number;
  private readonly debounceMs: number;
  private profiles: TriggerProfile[] = [];
  private pinnedProfileId: string | null = null;
  private active: ActiveProfileChange = { profileId: DEFAULT_PROFILE_ID, matchedBy: 'default', matchedName: null };
  private candidate: ActiveProfileChange | null = null;
  private candidateSinceMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameWatcherOptions = {}) {
    super();
    this.listProcesses = options.listProcesses ?? listProcProcesses;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.debounceMs = options.debounceMs ?? 5000;
  }

  setProfiles(profiles: TriggerProfile[]): void {
    this.profiles = profiles;
  }

  pinProfile(profileId: string | null): void {
    this.pinnedProfileId = profileId;
    this.candidate = null;
    if (profileId !== null) {
      this.activate({ profileId, matchedBy: 'pin', matchedName: null });
    } else {
      this.poll(true);
    }
  }

  getActive(): ActiveProfileChange {
    return this.active;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(false), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(immediate: boolean): void {
    if (this.pinnedProfileId !== null) return;
    const matched = this.matchProcesses();
    if (matched.profileId === this.active.profileId) {
      this.candidate = null;
      return;
    }
    const now = Date.now();
    if (immediate || this.debounceMs === 0) {
      this.activate(matched);
      return;
    }
    if (!this.candidate || this.candidate.profileId !== matched.profileId) {
      this.candidate = matched;
      this.candidateSinceMs = now;
      return;
    }
    if (now - this.candidateSinceMs >= this.debounceMs) {
      this.activate(matched);
    }
  }

  private matchProcesses(): ActiveProfileChange {
    const running = new Set(this.listProcesses());
    let best: { profile: TriggerProfile; name: string } | null = null;
    for (const profile of this.profiles) {
      if (profile.id === DEFAULT_PROFILE_ID) continue;
      for (const name of profile.match.processNames) {
        if (running.has(name.toLowerCase())) {
          if (!best || profile.updatedAtMs > best.profile.updatedAtMs) {
            best = { profile, name: name.toLowerCase() };
          }
          break;
        }
      }
    }
    if (best) {
      return { profileId: best.profile.id, matchedBy: 'process', matchedName: best.name };
    }
    return { profileId: DEFAULT_PROFILE_ID, matchedBy: 'default', matchedName: null };
  }

  private activate(next: ActiveProfileChange): void {
    this.candidate = null;
    if (next.profileId === this.active.profileId && next.matchedBy === this.active.matchedBy) {
      this.active = next;
      return;
    }
    this.active = next;
    this.emit('change', next);
  }
}
