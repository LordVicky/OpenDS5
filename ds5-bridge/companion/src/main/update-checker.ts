export type ReleaseAsset = { name: string; url: string; size: number };

export type Release = {
  version: string;
  notes: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'offer'; version: string; notes: string; appImage: ReleaseAsset; sha256: ReleaseAsset };

function parts(version: string): { numbers: number[]; prerelease: string | null } {
  const [core, prerelease = null] = version.replace(/^v/, '').split('-', 2);
  const numbers = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (numbers.length < 3) numbers.push(0);
  return { numbers, prerelease };
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  // Equal cores: a prerelease ranks below the release it leads to (1.8.0-beta.1 < 1.8.0).
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

export function decideUpdate(input: {
  release: Release | null;
  currentVersion: string;
  skippedVersions: readonly string[];
}): UpdateDecision {
  const { release, currentVersion, skippedVersions } = input;
  if (!release) return { kind: 'none' };
  if (release.draft || release.prerelease) return { kind: 'none' };
  if (skippedVersions.includes(release.version)) return { kind: 'none' };
  if (compareVersions(release.version, currentVersion) <= 0) return { kind: 'none' };

  const appImage = release.assets.find((a) => a.name.endsWith('.AppImage'));
  const sha256 = release.assets.find((a) => a.name.endsWith('.AppImage.sha256'));
  if (!appImage || !sha256) return { kind: 'none' };

  return { kind: 'offer', version: release.version, notes: release.notes, appImage, sha256 };
}
