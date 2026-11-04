import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nodeShebang } from './node-script';

test('CLI fixtures execute with spaces and quotes in the Node path, preserving arguments', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'athena-node-script-'));
  try {
    const bin = path.join(directory, "Node install's folder");
    await mkdir(bin);
    const node = path.join(bin, 'node');
    await symlink(process.execPath, node);
    const file = path.join(directory, 'fixture');
    await writeFile(
      file,
      `${nodeShebang(node)}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`,
      { mode: 0o755 },
    );
    const args = ['argument with spaces', "quote's here", '$not_a_shell_variable'];
    const result = await promisify(execFile)(file, args);
    assert.deepEqual(JSON.parse(result.stdout), args);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
