import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

/** Deliberately isolated business state. UI clients cannot write the verification log. */
export async function complexWorkflowFixture() {
  const saves: Array<Record<string, unknown>> = [];
  const uploads: string[] = [];
  let attempts = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/api/save' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      attempts++;
      const value = JSON.parse(body);
      if (
        value.customer !== 'Ada Studio' ||
        value.region !== 'international' ||
        value.tax !== 'INT-2048' ||
        value.shipping !== 'express' ||
        value.contact !== 'ada@example.test' ||
        value.attachment !== 'approved-fixture.txt'
      )
        return json({ error: '字段校验未通过' }, 422);
      // A committed write may lose its reply: the only safe recovery is reading the receipt.
      const entry = { id: `ORDER-${saves.length + 1}`, ...value };
      saves.push(entry);
      if (url.searchParams.has('loseReply'))
        return json({ error: '提交回执暂不可用；请查订单列表，勿重复提交' }, 503);
      setTimeout(() => json(entry), 650);
      return;
    }
    if (url.pathname === '/api/receipts') return json(saves);
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      uploads.push(body);
      return json({ ok: body === 'Athena controlled upload\n' });
    }
    if (url.pathname === '/receipt.csv') {
      res.writeHead(200, {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="athena-workflow-receipt.csv"',
      });
      return res.end(
        'id,customer,region,tax,shipping,contact,attachment\n' +
          saves
            .map((x) =>
              [x.id, x.customer, x.region, x.tax, x.shipping, x.contact, x.attachment].join(','),
            )
            .join('\n') +
          '\n',
      );
    }
    if (url.pathname === '/policy') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<h1>国际配送规则</h1><p>国际订单税号 INT-2048，配送方式选择 express。</p>');
    }
    if (url.pathname === '/contact') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        '<label>联系邮箱<input aria-label="联系邮箱" type="email" oninput="parent.postMessage({contact:this.value},location.origin)"></label>',
      );
    }
    if (url.pathname === '/receipts') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        '<h1>订单回执</h1><div id="receipts">读取中</div><a href="/receipt.csv" download>下载回执 CSV</a><script>fetch("/api/receipts").then(r=>r.json()).then(x=>receipts.textContent=JSON.stringify(x))</script>',
      );
    }
    if (url.pathname !== '/') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      await readFile(new URL('./fixtures/complex-workflow/index.html', import.meta.url), 'utf8'),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    saves,
    uploads,
    get attempts() {
      return attempts;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
