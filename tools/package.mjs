/** Produce a clean unpacked extension directory and a ZIP for distribution. */
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(projectRoot, 'manifest.json'), 'utf8'));
const distRoot = join(projectRoot, 'dist');
const extensionRoot = join(distRoot, 'scholar-rank');
const archiveName = `scholar-rank-${manifest.version}.zip`;
mkdirSync(distRoot, { recursive: true });
rmSync(extensionRoot, { recursive: true, force: true });
mkdirSync(extensionRoot);
copyFileSync(join(projectRoot, 'manifest.json'), join(extensionRoot, 'manifest.json'));
for (const directory of ['src', 'icons']) cpSync(join(projectRoot, directory), join(extensionRoot, directory), { recursive: true });
const required = [manifest.options_page, manifest.action.default_popup, ...Object.values(manifest.icons)];
for (const script of manifest.content_scripts) required.push(...script.js, ...script.css);
for (const name of ['ccf', 'core', 'journals', 'aliases']) required.push(`src/data/${name}.json`);
for (const file of required) if (!existsSync(join(extensionRoot, file))) throw new Error(`Missing packaged resource: ${file}`);
writeFileSync(join(extensionRoot, 'INSTALL.txt'), 'Scholar Rank '+manifest.version+'\n\nOpen chrome://extensions/, enable Developer mode, click Load unpacked and select this folder. Refresh Google Scholar after loading.\n');
rmSync(join(distRoot, archiveName), { force: true });
execFileSync('zip', ['-qr', archiveName, 'scholar-rank'], { cwd: distRoot });
console.log(`Unpacked extension: ${extensionRoot}`);
console.log(`Distribution ZIP: ${join(distRoot, archiveName)}`);
