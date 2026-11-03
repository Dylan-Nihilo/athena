import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { build } = require('../package.json');
const signed = require('../scripts/electron-builder.signed.cjs');

test('Developer ID configuration preserves identity compatibility and local packaging', () => {
  assert.equal(build.mac.identity, '-');
  assert.equal(build.mac.hardenedRuntime, false);
  assert.equal(signed.appId, build.appId);
  assert.equal(signed.mac.identity, undefined);
  assert.equal(signed.forceCodeSigning, true);
  assert.equal(signed.mac.type, 'distribution');
  assert.equal(signed.mac.hardenedRuntime, true);
  assert.equal(signed.mac.notarize, false);
  assert.equal(signed.mac.entitlements, 'resources/entitlements.mac.plist');
  assert.notEqual(signed.directories.output, build.directories.output);
});

test('release refuses to silently omit notarization', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./scripts/electron-builder.release.cjs')"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, APPLE_KEYCHAIN_PROFILE: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set APPLE_KEYCHAIN_PROFILE/);
});

test('release enables notarization with a Keychain profile', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "console.log(JSON.stringify(require('./scripts/electron-builder.release.cjs')))"],
    {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, APPLE_KEYCHAIN_PROFILE: 'test-profile-only' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const release = JSON.parse(result.stdout);
  assert.equal(release.mac.notarize, true);
  assert.equal(release.dmg.sign, true);
  assert.equal(release.forceCodeSigning, true);
  assert.notEqual(release.directories.output, signed.directories.output);
});
