// Cuts a release: bump the version, move the changelog, rebuild the precache, commit and tag.
//   npm run release -- patch | minor | major | 1.2.3
// Nothing is pushed. Afterwards:  git push origin main --follow-tags   → CI builds APK, Windows app and the site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
const die = (m) => { console.error('✗ ' + m); process.exit(1); };

const arg = process.argv[2];
if (!arg) die('usage: npm run release -- patch|minor|major|<x.y.z>');
if (sh('git status --porcelain')) die('the working tree is not clean: commit or stash first');
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') die(`releases are cut from main (you are on ${branch})`);

const versionFile = path.join(root, 'js/version.js');
const src = fs.readFileSync(versionFile, 'utf8');
const current = /APP_VERSION\s*=\s*'([^']+)'/.exec(src)[1];
const [maj, min, pat] = current.split('.').map(Number);
const next = { patch: `${maj}.${min}.${pat + 1}`, minor: `${maj}.${min + 1}.0`, major: `${maj + 1}.0.0` }[arg] || arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) die(`bad version "${next}"`);
if (sh(`git tag -l v${next}`)) die(`tag v${next} already exists`);

console.log(`${current} → ${next}\nrunning the tests…`);
try { execSync('npm test', { cwd: root, stdio: 'inherit' }); } catch { die('tests failed, nothing was changed'); }

fs.writeFileSync(versionFile, src.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${next}'`));
const swFile = path.join(root, 'sw.js');
fs.writeFileSync(swFile, fs.readFileSync(swFile, 'utf8').replace(/const SW_VERSION = '[^']*';/, `const SW_VERSION = '${next}';`));
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); pkg.version = next;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
const dpkgFile = path.join(root, 'native/desktop/package.json');
const dpkg = JSON.parse(fs.readFileSync(dpkgFile, 'utf8')); dpkg.version = next;
fs.writeFileSync(dpkgFile, JSON.stringify(dpkg, null, 2) + '\n');

const logFile = path.join(root, 'CHANGELOG.md');
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(logFile, fs.readFileSync(logFile, 'utf8').replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${next}] - ${date}`));

execSync('node tools/build-precache.mjs', { cwd: root, stdio: 'inherit' });
sh('git add -A');
sh(`git commit -m "Release v${next}"`);
sh(`git tag -a v${next} -m "Telegram You ${next}"`);
console.log(`\n✓ committed and tagged v${next}\n  publish:  git push origin main --follow-tags\n  undo:     git tag -d v${next} && git reset --hard HEAD~1   (before pushing)`);
