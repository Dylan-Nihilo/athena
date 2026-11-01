import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { NeoMcpSession, NEO_SERVER_VERSION } from '../src/main/neo-server';

test('closing a session aborts an outstanding human-help transport instead of leaving detached requests', async () => {
  let ready!: () => void;
  const started = new Promise<void>((r) => {
    ready = r;
  });
  const server = createServer(async (req, res) => {
    if (req.method === 'DELETE') return res.writeHead(200).end();
    let body = '';
    for await (const chunk of req) body += chunk;
    const packet = JSON.parse(body);
    if (packet.method === 'initialize') {
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'test-session' });
      return res.end(
        JSON.stringify({
          id: packet.id,
          result: { serverInfo: { name: 'browseros-neo', version: NEO_SERVER_VERSION } },
        }),
      );
    }
    if (packet.method === 'notifications/initialized') return res.writeHead(202).end();
    ready(); // Keep this native help request pending until the host cancels its transport.
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const client = new NeoMcpSession(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  );
  try {
    await client.initialize();
    const pending = client.call('request_human_help', { page: 1 });
    const rejected = assert.rejects(pending, /abort/i);
    await started;
    await client.close();
    await rejected;
    await assert.rejects(() => client.call('act', { page: 1, kind: 'click' }), /关闭/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
