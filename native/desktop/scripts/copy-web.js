'use strict';
// Copies the web app (repo root) into native/desktop/web, the folder served as tgyou://app/.
// Also writes package.json "version" from js/version.js, the single source of the version.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const out = path.resolve(__dirname, '..', 'web');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ['index.html', 'manifest.webmanifest', 'precache.json', 'sw.js', 'css', 'js', 'icons', 'wallpapers', 'fonts']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}

const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(root, 'js', 'version.js'), 'utf8'))[1];
const pkgFile = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log(`web copied, version ${version}`);
