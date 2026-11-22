import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/*
 * Генерирует ключ подписи Android (release) и android/keystore.properties.
 * Ключ и пароль лежат локально и в git не попадают (.gitignore).
 *
 *   npm run android:key            # создать ключ
 *   npm run android:key -- --force # пересоздать (старый APK перестанет обновляться)
 *
 * Пароль можно задать заранее: NETMAP_KEYSTORE_PASSWORD=...
 */

const root = process.cwd();
const force = process.argv.includes('--force');
const keystoreDir = path.join(root, 'android', 'keystore');
const keystorePath = path.join(keystoreDir, 'netmap-release.jks');
const propertiesPath = path.join(root, 'android', 'keystore.properties');

if (existsSync(keystorePath) && !force) {
  console.error(`Ключ уже есть: ${keystorePath}`);
  console.error('Если действительно нужно пересоздать — npm run android:key -- --force');
  process.exit(1);
}

const jdkCandidates = [
  path.join(root, '.tools', 'jdk21', 'jdk-21.0.13+9', 'bin', 'keytool.exe'),
  path.join(root, '.tools', 'jdk21', 'bin', 'keytool.exe'),
];
const keytool = jdkCandidates.find((candidate) => existsSync(candidate)) ?? 'keytool';

const password =
  process.env.NETMAP_KEYSTORE_PASSWORD ?? randomBytes(24).toString('base64url');
const alias = 'netmap';

mkdirSync(keystoreDir, { recursive: true });
console.log(`keytool: ${keytool}`);
execFileSync(
  keytool,
  [
    '-genkeypair',
    '-v',
    '-keystore',
    keystorePath,
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '4096',
    '-validity',
    '10000',
    '-storepass',
    password,
    '-keypass',
    password,
    '-dname',
    'CN=NetMap Planner, OU=Mobile, O=Feokor, L=Moscow, C=RU',
  ],
  { stdio: 'inherit' },
);

const properties = [
  '# Локальный ключ подписи Android. Не коммитить и хранить в надёжном месте!',
  '# Потеря ключа = невозможность обновить установленное приложение.',
  'storeFile=keystore/netmap-release.jks',
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n');
writeFileSync(propertiesPath, properties, 'utf8');

console.log(`готово: ${keystorePath}`);
console.log(`пароль и alias: ${propertiesPath}`);
console.log('Сохраните ключ и пароль в надёжном месте — в git они не попадут.');
