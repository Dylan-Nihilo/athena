import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('repository registry configuration delegates authentication to user configuration', async () => {
  const content = await readFile(new URL('../.npmrc', import.meta.url), 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith(';'));
  assert.ok(lines.includes('@hugeicons-pro:registry=https://npm.collectui.pro/'));
  assert.equal(
    lines.some((line) => /_auth|_password|username\s*=|HUGEICONS_NPM_TOKEN/i.test(line)),
    false,
  );
});
