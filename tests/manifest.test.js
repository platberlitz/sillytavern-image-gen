import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../manifest.json', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);
const packageLockUrl = new URL('../package-lock.json', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);
const serverPackageUrl = new URL('../server-plugin/package.json', import.meta.url);
const serverReadmeUrl = new URL('../server-plugin/README.md', import.meta.url);
const serverIndexUrl = new URL('../server-plugin/index.js', import.meta.url);
const projectUrl = new URL('../', import.meta.url);
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

test('manifest metadata and package versions are valid and aligned', async () => {
  const [manifestText, packageText, packageLockText, readmeText, serverPackageText, serverReadmeText, serverIndexText] = await Promise.all([
    readFile(manifestUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
    readFile(packageLockUrl, 'utf8'),
    readFile(readmeUrl, 'utf8'),
    readFile(serverPackageUrl, 'utf8'),
    readFile(serverReadmeUrl, 'utf8'),
    readFile(serverIndexUrl, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageText);
  const packageLock = JSON.parse(packageLockText);
  const serverPackage = JSON.parse(serverPackageText);

  assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest));
  assert.ok(typeof manifest.display_name === 'string' && manifest.display_name.trim());
  assert.ok(typeof manifest.author === 'string' && manifest.author.trim());
  assert.ok(Number.isInteger(manifest.loading_order));
  assert.ok(Array.isArray(manifest.requires));
  assert.ok(Array.isArray(manifest.optional));
  assert.equal(typeof manifest.auto_update, 'boolean');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_client_version, '1.12.0');
  assert.match(readmeText, /SillyTavern 1\.12\.0 or newer/);
  assert.match(manifest.version, semverPattern);
  assert.match(packageJson.version, semverPattern);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(packageJson.version, '2.8.0');
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.equal(packageJson.engines.node, '^20.19.0 || ^22.13.0 || >=24.0.0');
  assert.equal(packageLock.packages[''].engines.node, packageJson.engines.node);
  assert.match(readmeText, /\^20\.19\.0 \|\| \^22\.13\.0 \|\| >=24\.0\.0/);
  assert.equal(serverPackage.version, '0.2.0');
  assert.match(serverIndexText, /protocolVersion: PROTOCOL_VERSION/);
  assert.match(serverIndexText, /require\("\.\/package\.json"\)\.version/);
  assert.match(serverPackage.version, semverPattern);
  assert.match(readmeText, /server relay protocol `0\.2\.0`/);
  assert.match(serverReadmeText, /protocol version `0\.2\.0`/);
  assert.match(serverReadmeText, /Quick Image Gen `2\.8\.0`/);

  for (const releasePath of ['lib/', 'server-plugin/', 'scripts/', 'tests/']) {
    assert.ok(packageJson.files.includes(releasePath), `package files must include ${releasePath}`);
  }

  for (const file of [
    'server-plugin/pre-parser.js',
    'server-plugin/relay-guards.js',
    'server-plugin/response-limit.js',
    'scripts/check-js-syntax.js',
    'tests/server-relay-guards.test.js',
    'tests/server-relay-routes.test.js',
  ]) {
    const fileStats = await stat(new URL(file, projectUrl));
    assert.ok(fileStats.isFile(), `release module does not exist: ${file}`);
  }

  for (const [field, extension] of [['js', '.js'], ['css', '.css']]) {
    const declaration = manifest[field];
    const files = Array.isArray(declaration) ? declaration : [declaration];
    assert.ok(files.length > 0, `manifest.${field} must declare at least one file`);

    for (const file of files) {
      assert.ok(typeof file === 'string' && file.trim(), `manifest.${field} entries must be non-empty strings`);
      assert.ok(file.endsWith(extension), `manifest.${field} entry must end in ${extension}: ${file}`);
      const fileStats = await stat(new URL(file, projectUrl));
      assert.ok(fileStats.isFile(), `manifest.${field} file does not exist: ${file}`);
    }
  }
});
