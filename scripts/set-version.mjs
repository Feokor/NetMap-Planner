import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/*
 * Меняет версию сразу в package.json и android/app/build.gradle:
 *   npm run version:set -- 0.2.0-alpha.1
 *
 * versionCode для Android считается как major*10000 + minor*100 + patch —
 * так он монотонно растёт и не зависит от prerelease-суффикса.
 */

const next = process.argv[2];
if (!next) {
  console.error('Укажите версию: npm run version:set -- 0.2.0-alpha.1');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error(`Некорректная версия "${next}". Ожидается semver: 0.2.0, 0.2.0-alpha.1, 1.0.0-rc.1`);
  process.exit(1);
}

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

const [major, minor, patch] = next.split('-')[0].split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const gradle = readFileSync(gradlePath, 'utf8');
const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${next}"`);
writeFileSync(gradlePath, updated, 'utf8');

console.log(`версия: ${previous} -> ${next}`);
console.log(`android: versionCode ${versionCode}, versionName "${next}"`);
