import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Feature tests start as an existing local user; first-use tests keep a fresh profile. */
export async function seedLegacyWorkspace(userDataDirectory: string) {
  const workspace = path.join(userDataDirectory, 'workspace');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(userDataDirectory, 'workspace.json'),
    JSON.stringify({
      settings: { workspace, agent: 'codex' },
      conversations: [],
      recordings: [],
    }),
    { mode: 0o600, flag: 'wx' },
  );
}
