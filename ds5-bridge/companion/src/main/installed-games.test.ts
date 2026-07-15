import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InstalledGamesScanner,
  isLikelyJunkCandidate,
  normalizeGameTitle,
  parseVdfPairs,
  parseVdfPaths,
  rankProcessCandidates,
  type ScannerRoots
} from './installed-games';

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function writeExe(filePath: string, sizeBytes: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.alloc(sizeBytes, 1));
}

function writeElf(filePath: string, sizeBytes: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.alloc(sizeBytes, 1);
  ELF_MAGIC.copy(bytes);
  writeFileSync(filePath, bytes, { mode: 0o755 });
}

describe('vdf parsing', () => {
  it('extracts flat pairs and unescapes quotes/backslashes', () => {
    const pairs = parseVdfPairs('"AppState"\n{\n  "appid" "1245620"\n  "name" "ELDEN RING\\" test"\n  "installdir" "ELDEN RING"\n}');
    expect(pairs.appid).toBe('1245620');
    expect(pairs.name).toBe('ELDEN RING" test');
    expect(pairs.installdir).toBe('ELDEN RING');
  });

  it('collects every library path once', () => {
    const text = '"libraryfolders"{"0"{"path" "/home/u/.local/share/Steam"}"1"{"path" "/mnt/games/SteamLibrary"}"2"{"path" "/mnt/games/SteamLibrary"}}';
    expect(parseVdfPaths(text)).toEqual(['/home/u/.local/share/Steam', '/mnt/games/SteamLibrary']);
  });
});

describe('normalizeGameTitle', () => {
  it('strips marks and collapses whitespace', () => {
    expect(normalizeGameTitle('ELDEN RING™')).toBe('ELDEN RING');
    expect(normalizeGameTitle("Marvel's  Spider-Man®   Remastered ")).toBe("Marvel's Spider-Man Remastered");
  });
});

describe('rankProcessCandidates', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'installed-games-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ranks the real game binary above shims and junk (Elden Ring shape)', () => {
    const game = path.join(dir, 'ELDEN RING');
    writeExe(path.join(game, 'Game', 'eldenring.exe'), 10 * 1024 * 1024);
    writeExe(path.join(game, 'Game', 'start_protected_game.exe'), 1 * 1024 * 1024);
    writeExe(path.join(game, 'Game', 'vcredist_x64.exe'), 2 * 1024 * 1024);
    const ranked = rankProcessCandidates(game);
    expect(ranked[0]).toBe('eldenring.exe');
    expect(ranked).toContain('start_protected_game.exe');
    expect(ranked.indexOf('vcredist_x64.exe')).toBe(ranked.length - 1);
  });

  it('penalizes launcher-adjacent junk even when nothing matches the dir name', () => {
    const game = path.join(dir, 'Some Game');
    writeExe(path.join(game, 'MainBinary.exe'), 40 * 1024 * 1024);
    writeExe(path.join(game, 'CrashReportClient.exe'), 5 * 1024 * 1024);
    writeExe(path.join(game, 'UnrealCEFSubProcess.exe'), 6 * 1024 * 1024);
    const ranked = rankProcessCandidates(game);
    expect(ranked[0]).toBe('MainBinary.exe');
  });

  it('finds Linux-native ELF binaries and ignores non-executable files', () => {
    const game = path.join(dir, 'Stray');
    writeElf(path.join(game, 'stray'), 8 * 1024 * 1024);
    writeFileSync(path.join(game, 'readme.txt'), 'hi');
    expect(rankProcessCandidates(game)).toEqual(['stray']);
  });

  it('reaches Unreal-depth binaries but not beyond the scan cap', () => {
    const game = path.join(dir, 'Deep');
    // MarvelGame/Marvel/Binaries/Win64/<exe> — four levels down.
    writeExe(path.join(game, 'a', 'b', 'c', 'd', 'Shipping.exe'), 10 * 1024 * 1024);
    writeExe(path.join(game, 'a', 'b', 'c', 'd', 'e', 'toodeep.exe'), 20 * 1024 * 1024);
    writeExe(path.join(game, 'a', 'shallow.exe'), 1 * 1024 * 1024);
    const ranked = rankProcessCandidates(game);
    expect(ranked[0]).toBe('Shipping.exe');
    expect(ranked).not.toContain('toodeep.exe');
  });

  it('flags junk names for the dialog default ticks', () => {
    expect(isLikelyJunkCandidate('vcredist_x64.exe')).toBe(true);
    expect(isLikelyJunkCandidate('UE4PrereqSetup_x64.exe')).toBe(true);
    expect(isLikelyJunkCandidate('eldenring.exe')).toBe(false);
    expect(isLikelyJunkCandidate('start_protected_game.exe')).toBe(false);
  });
});

describe('InstalledGamesScanner', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'installed-games-scan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function roots(overrides: Partial<ScannerRoots> = {}): ScannerRoots {
    return { steam: [], heroic: [], legendary: [], ...overrides };
  }

  function makeSteamRoot(root: string, libraries: string[]): void {
    mkdirSync(path.join(root, 'steamapps'), { recursive: true });
    const blocks = libraries.map((library, index) => `"${index}"{"path" "${library}"}`).join('');
    writeFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"{${blocks}}`);
  }

  function addSteamGame(
    library: string,
    appid: string,
    name: string,
    installdir: string,
    stateFlags = 4
  ): void {
    mkdirSync(path.join(library, 'steamapps', 'common', installdir), { recursive: true });
    writeFileSync(
      path.join(library, 'steamapps', `appmanifest_${appid}.acf`),
      `"AppState"{"appid" "${appid}""name" "${name}""StateFlags" "${stateFlags}""installdir" "${installdir}"}`
    );
  }

  it('reads games from every Steam library, skipping partial installs', () => {
    const root = path.join(dir, 'Steam');
    const second = path.join(dir, 'SteamLibrary');
    makeSteamRoot(root, [root, second]);
    addSteamGame(root, '1245620', 'ELDEN RING™', 'ELDEN RING');
    writeExe(path.join(root, 'steamapps', 'common', 'ELDEN RING', 'Game', 'eldenring.exe'), 5 * 1024 * 1024);
    mkdirSync(path.join(second, 'steamapps'), { recursive: true });
    addSteamGame(second, '1030840', 'Mafia: Definitive Edition', 'Mafia');
    addSteamGame(second, '999999', 'Downloading Game', 'Partial', 2);

    const result = new InstalledGamesScanner(roots({ steam: [root] })).scan();
    expect(result.errors).toEqual([]);
    const names = result.games.map((game) => game.name);
    expect(names).toContain('ELDEN RING');
    expect(names).toContain('Mafia: Definitive Edition');
    expect(names).not.toContain('Downloading Game');
    const elden = result.games.find((game) => game.name === 'ELDEN RING');
    expect(elden?.source).toBe('steam');
    expect(elden?.sourceId).toBe('1245620');
    expect(elden?.processCandidates[0]).toBe('eldenring.exe');
  });

  it('picks up the Steam library-cache cover in all three layouts', () => {
    const root = path.join(dir, 'Steam');
    makeSteamRoot(root, [root]);
    addSteamGame(root, '111', 'Flat Cache Game', 'Flat');
    addSteamGame(root, '222', 'Nested Cache Game', 'Nested');
    addSteamGame(root, '333', 'Hashed Cache Game', 'Hashed');
    writeExe(path.join(root, 'appcache', 'librarycache', '111_library_600x900.jpg'), 10);
    writeExe(path.join(root, 'appcache', 'librarycache', '222', 'library_600x900.jpg'), 10);
    writeExe(path.join(root, 'appcache', 'librarycache', '333', 'a3cc5f22', 'library_capsule.jpg'), 10);

    const result = new InstalledGamesScanner(roots({ steam: [root] })).scan();
    const flat = result.games.find((game) => game.sourceId === '111');
    const nested = result.games.find((game) => game.sourceId === '222');
    const hashed = result.games.find((game) => game.sourceId === '333');
    expect(flat?.artwork).toEqual({ kind: 'file', path: path.join(root, 'appcache', 'librarycache', '111_library_600x900.jpg') });
    expect(nested?.artwork).toEqual({ kind: 'file', path: path.join(root, 'appcache', 'librarycache', '222', 'library_600x900.jpg') });
    expect(hashed?.artwork).toEqual({ kind: 'file', path: path.join(root, 'appcache', 'librarycache', '333', 'a3cc5f22', 'library_capsule.jpg') });
  });

  it('hides Steam tooling (Proton, runtimes, redistributables)', () => {
    const root = path.join(dir, 'Steam');
    makeSteamRoot(root, [root]);
    addSteamGame(root, '1', 'Proton Experimental', 'Proton');
    addSteamGame(root, '2', 'Steam Linux Runtime 3.0 (sniper)', 'Sniper');
    addSteamGame(root, '3', 'Steamworks Common Redistributables', 'Redist');
    addSteamGame(root, '4', 'Actual Game', 'Actual');

    const result = new InstalledGamesScanner(roots({ steam: [root] })).scan();
    expect(result.games.map((game) => game.name)).toEqual(['Actual Game']);
  });

  it('reads Epic installs from legendary with Heroic store-cache metadata', () => {
    const heroic = path.join(dir, 'heroic');
    const legendary = path.join(dir, 'legendary');
    mkdirSync(path.join(heroic, 'store_cache'), { recursive: true });
    mkdirSync(legendary, { recursive: true });
    writeFileSync(path.join(heroic, 'store_cache', 'legendary_library.json'), JSON.stringify({
      library: [{ app_name: 'Fortnite', title: 'Fortnite®', art_cover: 'https://cdn.example/fortnite.jpg' }]
    }));
    const installDir = path.join(dir, 'Games', 'Fortnite');
    writeExe(path.join(installDir, 'FortniteClient.exe'), 30 * 1024 * 1024);
    writeFileSync(path.join(legendary, 'installed.json'), JSON.stringify({
      Fortnite: { install_path: installDir, executable: 'FortniteGame\\Binaries\\Win64\\FortniteClient.exe' }
    }));

    const result = new InstalledGamesScanner(roots({ heroic: [heroic], legendary: [legendary] })).scan();
    expect(result.errors).toEqual([]);
    expect(result.games).toHaveLength(1);
    const game = result.games[0];
    expect(game.source).toBe('heroic');
    expect(game.name).toBe('Fortnite');
    expect(game.processCandidates[0]).toBe('FortniteClient.exe');
    expect(game.artwork).toEqual({ kind: 'url', url: 'https://cdn.example/fortnite.jpg' });
  });

  it('reads GOG installs and sideloaded apps', () => {
    const heroic = path.join(dir, 'heroic');
    mkdirSync(path.join(heroic, 'gog_store'), { recursive: true });
    mkdirSync(path.join(heroic, 'store_cache'), { recursive: true });
    mkdirSync(path.join(heroic, 'sideload_apps'), { recursive: true });
    writeFileSync(path.join(heroic, 'gog_store', 'installed.json'), JSON.stringify({
      installed: [{ appName: '123', install_path: path.join(dir, 'Games', 'Witcher') }]
    }));
    writeFileSync(path.join(heroic, 'store_cache', 'gog_library.json'), JSON.stringify({
      games: [{ app_name: '123', title: 'The Witcher 3', art_cover: 'https://cdn.example/witcher.jpg' }]
    }));
    writeFileSync(path.join(heroic, 'sideload_apps', 'library.json'), JSON.stringify({
      games: [{ app_name: 'side-1', title: 'My Sideload', art_cover: 'https://cdn.example/side.jpg', install: { executable: '/games/side/Side.exe' } }]
    }));

    const result = new InstalledGamesScanner(roots({ heroic: [heroic] })).scan();
    const names = result.games.map((game) => game.name).sort();
    expect(names).toEqual(['My Sideload', 'The Witcher 3']);
    const sideload = result.games.find((game) => game.sourceId === 'side-1');
    expect(sideload?.processCandidates).toEqual(['Side.exe']);
  });

  it('dedupes the same game found under two roots and never throws on junk', () => {
    const rootA = path.join(dir, 'SteamA');
    const rootB = path.join(dir, 'SteamB');
    for (const root of [rootA, rootB]) {
      makeSteamRoot(root, [root]);
      addSteamGame(root, '42', 'Same Game', 'Same');
    }
    const heroic = path.join(dir, 'heroic');
    mkdirSync(path.join(heroic, 'gog_store'), { recursive: true });
    writeFileSync(path.join(heroic, 'gog_store', 'installed.json'), 'not json {');

    const result = new InstalledGamesScanner(
      roots({ steam: [rootA, rootB], heroic: [heroic] })
    ).scan();
    expect(result.games.filter((game) => game.name === 'Same Game')).toHaveLength(1);
  });

  it('returns empty for missing roots without errors', () => {
    const result = new InstalledGamesScanner(roots({
      steam: [path.join(dir, 'nope')],
      heroic: [path.join(dir, 'nope2')],
      legendary: [path.join(dir, 'nope3')]
    })).scan();
    expect(result).toEqual({ games: [], errors: [] });
  });
});
