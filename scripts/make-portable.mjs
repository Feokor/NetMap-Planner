import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

/*
 * Собирает однофайловый portable exe с кэширующей распаковкой:
 *   1. electron-builder уже собрал release/Vibe Netmap-<версия>-win.zip;
 *   2. zip встраивается ресурсом в маленький C#-launcher;
 *   3. launcher распаковывает приложение в %LOCALAPPDATA%\VibeNetmap один раз.
 *
 * Запуск: node scripts/make-portable.mjs (после electron-builder --win zip).
 */

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const appName = pkg.build?.productName ?? pkg.name;
const releaseDir = path.join(root, 'release');

const zipName = `${appName}-${version}-win.zip`;
const zipPath = path.join(releaseDir, zipName);
if (!existsSync(zipPath)) {
  console.error(`Не найден архив ${zipPath}. Сначала выполните: electron-builder --win zip`);
  process.exit(1);
}

const cscCandidates = [
  path.join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const csc = cscCandidates.find((candidate) => existsSync(candidate));
if (!csc) {
  console.error('Не найден csc.exe из .NET Framework 4.x');
  process.exit(1);
}

const template = readFileSync(path.join(root, 'build', 'portable-launcher.cs'), 'utf8')
  .replaceAll('__VERSION__', version)
  .replaceAll('__APP_NAME__', appName);

const workDir = path.join(root, '.tmp');
mkdirSync(workDir, { recursive: true });
const sourcePath = path.join(workDir, 'portable-launcher.cs');
writeFileSync(sourcePath, template, 'utf8');

const outputPath = path.join(releaseDir, `NetMapPlanner-${version}-portable.exe`);
rmSync(outputPath, { force: true });

console.log(`csc: ${csc}`);
console.log(`payload: ${zipName} (${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} МБ)`);

execFileSync(
  csc,
  [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/codepage:65001',
    `/out:${outputPath}`,
    `/resource:${zipPath},app.zip`,
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.IO.Compression.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    sourcePath,
  ],
  { stdio: 'inherit' },
);

const size = statSync(outputPath).size / 1024 / 1024;
console.log(`готово: ${outputPath} (${size.toFixed(1)} МБ)`);

// Оставляем в релизе только актуальные артефакты портативной сборки.
for (const name of readdirSync(releaseDir)) {
  if (name.startsWith('NetMapPlanner-') && name.endsWith('-portable.exe') && name !== path.basename(outputPath)) {
    rmSync(path.join(releaseDir, name), { force: true });
  }
}
