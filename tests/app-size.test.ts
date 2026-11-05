import asar from '@electron/asar';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { minimatch } from 'minimatch';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/measure-app-size.mjs');

async function fixtureApp(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'athena-app-size-test-'));
  const app = path.join(directory, 'Athena.app');
  const staging = path.join(directory, 'staging');
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(staging, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  const framework = path.join(app, 'Contents/Frameworks/Electron Framework.framework');
  await mkdir(framework, { recursive: true });
  await writeFile(path.join(framework, 'Electron'), 'framework');
  await mkdir(path.join(app, 'Contents/Resources'), { recursive: true });
  await asar.createPackage(staging, path.join(app, 'Contents/Resources/app.asar'));
  return { directory, app };
}

function measure(app: string, assertNoRedundancy = false) {
  return spawnSync(
    process.execPath,
    [
      script,
      '--app',
      app,
      '--label',
      'fixture',
      '--signature',
      'ad-hoc',
      '--commit',
      'fixture-commit',
      ...(assertNoRedundancy ? ['--assert-no-redundancy'] : []),
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
}

test('app size report separates frameworks, bundles, licenses and sourcemaps', async () => {
  const { directory, app } = await fixtureApp({
    'dist/main/main.cjs': 'main',
    'dist/main/main.cjs.map': 'map',
    'dist/renderer/index.js': 'renderer',
    'node_modules/fixture/LICENSE': 'license',
    'node_modules/fixture/License-MIT': 'license-2',
    'node_modules/fixture/index.js': 'code',
    'resources/icon.txt': 'icon',
  });
  try {
    const result = measure(app, false);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const archiveBytes = (await stat(path.join(app, 'Contents/Resources/app.asar'))).size;
    assert.equal(report.appBytes, archiveBytes + 'framework'.length);
    assert.equal(report.breakdown.electronFrameworkBytes, 'framework'.length);
    assert.equal(report.breakdown.appAsarBytes, archiveBytes);
    assert.equal(report.asar.categories.nodeModuleCode, 'code'.length);
    assert.equal(
      report.asar.categories.nodeModuleLicenses,
      'license'.length + 'license-2'.length,
    );
    assert.equal(report.asar.categories.sourcemaps, 'map'.length);
    assert.equal(report.asar.categories.distMain, 'main'.length + 'map'.length);
    assert.equal(report.asar.categories.distRenderer, 'renderer'.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('package redundancy assertion accepts license-only dependencies and rejects code or maps', async () => {
  const clean = await fixtureApp({
    'dist/main/main.cjs': 'main',
    'node_modules/fixture/LICENSE': 'license',
  });
  try {
    const result = measure(clean.app, true);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).asar.categories.nodeModuleCode, 0);
  } finally {
    await rm(clean.directory, { recursive: true, force: true });
  }

  const redundant = await fixtureApp({
    'dist/main/main.cjs.map': 'map',
    'node_modules/fixture/index.js': 'code',
  });
  try {
    const result = measure(redundant.app, true);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-license files/);
    assert.match(result.stderr, /sourcemaps/);
  } finally {
    await rm(redundant.directory, { recursive: true, force: true });
  }
});

test('distribution files preserve license spelling and suffix variants only', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const patterns = manifest.build.files as string[];
  const selected = (file: string) => {
    let included = true;
    for (const pattern of patterns) {
      const negative = pattern.startsWith('!');
      if (minimatch(file, negative ? pattern.slice(1) : pattern, { dot: true }))
        included = !negative;
    }
    return included;
  };
  for (const file of [
    'node_modules/fixture/LICENSE',
    'node_modules/fixture/License',
    'node_modules/fixture/license.txt',
    'node_modules/fixture/LICENSE-MPL',
    'node_modules/fixture/LICENSE-MIT.txt',
    'node_modules/fixture/LICENCE',
    'node_modules/fixture/Notice',
    'node_modules/fixture/COPYING-GPL',
  ])
    assert.equal(selected(file), true, `${file} must be distributed`);
  assert.equal(selected('node_modules/fixture/index.js'), false);
  assert.equal(selected('node_modules/fixture/package.json'), false);
  assert.equal(selected('dist/main/main.cjs.map'), false);
});

test('measurement refuses to label an uncommitted source tree as a clean commit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'athena-app-size-git-'));
  try {
    await mkdir(path.join(directory, 'scripts'));
    await copyFile(script, path.join(directory, 'scripts/measure-app-size.mjs'));
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    await writeFile(path.join(directory, 'tracked.txt'), 'base');
    const git = (args: string[]) =>
      spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(git(['init', '--quiet']).status, 0);
    assert.equal(git(['config', 'user.email', 'fixture@example.invalid']).status, 0);
    assert.equal(git(['config', 'user.name', 'Fixture']).status, 0);
    assert.equal(git(['config', 'commit.gpgsign', 'false']).status, 0);
    assert.equal(git(['add', 'tracked.txt']).status, 0);
    assert.equal(git(['commit', '--quiet', '-m', 'fixture']).status, 0);
    await writeFile(path.join(directory, 'tracked.txt'), 'dirty');
    const app = await fixtureApp({ 'dist/main/main.cjs': 'main' });
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(directory, 'scripts/measure-app-size.mjs'), '--app', app.app],
        { encoding: 'utf8', timeout: 30_000 },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Uncommitted changes/);
    } finally {
      await rm(app.directory, { recursive: true, force: true });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
