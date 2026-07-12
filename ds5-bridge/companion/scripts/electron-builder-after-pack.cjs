const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { rcedit } = require('rcedit');
const appPackage = require('../package.json');

function gitValue(repoDir, args, fallback = 'unknown') {
  try {
    return execSync(`git ${args}`, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function sourceNotice(repoDir) {
  const commit = gitValue(repoDir, 'rev-parse HEAD');
  const dirty = gitValue(repoDir, 'status --porcelain', '') ? 'yes' : 'no';
  return [
    'DS5 Bridge source code:',
    'https://github.com/SundayMoments/DS5_Bridge',
    '',
    `This binary release corresponds to commit: ${commit}`,
    `Working tree dirty at build time: ${dirty}`,
    '',
    'License:',
    'GNU Affero General Public License v3.0 only',
    'See LICENSE and NOTICE.'
  ].join('\n') + '\n';
}

// The in-tree dkms.conf ships PACKAGE_VERSION="unknown" and the installer's
// fallbacks can't resolve it from a packaged app: generate-version.sh is
// git-describe based (and isn't bundled anyway), and OPENDS5_MODULE_VERSION is
// only set when the installer runs from the companion. A direct
// `sudo opends5-install` therefore landed on the 0.0.0 last resort. Stamp the
// real version into the staged copy so dkms.conf is self-describing; the
// in-tree file stays "unknown" so repo builds still resolve via git.
function stampModuleVersion(context) {
  const dkmsConf = path.join(context.appOutDir, 'resources', 'vds-module', 'dkms.conf');
  if (!fs.existsSync(dkmsConf)) {
    return;
  }
  const version = context.packager.appInfo.version;
  const stamped = fs
    .readFileSync(dkmsConf, 'utf8')
    .replace(/^PACKAGE_VERSION=.*$/m, `PACKAGE_VERSION="${version}"`);
  if (!stamped.includes(`PACKAGE_VERSION="${version}"`)) {
    throw new Error(`afterPack: failed to stamp PACKAGE_VERSION into ${dkmsConf}`);
  }
  fs.writeFileSync(dkmsConf, stamped, 'utf8');
}

exports.default = async function afterPack(context) {
  const isWindows = context.electronPlatformName === 'win32';
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const repoDir = path.resolve(__dirname, '..', '..');
  const appIcon = path.join(repoDir, 'assets', 'controllers', 'ds5-bridge_app-icon-tile.ico');

  fs.copyFileSync(path.join(repoDir, 'LICENSE'), path.join(context.appOutDir, 'LICENSE'));
  fs.copyFileSync(path.join(repoDir, 'NOTICE'), path.join(context.appOutDir, 'NOTICE'));
  fs.writeFileSync(path.join(context.appOutDir, 'SOURCE.txt'), sourceNotice(repoDir), 'utf8');

  stampModuleVersion(context);

  if (!isWindows) {
    return;
  }
  await rcedit(exePath, {
    icon: appIcon,
    'file-version': appPackage.version,
    'product-version': appPackage.version,
    'version-string': {
      FileDescription: 'DS5 Bridge Companion',
      InternalName: 'DS5 Bridge',
      OriginalFilename: 'DS5 Bridge.exe',
      ProductName: 'DS5 Bridge'
    }
  });
};
