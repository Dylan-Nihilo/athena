import asar from '@electron/asar';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
  const options = { assertNoRedundancy: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--assert-no-redundancy') {
      options.assertNoRedundancy = true;
      continue;
    }
    const key = {
      '--app': 'app',
      '--dmg': 'dmg',
      '--zip': 'zip',
      '--output': 'output',
      '--label': 'label',
      '--signature': 'signature',
      '--commit': 'commit',
    }[argument];
    if (!key || !argv[index + 1]) {
      throw new Error(
        'Usage: node scripts/measure-app-size.mjs --app APP [--dmg DMG] [--zip ZIP] [--output JSON] [--label NAME] [--signature ad-hoc|Developer-ID] [--commit REV] [--assert-no-redundancy]',
      );
    }
    options[key] = argv[++index];
  }
  if (!options.app) throw new Error('--app is required.');
  return options;
}

function walkSize(target) {
  const stat = lstatSync(target);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  return readdirSync(target).reduce((total, entry) => total + walkSize(path.join(target, entry)), 0);
}

function fileSize(target) {
  return target ? statSync(target).size : undefined;
}

function resolveCommit(explicitCommit) {
  if (explicitCommit) return explicitCommit;
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git(['status', '--porcelain']))
    throw new Error(
      'Uncommitted changes detected. Pass --commit with an explicit source revision or dirty-tree label.',
    );
  return git(['rev-parse', 'HEAD']);
}

function isLicenseFile(relativePath) {
  return /^(?:LICENSE|LICENCE|NOTICE|COPYING)(?:[.-]|$)/i.test(path.basename(relativePath));
}

function analyzeAsar(archivePath) {
  const categories = {
    nodeModules: 0,
    nodeModuleCode: 0,
    nodeModuleLicenses: 0,
    distMain: 0,
    distRenderer: 0,
    resources: 0,
    sourcemaps: 0,
    other: 0,
  };
  const packages = new Map();
  let logicalBytes = 0;
  for (const entry of asar.listPackage(archivePath)) {
    const relativePath = entry.replace(/^\/+/, '');
    const stat = asar.statFile(archivePath, relativePath);
    if (!stat.size) continue;
    const size = stat.size;
    logicalBytes += size;
    if (relativePath.endsWith('.map')) categories.sourcemaps += size;
    if (relativePath.startsWith('node_modules/')) {
      categories.nodeModules += size;
      categories[isLicenseFile(relativePath) ? 'nodeModuleLicenses' : 'nodeModuleCode'] += size;
      const parts = relativePath.split('/');
      const name = parts[1]?.startsWith('@') ? `${parts[1]}/${parts[2]}` : parts[1];
      packages.set(name, (packages.get(name) || 0) + size);
    } else if (relativePath.startsWith('dist/main/')) categories.distMain += size;
    else if (relativePath.startsWith('dist/renderer/')) categories.distRenderer += size;
    else if (relativePath.startsWith('resources/')) categories.resources += size;
    else categories.other += size;
  }
  return {
    logicalBytes,
    categories,
    topPackages: [...packages]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 25),
  };
}

const options = parseArguments(process.argv.slice(2));
const appPath = path.resolve(options.app);
const contentsPath = path.join(appPath, 'Contents');
const resourcesPath = path.join(contentsPath, 'Resources');
const archivePath = path.join(resourcesPath, 'app.asar');
const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
const appBytes = walkSize(appPath);
const allFrameworksBytes = walkSize(path.join(contentsPath, 'Frameworks'));
const appAsarBytes = fileSize(archivePath);
const appAsarUnpackedBytes = existsSync(unpackedPath) ? walkSize(unpackedPath) : 0;
const asarAnalysis = analyzeAsar(archivePath);
const result = {
  label: options.label || 'unlabeled',
  measuredAt: new Date().toISOString(),
  commit: resolveCommit(options.commit),
  platform: process.platform,
  arch: process.arch,
  signature: options.signature || 'unknown',
  appPath,
  appBytes,
  breakdown: {
    electronFrameworkBytes: walkSize(
      path.join(contentsPath, 'Frameworks', 'Electron Framework.framework'),
    ),
    allFrameworksBytes,
    appAsarBytes,
    appAsarUnpackedBytes,
    otherBytes: appBytes - allFrameworksBytes - appAsarBytes - appAsarUnpackedBytes,
  },
  dmgBytes: fileSize(options.dmg && path.resolve(options.dmg)),
  zipBytes: fileSize(options.zip && path.resolve(options.zip)),
  asar: asarAnalysis,
};
const json = JSON.stringify(result, null, 2);
console.log(json);
if (options.output) {
  const outputPath = path.resolve(options.output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${json}\n`);
}
if (options.assertNoRedundancy) {
  const failures = [];
  if (result.asar.categories.nodeModuleCode > 0)
    failures.push('Packaged node_modules contain non-license files.');
  if (result.asar.categories.sourcemaps > 0) failures.push('Packaged files contain sourcemaps.');
  if (failures.length) throw new Error(failures.join(' '));
}
