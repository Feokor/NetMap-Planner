import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * После `tauri build --no-bundle` кладёт одиночный exe в release/.
 * Запуск: node scripts/copy-tauri.mjs
 */

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const targetDir = path.join(root, 'src-tauri', 'target', 'release');
if (!existsSync(targetDir)) {
  console.error('Нет src-tauri/target/release — сначала выполните: npm run tauri:build');
  process.exit(1);
}

const exe = readdirSync(targetDir)
  .filter((name) => name.toLowerCase().endsWith('.exe'))
  .map((name) => ({ name, time: statSync(path.join(targetDir, name)).mtimeMs }))
  .sort((a, b) => b.time - a.time)[0];

if (!exe) {
  console.error('В src-tauri/target/release не найден exe');
  process.exit(1);
}

const releaseDir = path.join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const target = path.join(releaseDir, `NetMapPlanner-${pkg.version}-tauri.exe`);
copyFileSync(path.join(targetDir, exe.name), target);
const mb = (statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`готово: ${target} (${mb} МБ, из ${exe.name})`);
