import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../manifest.json', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);

test('manifest and package versions stay aligned', async () => {
  const [manifestText, packageText] = await Promise.all([
    readFile(manifestUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageText);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.js, 'index.js');
  assert.equal(manifest.css, 'style.css');
});
