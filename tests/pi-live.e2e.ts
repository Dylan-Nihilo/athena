// Real model calls, explicitly opt-in. Only a temporary workspace may be modified.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PiSession } from '../src/main/pi-session';
import type { AgentEvent } from '../src/shared/types';

if (process.env.WORKBENCH_LIVE_PI !== '1')
  throw new Error('Set WORKBENCH_LIVE_PI=1 to authorize real Pi model calls.');
const executablePath = process.env.WORKBENCH_PI_PATH;
if (!executablePath || !path.isAbsolute(executablePath))
  throw new Error('Set WORKBENCH_PI_PATH to the installed Pi executable.');
const workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), 'athena-pi-live-')));
const sessionDirectory = path.join(workspace, 'sessions');
const marker = `athena-${randomUUID()}`;
const events: AgentEvent[] = [];
let session: PiSession;
let stopOnDelta = false;
const make = (sessionId?: string) =>
  new PiSession({
    workspace,
    executablePath,
    sessionDirectory,
    sessionId,
    permissionsExtensionPath: path.resolve('resources/cli/pi-permissions.mjs'),
    tools: [],
    callTool: async () => ({ isError: true, text: 'Browser tools are not enabled for this test' }),
    onEvent(event) {
      events.push(event);
      if (event.type === 'approval') {
        let allowed = false;
        try {
          const input = JSON.parse(event.request.detail);
          allowed =
            /Pi · (write|read)$/.test(event.request.title) &&
            typeof input.path === 'string' &&
            path.resolve(workspace, input.path) === path.join(workspace, 'evidence.txt') &&
            (!event.request.title.endsWith('write') ||
              (typeof input.content === 'string' && input.content.trim() === marker));
        } catch {
          /* Unreviewable arguments must never be approved. */
        }
        console.log(JSON.stringify({ stage: 'approval', tool: event.request.title, allowed }));
        session.resolveApproval(event.request.id, allowed);
      }
      if (event.type === 'delta' && stopOnDelta) {
        stopOnDelta = false;
        void session.interrupt();
      }
    },
  });
const deadline = setTimeout(() => {
  session?.close();
}, 180000);
try {
  session = make();
  await session.prepare();
  const models = await session.listModels();
  assert.ok(models.length > 0, 'Pi returned no configured models');
  await session.send(
    `Use the write tool to create evidence.txt in the current directory containing exactly ${marker}. Then use the read tool to verify that file. Reply with the exact content. Do not use bash or access any other files.`,
  );
  console.log(
    JSON.stringify({
      stage: 'tool-result',
      toolCalls: events
        .filter((event) => event.type === 'tool')
        .map((event) => ({ name: event.call.name, status: event.call.status })),
      approvals: events.filter((event) => event.type === 'approval').length,
      reply: events
        .filter((event) => event.type === 'delta')
        .map((event) => event.text)
        .join('')
        .slice(-600),
    }),
  );
  assert.equal((await readFile(path.join(workspace, 'evidence.txt'), 'utf8')).trim(), marker);
  assert.ok(events.some((e) => e.type === 'delta' && e.text.length));
  assert.ok(events.some((e) => e.type === 'approval'));
  assert.ok(events.some((e) => e.type === 'usage'));
  assert.ok(events.some((e) => e.type === 'model' && e.model.source === 'cli-message'));
  const id = session.sessionId;
  assert.ok(id);
  session.close();
  const before = events.length;
  session = make(id);
  await session.prepare();
  await session.send(
    'Without using any tools, reply with only the exact marker you wrote in evidence.txt in the previous turn.',
  );
  assert.ok(
    events
      .slice(before)
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('')
      .includes(marker),
    'Resumed session did not recall the original marker',
  );
  stopOnDelta = true;
  await assert.rejects(
    session.send(
      'Without using tools, count from 1 to 2000, writing each integer on a separate line. Do not stop early.',
    ),
    /停止/,
  );
  assert.equal(stopOnDelta, false, 'Stop test never observed streaming text');
  console.log(
    JSON.stringify({
      checks: [
        'real tools with approvals',
        'streaming',
        'native session resume',
        'usage',
        'execution model evidence',
        'interrupt',
      ],
      model: events.find((e) => e.type === 'model')?.model,
      eventCount: events.length,
    }),
  );
} finally {
  clearTimeout(deadline);
  session!?.close();
  await rm(workspace, { recursive: true, force: true });
}
