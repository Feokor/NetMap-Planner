import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * Собирает подписанный release APK:
 *   npm run android:key   # один раз
 *   npm run android:release
 *
 * Нужны JAVA_HOME (JDK 21) и ANDROID_HOME, как для android:apk.
 */

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const properties = path.join(root, 'android', 'keystore.properties');
if (!existsSync(properties)) {
  console.error('Нет android/keystore.properties. Сначала выполните: npm run android:key');
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const npmArgs = (args) =>
  process.platform === 'win32' ? ['/c', 'npm.cmd', ...args] : args;
console.log('==> синхронизация веб-сборки');
execFileSync(npm, npmArgs(['run', 'android:sync']), { stdio: 'inherit', cwd: root });

const androidDir = path.join(root, 'android');
console.log('==> gradle assembleRelease');
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'gradlew.bat', 'assembleRelease'], {
    stdio: 'inherit',
    cwd: androidDir,
  });
} else {
  execFileSync('./gradlew', ['assembleRelease'], { stdio: 'inherit', cwd: androidDir });
}

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) {
  console.error(`Не найден ${apk}`);
  process.exit(1);
}
const releaseDir = path.join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const target = path.join(releaseDir, `NetMapPlanner-${pkg.version}-release.apk`);
copyFileSync(apk, target);

/* apksigner лежит в build-tools; если он есть — покажем сертификат. */
try {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (sdk) {
    const buildTools = path.join(sdk, 'build-tools');
    const versions = existsSync(buildTools)
      ? readdirSync(buildTools)
          .map((name) => ({ name, time: statSync(path.join(buildTools, name)).mtimeMs }))
          .sort((a, b) => b.time - a.time)
      : [];
    const apksigner = versions
      .map((item) => path.join(buildTools, item.name, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'))
      .find((candidate) => existsSync(candidate));
    if (apksigner) {
      if (process.platform === 'win32') {
        execFileSync('cmd.exe', ['/c', apksigner, 'verify', '--print-certs', target], {
          stdio: 'inherit',
        });
      } else {
        execFileSync(apksigner, ['verify', '--print-certs', target], { stdio: 'inherit' });
      }
    }
  }
} catch (error) {
  console.warn('apksigner verify пропущен:', error instanceof Error ? error.message : error);
}

const size = (statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`готово: ${target} (${size} МБ)`);
