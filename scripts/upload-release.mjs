import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile, open, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import semver from 'semver';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiOrigin = 'https://api.github.com';

export function parseOptions(args, version) {
  const options = {
    tag: `v${version}`,
    directory: path.join(root, `release/v${version}/notarized`),
  };
  const flags = new Set(['replace', 'allow-redirect', 'dry-run', 'yes', 'help']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--'))
      throw new Error(
        'Unexpected positional argument; credentials must not be passed on the command line.',
      );
    if (flags.has(key)) options[key] = true;
    else if (
      ['repo', 'tag', 'directory'].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      options[key] = args[++i];
    else throw new Error('Unknown or incomplete upload option; see --help.');
  }
  if (options.help) return options;
  if (!semver.valid(version) || !/^\d/.test(version))
    throw new Error('package.json version must be a valid SemVer.');
  if (options.yes && !args.includes('--tag'))
    throw new Error('--yes requires an explicit --tag vVERSION.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo || ''))
    throw new Error('Specify --repo OWNER/REPOSITORY explicitly.');
  if (options.tag !== `v${version}`)
    throw new Error('Release tag must match package.json version.');
  options.directory = path.resolve(options.directory);
  return options;
}

export function assessVersions(version, releases) {
  if (!semver.valid(version)) throw new Error('Invalid local SemVer.');
  if (semver.prerelease(version))
    throw new Error('This upload command supports stable versions only.');
  const versions = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => semver.valid(release.tag_name))
    .filter((value) => value && !semver.prerelease(value));
  const latest = versions.sort(semver.rcompare)[0] || null;
  const comparison = latest ? semver.compare(version, latest) : null;
  if (comparison === -1)
    throw new Error(
      `Local version v${version} is older than published v${latest}. Build a newer version before uploading.`,
    );
  return { latest, comparison };
}

export async function publishedReleases(request, base) {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await request('GET', `${base}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Invalid GitHub releases response.');
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
}

export async function confirmUpload({ tag, yes, dryRun, interactive, ask }) {
  if (dryRun || yes) return;
  if (!interactive)
    throw new Error(
      'Version confirmation needs an interactive terminal. For CI use --yes --tag vVERSION.',
    );
  const answer = await ask(`请输入目标版本 ${tag} 确认上传（直接回车取消）：`);
  if (answer.trim() !== tag)
    throw new Error('Version confirmation cancelled or mismatched; nothing uploaded.');
}

async function askVersion(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve, reject) => {
      let answered = false;
      terminal.once('close', () => {
        if (!answered) reject(new Error('Version confirmation cancelled; nothing uploaded.'));
      });
      terminal.once('SIGINT', () => terminal.close());
      terminal.question(question, (answer) => {
        answered = true;
        resolve(answer);
      });
    });
  } finally {
    terminal.close();
  }
}

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function localArtifacts(directory, version, product = 'Athena') {
  const names = [
    `${product}-${version}-mac-arm64.dmg`,
    `${product}-${version}-mac-arm64.zip`,
    'SHA256SUMS.txt',
  ];
  const checksums = await readFile(path.join(directory, names[2]), 'utf8');
  const expected = new Map();
  for (const line of checksums.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || !names.slice(0, 2).includes(match[2]) || expected.has(match[2]))
      throw new Error('SHA256SUMS.txt must contain exactly the DMG and ZIP, once each.');
    expected.set(match[2], match[1]);
  }
  if (expected.size !== 2) throw new Error('Missing DMG or ZIP checksum.');
  return Promise.all(
    names.map(async (name) => {
      const file = path.join(directory, name);
      const size = (await stat(file)).size;
      if (!size) throw new Error(`Empty artifact: ${name}`);
      const digest = await sha256(file);
      if (expected.has(name) && digest !== expected.get(name))
        throw new Error(`Checksum mismatch: ${name}`);
      return { name, file, size, digest: `sha256:${digest}` };
    }),
  );
}

export function assertRepository(requested, canonical, allowRedirect) {
  if (requested.toLowerCase() !== canonical.toLowerCase() && !allowRedirect)
    throw new Error(
      `Repository resolves to ${canonical}, not ${requested}. Confirm using --allow-redirect or specify the canonical --repo.`,
    );
}

// All uploads are staged before changing any public name. On failure, keep the journal
// and backups for inspection; never blindly retry an upload or delete the only old copy.
export async function replaceAssets({
  release,
  artifacts,
  replace,
  api,
  verifyPublic,
  save,
  nonce = randomUUID(),
  log = console.log,
}) {
  const previous = release.assets.filter((a) => artifacts.some((f) => f.name === a.name));
  if (previous.length && !replace)
    throw new Error('Assets already exist. Use --replace to confirm replacement.');
  const state = { releaseId: release.id, previous, uploaded: [], verified: false, complete: false };
  await save(state);
  for (const artifact of artifacts) {
    const asset = await api.upload(release.id, `pending-${nonce}-${artifact.name}`, artifact.file);
    // Record successful responses before validating them so a bad upload can be cleaned up.
    state.uploaded.push({ name: artifact.name, id: asset.id });
    await save(state);
    if (asset.size !== artifact.size || asset.digest !== artifact.digest)
      throw new Error(`GitHub size/digest mismatch: ${artifact.name}`);
    log(`Uploaded and checked: ${artifact.name}`);
  }
  for (const artifact of artifacts) {
    const old = previous.find((a) => a.name === artifact.name);
    if (old) await api.rename(old.id, `previous-${nonce}-${old.name}`);
    await api.rename(state.uploaded.find((a) => a.name === artifact.name).id, artifact.name);
    await save(state);
  }
  for (const artifact of artifacts) await verifyPublic(artifact);
  state.verified = true;
  await save(state);
  for (const old of previous) await api.remove(old.id);
  state.complete = true;
  await save(state);
  return state;
}

async function command(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [],
      stderr = [];
    child.stdout.on('data', (b) => stdout.push(b));
    child.stderr.on('data', (b) => stderr.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${path.basename(executable)} failed (exit ${code}).`));
      else resolve(Buffer.concat(stdout).toString());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function verifySignedArtifacts(artifacts, version, temporary) {
  const dmg = artifacts.find((a) => a.name.endsWith('.dmg')).file;
  await command('codesign', ['--verify', '--strict', dmg]);
  await command('xcrun', ['stapler', 'validate', dmg]);
  await command('spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    dmg,
  ]);
  const zip = artifacts.find((a) => a.name.endsWith('.zip')).file;
  const extract = path.join(temporary, 'zip');
  await command('ditto', ['-x', '-k', zip, extract]);
  const app = path.join(extract, 'Athena.app');
  await command('codesign', ['--verify', '--deep', '--strict', app]);
  await command('xcrun', ['stapler', 'validate', app]);
  await command('spctl', ['--assess', '--type', 'execute', app]);
  for (const [key, expected] of [
    ['CFBundleShortVersionString', version],
    ['CFBundleIdentifier', 'app.agent.workbench'],
  ]) {
    const value = await command('plutil', [
      '-extract',
      key,
      'raw',
      path.join(app, 'Contents/Info.plist'),
    ]);
    if (value.trim() !== expected) throw new Error(`ZIP app ${key} mismatch.`);
  }
}

async function credentials() {
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const result = await command(
      'git',
      ['credential', 'fill'],
      'protocol=https\nhost=github.com\n\n',
    );
    token = result
      .split(/\r?\n/)
      .find((line) => line.startsWith('password='))
      ?.slice(9);
  }
  if (!token || /[\r\n"\\]/.test(token))
    throw new Error(
      'Set GH_TOKEN/GITHUB_TOKEN privately or configure the GitHub git credential helper.',
    );
  return `header = "Authorization: Bearer ${token}"\n`;
}

async function main() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const options = parseOptions(process.argv.slice(2), pkg.version);
  if (options.help) {
    console.log(
      'Usage: npm run release:upload -- --repo OWNER/REPOSITORY [--replace] [--allow-redirect] [--dry-run] [--directory PATH] [--tag vVERSION] [--yes]\nUploads to an EXISTING public release. Never creates a release, moves a tag, pushes code or edits release notes.\nChecks SemVer against all published stable releases; older versions are refused. Type the target tag to confirm uploading. CI requires --yes --tag vVERSION.\n--dry-run performs local signature/checksum and remote read-only checks, but uploads nothing or prompts.',
    );
    return;
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'athena-release-upload-'));
  let lock;
  let lockFile;
  try {
    const artifacts = await localArtifacts(options.directory, pkg.version);
    await verifySignedArtifacts(artifacts, pkg.version, temporary);
    const auth = await credentials();
    const request = async (method, url, { data, file } = {}, redirects = 0) => {
      const parsed = new URL(url);
      if (
        !['api.github.com', 'uploads.github.com'].includes(parsed.hostname) ||
        parsed.protocol !== 'https:'
      )
        throw new Error('Refusing to send credentials outside the GitHub API.');
      const headers = path.join(temporary, `headers-${randomUUID()}`);
      const args = [
        '--silent',
        '--show-error',
        '--connect-timeout',
        '20',
        '--max-time',
        '1200',
        '--config',
        '-',
        '--dump-header',
        headers,
        '-X',
        method,
        '-H',
        'Accept: application/vnd.github+json',
        '-H',
        'X-GitHub-Api-Version: 2022-11-28',
        url,
      ];
      if (file)
        args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', `@${file}`);
      else if (data)
        args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(data));
      const body = await command('curl', args, auth);
      const responseHeaders = await readFile(headers, 'utf8');
      await rm(headers);
      const status = Number([...responseHeaders.matchAll(/^HTTP\/\S+ (\d+)/gm)].at(-1)?.[1]);
      if ([301, 302, 307, 308].includes(status) && method === 'GET' && redirects < 5) {
        const location = /^location:\s*(.+)$/im.exec(responseHeaders)?.[1].trim();
        if (!location || new URL(location).origin !== apiOrigin)
          throw new Error('Unexpected API redirect.');
        return request('GET', location, {}, redirects + 1);
      }
      if (!(status >= 200 && status < 300))
        throw new Error(
          `GitHub ${method} failed (HTTP ${status}); no automatic write retries were made.`,
        );
      return body.trim() ? JSON.parse(body) : undefined;
    };
    const repo = await request('GET', `${apiOrigin}/repos/${options.repo}`);
    assertRepository(options.repo, repo.full_name, options['allow-redirect']);
    if (repo.private)
      throw new Error('A public repository is required for anonymous download verification.');
    console.log(`Requested repository: ${options.repo}; actual repository: ${repo.full_name}`);
    const base = `${apiOrigin}/repos/${repo.full_name}`;
    const assessment = assessVersions(pkg.version, await publishedReleases(request, base));
    console.log(
      `Local build: ${options.tag}; highest published stable version: ${assessment.latest ? `v${assessment.latest}` : '(none)'}.`,
    );
    console.log(
      assessment.comparison === 0
        ? '相同 SemVer 版本：本轮更新现有版本资产，不递增版本号。'
        : '目标版本高于远端正式版本，或远端尚无正式版本。',
    );
    const release = await request('GET', `${base}/releases/tags/${options.tag}`);
    if (release.draft || release.prerelease)
      throw new Error('Expected an existing, published non-prerelease release.');
    const existing = release.assets.filter((a) => artifacts.some((f) => f.name === a.name));
    if (existing.length && !options.replace)
      throw new Error('Assets already exist. Use --replace to confirm replacement.');
    console.log(`Release: ${release.html_url}; ${existing.length} existing assets to replace.`);
    if (options['dry-run']) {
      console.log(
        'Dry run passed. Signatures, notarization tickets, checksums and destination checked; no remote writes.',
      );
      return;
    }
    await confirmUpload({
      tag: options.tag,
      yes: options.yes,
      dryRun: options['dry-run'],
      interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      ask: askVersion,
    });
    const runtime = path.join(root, '.runtime');
    await mkdir(runtime, { recursive: true });
    const key = createHash('sha256')
      .update(`${repo.full_name}/${options.tag}`)
      .digest('hex')
      .slice(0, 16);
    lockFile = path.join(runtime, `release-upload-${key}.lock`);
    lock = await open(lockFile, 'wx');
    await lock.writeFile(String(process.pid));
    const nonce = randomUUID();
    const journal = path.join(runtime, `release-upload-${nonce}.json`);
    console.log(`Recovery journal (no credentials): ${journal}`);
    const api = {
      upload: (id, name, file) =>
        request(
          'POST',
          `https://uploads.github.com/repos/${repo.full_name}/releases/${id}/assets?name=${encodeURIComponent(name)}`,
          { file },
        ),
      rename: (id, name) => request('PATCH', `${base}/releases/assets/${id}`, { data: { name } }),
      remove: (id) => request('DELETE', `${base}/releases/assets/${id}`),
    };
    await replaceAssets({
      release,
      artifacts,
      replace: options.replace,
      api,
      nonce,
      save: (state) =>
        writeFile(
          journal,
          JSON.stringify({ repo: repo.full_name, tag: options.tag, ...state }, null, 2),
        ),
      verifyPublic: async (artifact) => {
        const url = `https://github.com/${options.repo}/releases/download/${options.tag}/${artifact.name}?verify=${nonce}`;
        const file = path.join(temporary, artifact.name);
        // Intentionally no auth: these must be publicly downloadable through the requested URL.
        await command('curl', [
          '-fLsS',
          '--proto',
          '=https',
          '--proto-redir',
          '=https',
          '--connect-timeout',
          '20',
          '--max-time',
          '1200',
          url,
          '-o',
          file,
        ]);
        if (`sha256:${await sha256(file)}` !== artifact.digest)
          throw new Error(`Public download checksum mismatch: ${artifact.name}`);
        console.log(`Public download SHA-256 verified: ${artifact.name}`);
      },
    });
    console.log(
      'Release assets uploaded and verified. Release notes and source/tag pointers were not changed.',
    );
  } finally {
    if (lock) {
      await lock.close();
      await rm(lockFile, { force: true });
    }
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    console.error(
      'If uploads had begun, inspect the recovery journal and GitHub assets before retrying. Previous assets are retained until public download verification succeeds.',
    );
    process.exitCode = 1;
  });
}
