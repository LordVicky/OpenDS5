import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
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

export interface RawProcessInfo {
  comm: string;
  argv0Basename: string | null;
  exePath: string | null;
}

export interface GameProcessCandidate {
  name: string;
  kind: 'proton' | 'game-path' | 'other';
}

const PROTON_BLOCKLIST_EXACT = new Set([
  'wineserver', 'services.exe', 'svchost.exe', 'explorer.exe', 'winedevice.exe',
  'plugplay.exe', 'rpcss.exe', 'tabtip.exe', 'steam.exe', 'steamwebhelper.exe',
  'wine', 'wine64', 'wine-preloader', 'wine64-preloader', 'start.exe',
  'conhost.exe', 'crashhandler.exe', 'iscriptevaluator.exe', 'upplayservice.exe'
]);
const PROTON_BLOCKLIST_PREFIXES = ['easyanticheat', 'battleye'];

const GAME_PATH_MARKERS = ['steamapps/common', '/games/', 'heroic', 'lutris', 'bottles'];

const OTHER_TIER_EXACT = new Set([
  'bash', 'zsh', 'sh', 'wireplumber', 'xwayland', 'firefox', 'chrome', 'chromium',
  'electron', 'ds5-bridge', 'ds5-bridge-companion'
]);
const OTHER_TIER_PREFIXES = ['systemd', 'dbus', 'pipewire'];
const OTHER_TIER_CAP = 30;

function defaultReadProc(): RawProcessInfo[] {
  const infos: RawProcessInfo[] = [];
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const comm = readFileSync(`/proc/${entry}/comm`, 'utf8').trim();
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf8');
      const argv0 = cmdline.split('\0')[0];
      const argv0Basename = argv0
        ? path.basename(argv0.replace(/\\/g, '/')).toLowerCase()
        : null;
      let exePath: string | null = null;
      try {
        exePath = readlinkSync(`/proc/${entry}/exe`);
      } catch {
        exePath = null;
      }
      infos.push({ comm, argv0Basename, exePath });
    } catch {
      // process exited mid-scan; ignore
    }
  }
  return infos;
}

function normalizedCandidateName(info: RawProcessInfo): string {
  const raw = info.argv0Basename || info.comm;
  return path.basename(raw.replace(/\\/g, '/')).toLowerCase();
}

function matchesPrefix(name: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

export function listCandidateGameProcesses(
  readProc: () => RawProcessInfo[] = defaultReadProc
): GameProcessCandidate[] {
  let infos: RawProcessInfo[];
  try {
    infos = readProc();
  } catch {
    return [];
  }

  const protonNames = new Set<string>();
  const gamePathNames = new Set<string>();
  const otherNames = new Set<string>();

  for (const info of infos) {
    const name = normalizedCandidateName(info);
    if (!name) continue;
    if (PROTON_BLOCKLIST_EXACT.has(name) || matchesPrefix(name, PROTON_BLOCKLIST_PREFIXES)) {
      continue; // wine plumbing is never a candidate, in any tier
    }

    if (name.endsWith('.exe')) {
      protonNames.add(name);
      continue;
    }

    const exePathLower = info.exePath?.toLowerCase() ?? '';
    if (exePathLower && GAME_PATH_MARKERS.some((marker) => exePathLower.includes(marker))) {
      gamePathNames.add(name);
      continue;
    }

    if (!info.argv0Basename) continue; // kernel thread (empty cmdline)
    if (OTHER_TIER_EXACT.has(name) || matchesPrefix(name, OTHER_TIER_PREFIXES)) continue;
    otherNames.add(name);
  }

  if (protonNames.size > 0 || gamePathNames.size > 0) {
    const proton = [...protonNames].sort().map((name) => ({ name, kind: 'proton' as const }));
    const gamePath = [...gamePathNames].sort().map((name) => ({ name, kind: 'game-path' as const }));
    return [...proton, ...gamePath];
  }

  return [...otherNames]
    .sort()
    .slice(0, OTHER_TIER_CAP)
    .map((name) => ({ name, kind: 'other' as const }));
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
      this.active = matched;
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
    if (next.profileId === this.active.profileId) {
      this.active = next;
      return;
    }
    this.active = next;
    this.emit('change', next);
  }
}
