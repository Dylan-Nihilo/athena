import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const gate = require('../resources/cli/pi-permissions.mjs').default;

test('Pi native operations require a live RPC approval and reviewable complete arguments', async () => {
  const handlers = new Map();
  gate({
    on(name: string, handler: unknown) {
      handlers.set(name, handler);
    },
  });
  let confirmations = 0;
  const context = {
    mode: 'rpc',
    hasUI: true,
    signal: new AbortController().signal,
    ui: {
      confirm: async () => {
        confirmations++;
        return true;
      },
      notify() {},
    },
  };
  const call = handlers.get('tool_call');
  assert.equal(
    await call({ toolName: 'write', input: { path: 'file.txt', content: 'hello' } }, context),
    undefined,
  );
  assert.equal(confirmations, 1);
  assert.equal(
    (await call({ toolName: 'bash', input: { command: 'x'.repeat(16001) } }, context)).block,
    true,
  );
  assert.equal(confirmations, 1);
  assert.equal(
    (await call({ toolName: 'read', input: { path: 'file.txt' } }, { ...context, mode: 'json' }))
      .block,
    true,
  );
  assert.equal(
    (
      await call(
        { toolName: 'read', input: { path: 'file.txt' } },
        { ...context, ui: { ...context.ui, confirm: async () => false } },
      )
    ).block,
    true,
  );
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await call({ toolName: 'write', input: {} }, { ...context, signal: controller.signal })).block,
    true,
  );
});
