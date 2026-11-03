import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('bumpp updates both manifests without commits, tags, pushes or lifecycle scripts', async () => {
  const project = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(project.devDependencies.bumpp);
  assert.equal(project.devDependencies.semver, undefined);
  const [binary, ...args] = project.scripts['version:bump'].split(' ');
  assert.equal(binary, 'bumpp');
  for (const flag of ['--no-commit', '--no-tag', '--no-push', '--ignore-scripts'])
    assert.ok(args.includes(flag));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'athena-bumpp-test-'));
  const runGit = (...gitArgs: string[]) => {
    const result = spawnSync('git', gitArgs, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    const fixture = {
      name: 'athena-bump-fixture',
      version: '0.7.0',
      private: true,
      scripts: { preversion: 'exit 99', version: 'exit 99', postversion: 'exit 99' },
    };
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(fixture, null, 2) + '\n');
    await writeFile(
      path.join(directory, 'package-lock.json'),
      JSON.stringify(
        {
          name: fixture.name,
          version: '0.7.0',
          lockfileVersion: 3,
          packages: {
            '': { name: fixture.name, version: '0.7.0' },
            'node_modules/fixture': { version: '1.2.3' },
          },
        },
        null,
        2,
      ) + '\n',
    );
    runGit('init', '--quiet');
    runGit('add', 'package.json', 'package-lock.json');
    runGit(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    const head = runGit('rev-parse', 'HEAD');
    const result = spawnSync(
      process.execPath,
      [
        await realpath(path.join(root, 'node_modules/.bin/bumpp')),
        ...args,
        '--release',
        'patch',
        '--yes',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 30_000, env: { ...process.env, CI: 'true' } },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.version, '0.7.1', result.stdout + result.stderr);
    assert.equal(lock.version, '0.7.1');
    assert.equal(lock.packages[''].version, '0.7.1');
    assert.equal(lock.packages['node_modules/fixture'].version, '1.2.3');
    assert.deepEqual(manifest.scripts, fixture.scripts);
    assert.equal(runGit('rev-parse', 'HEAD'), head);
    assert.equal(runGit('tag', '--list'), '');
    assert.deepEqual(runGit('diff', '--name-only').split('\n').sort(), [
      'package-lock.json',
      'package.json',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
