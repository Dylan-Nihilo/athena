import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  parseOptions,
  assertRepository,
  confirmUpload,
  replaceAssets,
  localArtifacts,
  sha256,
} = require('../scripts/upload-release.mjs');

function fixture() {
  const events: string[] = [];
  const artifacts = [
    { name: 'app.dmg', file: '/local/app.dmg', size: 10, digest: 'sha256:dmg' },
    { name: 'app.zip', file: '/local/app.zip', size: 20, digest: 'sha256:zip' },
    { name: 'SHA256SUMS.txt', file: '/local/SHA256SUMS.txt', size: 30, digest: 'sha256:sums' },
  ];
  const release = { id: 7, assets: artifacts.map((a, i) => ({ id: i + 1, name: a.name })) };
  const api = {
    upload: async (_release: number, name: string, file: string) => {
      events.push(`upload:${name}`);
      const i = artifacts.findIndex((a) => a.file === file);
      return { id: 100 + i, size: artifacts[i].size, digest: artifacts[i].digest };
    },
    rename: async (id: number, name: string) => {
      events.push(`rename:${id}:${name}`);
    },
    remove: async (id: number) => {
      events.push(`delete:${id}`);
    },
  };
  const options = {
    release,
    artifacts,
    replace: true,
    api,
    nonce: 'test',
    log: () => {},
    save: async () => {},
    verifyPublic: async (a: { name: string }) => {
      events.push(`verify:${a.name}`);
    },
  };
  return { events, options };
}

test('upload requires an explicit repository, matching version, and explicit redirect consent', () => {
  assert.throws(() => parseOptions([], '0.7.0'), /--repo/);
  assert.throws(
    () => parseOptions(['--token=private-value'], '0.7.0'),
    (error: Error) => !error.message.includes('private-value'),
  );
  assert.throws(
    () => parseOptions(['--repo', 'owner/repo', '--tag', 'v0.6.0'], '0.7.0'),
    /version/,
  );
  assert.throws(() => parseOptions(['--repo', 'https://github.com/a/b'], '0.7.0'), /--repo/);
  const options = parseOptions(['--repo', 'owner/repo', '--dry-run', '--replace'], '0.7.0');
  assert.equal(options.repo, 'owner/repo');
  assert.equal(options['dry-run'], true);
  assert.equal(options.replace, true);
  assert.throws(() => assertRepository('old/repo', 'new/repo', false), /resolves to/);
  assert.doesNotThrow(() => assertRepository('old/repo', 'new/repo', true));
  assert.doesNotThrow(() => assertRepository('Owner/Repo', 'owner/repo', false));
});

test('CI confirmation requires both --yes and an explicit matching --tag', () => {
  assert.throws(() => parseOptions(['--repo', 'owner/repo', '--yes'], '0.7.0'), /explicit --tag/);
  assert.equal(
    parseOptions(['--repo', 'owner/repo', '--yes', '--tag', 'v0.7.0'], '0.7.0').yes,
    true,
  );
  assert.throws(
    () => parseOptions(['--repo', 'owner/repo', '--yes', '--tag', 'v0.8.0'], '0.7.0'),
    /match/,
  );
});

test('interactive confirmation requires retyping the exact target version', async () => {
  const confirmation = { tag: 'v0.7.0', interactive: true, ask: async () => ' v0.7.0 ' };
  await confirmUpload(confirmation);
  for (const answer of ['', 'yes', 'v0.8.0', '0.7.0']) {
    await assert.rejects(
      confirmUpload({ ...confirmation, ask: async () => answer }),
      /cancelled or mismatched/,
    );
  }
  await assert.rejects(
    confirmUpload({
      ...confirmation,
      ask: async () => {
        throw new Error('EOF');
      },
    }),
    /EOF/,
  );
});

test('noninteractive uploads fail closed; dry-run and explicit CI confirmation never prompt', async () => {
  const confirmation = {
    tag: 'v0.7.0',
    interactive: false,
    ask: async () => {
      throw new Error('must not prompt');
    },
  };
  await assert.rejects(confirmUpload(confirmation), /interactive terminal/);
  await confirmUpload({ ...confirmation, dryRun: true });
  await confirmUpload({ ...confirmation, yes: true });
});

test('existing assets are never replaced without --replace', async () => {
  const { events, options } = fixture();
  await assert.rejects(replaceAssets({ ...options, replace: false }), /--replace/);
  assert.deepEqual(events, []);
});

test('all uploads precede switching names, all public checks precede deleting backups', async () => {
  const { events, options } = fixture();
  const state = await replaceAssets(options);
  assert.equal(state.complete, true);
  assert.equal(state.verified, true);
  assert.deepEqual(events.slice(0, 3), [
    'upload:pending-test-app.dmg',
    'upload:pending-test-app.zip',
    'upload:pending-test-SHA256SUMS.txt',
  ]);
  assert.deepEqual(events.slice(-6), [
    'verify:app.dmg',
    'verify:app.zip',
    'verify:SHA256SUMS.txt',
    'delete:1',
    'delete:2',
    'delete:3',
  ]);
  assert.ok(events.includes('rename:1:previous-test-app.dmg'));
  assert.ok(events.includes('rename:100:app.dmg'));
});

test('failed upload does not rename or delete public assets', async () => {
  const { events, options } = fixture();
  const upload = options.api.upload;
  options.api.upload = async (id, name, file) => {
    if (file.endsWith('.zip')) throw new Error('network failure');
    return upload(id, name, file);
  };
  await assert.rejects(replaceAssets(options), /network failure/);
  assert.equal(events.length, 1);
  assert.ok(events[0].startsWith('upload:'));
});

test('GitHub size/digest mismatch is recorded and stops before replacing names', async () => {
  const { events, options } = fixture();
  let savedIds: number[] = [];
  const upload = options.api.upload;
  options.api.upload = async (...args) => ({ ...(await upload(...args)), digest: 'sha256:wrong' });
  const save = async (state: { uploaded: { id: number }[] }) => {
    savedIds = state.uploaded.map((a) => a.id);
  };
  await assert.rejects(replaceAssets({ ...options, save }), /size\/digest mismatch/);
  assert.deepEqual(savedIds, [100]);
  assert.equal(events.length, 1);
});

test('failed public download verification retains every previous asset', async () => {
  const { events, options } = fixture();
  await assert.rejects(
    replaceAssets({
      ...options,
      verifyPublic: async () => {
        throw new Error('checksum mismatch');
      },
    }),
    /checksum mismatch/,
  );
  assert.equal(events.filter((e) => e.startsWith('delete:')).length, 0);
  assert.equal(events.filter((e) => e.includes('previous-test-')).length, 3);
});

test('failed rename retains backups and makes no automatic write retries', async () => {
  const { events, options } = fixture();
  const rename = options.api.rename;
  let attempts = 0;
  options.api.rename = async (id, name) => {
    if (id === 100) {
      attempts++;
      throw new Error('rename failed');
    }
    return rename(id, name);
  };
  await assert.rejects(replaceAssets(options), /rename failed/);
  assert.equal(attempts, 1);
  assert.equal(events.filter((e) => e.startsWith('delete:')).length, 0);
});

test('checksum preflight rejects modified or incomplete artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'athena-upload-test-'));
  try {
    const dmg = 'Athena-0.7.0-mac-arm64.dmg';
    const zip = 'Athena-0.7.0-mac-arm64.zip';
    await writeFile(path.join(directory, dmg), 'signed-dmg-fixture');
    await writeFile(path.join(directory, zip), 'signed-zip-fixture');
    const sums = `${await sha256(path.join(directory, dmg))}  ${dmg}\n${await sha256(path.join(directory, zip))}  ${zip}\n`;
    await writeFile(path.join(directory, 'SHA256SUMS.txt'), sums);
    assert.equal((await localArtifacts(directory, '0.7.0')).length, 3);
    await writeFile(path.join(directory, dmg), 'modified');
    await assert.rejects(localArtifacts(directory, '0.7.0'), /Checksum mismatch/);
    await writeFile(path.join(directory, 'SHA256SUMS.txt'), sums + sums);
    await assert.rejects(localArtifacts(directory, '0.7.0'), /exactly/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
