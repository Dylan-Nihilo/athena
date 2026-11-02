/** Local-only Electron -> BrowserOS -> decoded pixels interaction benchmark. */
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seedLegacyWorkspace } from './legacy-workspace-fixture';
import { CdpConnection } from '../src/main/browser-cdp';

const root = process.cwd();
const output = process.env.ATHENA_PERF_OUTPUT || 'test-results/neo-performance/interactions.json';
const urlSync = process.env.ATHENA_PERF_URL_INPUT === '1';
const temp = await mkdtemp(path.join(root, '.runtime/neo-interactions-'));
await seedLegacyWorkspace(path.join(temp, 'data'));
const site = createServer((req, res) => {
  const dense = req.url?.includes('dense');
  res.setHeader('content-type', 'text/html;charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><title>Neo ${dense ? 'dense' : 'simple'}</title><style>
  *{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#eef2f6}header{position:sticky;top:0;background:white;padding:16px;z-index:1}
  #marker{width:160px;height:48px;background:rgb(30,80,120)}button,input{font:inherit;padding:10px;margin:8px 0}main{padding:16px;display:grid;gap:12px}.card{padding:20px;background:white;border:1px solid #ccd4df;border-radius:12px}
  </style><header><div id="marker"></div><button id="action">Click</button><input id="typing" aria-label="typing"></header><main>${Array.from({ length: dense ? 1000 : 30 }, (_, i) => `<section class="card"><h2>Item ${i}</h2><p>Local test page <b>details</b> and <span>progress</span>.</p><button>Open details</button></section>`).join('')}</main><script>
  window.samples=[];window.count=0;window.longTasks=[];
  new PerformanceObserver(l=>window.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  function update(kind){window.count++;const color=30+window.count*5;document.querySelector('#marker').style.background='rgb('+color+',80,120)';window.samples.push({kind,count:window.count,value:document.querySelector('#typing').value,t:performance.timeOrigin+performance.now()});}
  document.querySelector('#action').onclick=()=>update('click');document.querySelector('#typing').oninput=()=>{update('input');${urlSync ? "history.replaceState({},'',location.pathname+'?q='+document.querySelector('#typing').value);" : ''}};
  </script>`);
});
await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(site.address() as any).port}`;
const app = await electron.launch({
  ...(process.env.ATHENA_PERF_APP ? { executablePath: process.env.ATHENA_PERF_APP } : {}),
  args: process.env.ATHENA_PERF_APP ? [] : ['.'],
  cwd: process.env.ATHENA_PERF_APP_ROOT || root,
  env: {
    ...process.env,
    WORKBENCH_USER_DATA_DIR: path.join(temp, 'data'),
    WORKBENCH_BROWSER_PATH: path.resolve(
      '../browseros-runtime/BrowserOS neo.app/Contents/MacOS/BrowserOS neo',
    ),
  },
});
let native: CdpConnection | undefined;
let page: Awaited<ReturnType<typeof app.firstWindow>>;
const report: any = {
  conditions: { window: [1440, 900], local: true, urlSync },
  interactions: [],
  tabs: [],
  resize: [],
  errors: [],
};
try {
  report.application = await app.evaluate(({ app }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
  }));
  page = await app.firstWindow();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.evaluate('window.__name = fn => fn');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.webContents.setBackgroundThrottling(false);
    w.setSize(1440, 900);
  });
  const invoke = (name: string, payload?: any) =>
    page.evaluate(
      ([name, payload]) => window.workbench.invoke<any>(name, payload),
      [name, payload],
    );
  await expect
    .poll(async () => (await invoke('app:snapshot')).browser.status, { timeout: 30000 })
    .toBe('ready');
  await page.getByRole('button', { name: '展开浏览器', exact: true }).click();
  await page.evaluate(() => {
    const f = ((window as any).__interactionPerf = {
      frames: [] as any[],
      received: 0,
      states: 0,
      steps: 0,
      loading: [] as any[],
      urls: [] as any[],
    });
    let loading = false;
    new MutationObserver(() => {
      const next = !!document.querySelector('.frame-loading');
      if (next !== loading) {
        loading = next;
        f.loading.push({ t: performance.timeOrigin + performance.now(), loading });
      }
    }).observe(document.body, { childList: true, subtree: true });
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    window.workbench.onEvent((e) => {
      if (e.type === 'browser:frame') f.received++;
      if (e.type === 'browser:state') {
        f.states++;
        f.urls.push({
          t: performance.timeOrigin + performance.now(),
          url: e.state.url,
          epoch: e.state.viewport?.epoch,
        });
      }
      if (e.type === 'browser:step') f.steps++;
    });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const source = this.currentSrc;
      return decode.call(this).then(() => {
        if (!this.classList.contains('browser-frame') || this.currentSrc !== source) return;
        // The marker is at (16,16); sample its centre, away from JPEG edges.
        const scale = this.naturalWidth / this.getBoundingClientRect().width;
        ctx.drawImage(this, 60 * scale, 36 * scale, 1, 1, 0, 0, 1, 1);
        f.frames.push({
          t: performance.timeOrigin + performance.now(),
          rgb: Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3),
        });
      });
    };
  });
  const settled = () => expect(page.locator('.frame-loading')).toHaveCount(0, { timeout: 10000 });
  const connect = async () => {
    native?.close();
    const port = (
      await readFile(path.join(temp, 'data/browser/browseros-profile/DevToolsActivePort'), 'utf8')
    ).split('\n')[0];
    const id = (await invoke('app:snapshot')).browser.activeTabId;
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as any[];
    native = await CdpConnection.connect(targets.find((t) => t.id === id).webSocketDebuggerUrl);
  };
  const nativeValue = async (expression: string) =>
    (await native!.call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  for (const dense of urlSync ? [false] : [false, true]) {
    await invoke('browser:navigate', { url: url + (dense ? '/dense' : '/simple') });
    await expect
      .poll(async () => (await invoke('app:snapshot')).browser.title)
      .toBe(`Neo ${dense ? 'dense' : 'simple'}`);
    await settled();
    await connect();
    if (urlSync) {
      await page.locator('.browser-surface').click({ position: { x: 220, y: 98 } });
      const epochBefore = (await invoke('app:snapshot')).browser.viewport.epoch;
      const sent = await page.evaluate(async () => {
        const sent = [];
        const k = document.querySelector('.browser-keyboard')!;
        for (const key of 'abcdefghijklmnopqrst') {
          sent.push({ key, t: performance.timeOrigin + performance.now() });
          for (const type of ['keydown', 'keyup'])
            k.dispatchEvent(
              new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                key,
                code: 'Key' + key.toUpperCase(),
                keyCode: key.toUpperCase().charCodeAt(0),
              }),
            );
          await new Promise((r) => setTimeout(r, 75));
        }
        return sent;
      });
      // Observe the final debounce as well as the burst; it must not restart an unchanged view.
      await page.waitForTimeout(300);
      await settled();
      const nativeSamples = await nativeValue('window.samples');
      const frames = await page.evaluate(() => (window as any).__interactionPerf.frames);
      const text = await nativeValue('document.querySelector("#typing").value');
      const epochAfter = (await invoke('app:snapshot')).browser.viewport.epoch;
      report.urlInput = {
        expected: 'abcdefghijklmnopqrst',
        actual: text,
        sent: sent.length,
        received: nativeSamples.length,
        epochBefore,
        epochAfter,
      };
      for (const s of nativeSamples) {
        const input = sent.find((input: any) => input.key === s.value.at(-1))!;
        const frame = frames.find(
          (f: any) =>
            f.t >= s.t &&
            Math.abs(f.rgb[0] - (30 + s.count * 5)) < 3 &&
            Math.abs(f.rgb[1] - 80) < 3,
        );
        report.interactions.push({
          dense,
          recording: false,
          kind: 'input',
          dispatchMs: s.t - input.t,
          presentedMs: frame ? frame.t - input.t : null,
        });
      }
      assert.equal(
        text,
        report.urlInput.expected,
        'URL-synchronized typing must not discard characters',
      );
      assert.equal(
        epochAfter,
        epochBefore,
        'A URL-only update must not invalidate unchanged pixels',
      );
      continue;
    }
    for (const recording of urlSync ? [false] : [false, true]) {
      if (recording) {
        await invoke('recording:start');
        await page.evaluate(
          () =>
            new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        );
        await settled();
      }
      for (const kind of urlSync ? ['input'] : ['click', 'input']) {
        // Focus via the displayed page; all measured inputs use BrowserPane's real handlers.
        if (kind === 'input')
          await page.locator('.browser-surface').click({ position: { x: 220, y: 98 } });
        for (let n = 0; n < 8; n++) {
          const count = await nativeValue('window.count');
          report.stage = { dense, recording, kind, n, count };
          const start = await page.evaluate((kind) => {
            const t = performance.timeOrigin + performance.now();
            if (kind === 'click') {
              const surface = document.querySelector('.browser-surface')!;
              const b = surface.getBoundingClientRect();
              for (const type of ['mousedown', 'mouseup'])
                surface.dispatchEvent(
                  new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: b.x + 45,
                    clientY: b.y + 98,
                    button: 0,
                    buttons: type === 'mousedown' ? 1 : 0,
                    detail: 1,
                  }),
                );
            } else {
              const k = document.querySelector('.browser-keyboard')!;
              for (const type of ['keydown', 'keyup'])
                k.dispatchEvent(
                  new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: 'a',
                    code: 'KeyA',
                    keyCode: 65,
                  }),
                );
            }
            return t;
          }, kind);
          report.stage.start = start;
          await page.waitForFunction(
            ({ start, color }) =>
              (window as any).__interactionPerf.frames.some(
                (f: any) =>
                  f.t >= start && Math.abs(f.rgb[0] - color) < 3 && Math.abs(f.rgb[1] - 80) < 3,
              ),
            { start, color: 30 + (count + 1) * 5 },
            { timeout: 2000 },
          );
          const frame = await page.evaluate(
            ({ start, color }) =>
              (window as any).__interactionPerf.frames.find(
                (f: any) =>
                  f.t >= start && Math.abs(f.rgb[0] - color) < 3 && Math.abs(f.rgb[1] - 80) < 3,
              ),
            { start, color: 30 + (count + 1) * 5 },
          );
          const sample = await nativeValue('window.samples.at(-1)');
          report.interactions.push({
            dense,
            recording,
            kind,
            dispatchMs: sample.t - start,
            presentedMs: frame.t - start,
          });
        }
      }
      if (recording) {
        const saved = await invoke('recording:stop');
        assert(saved.steps.some((s: any) => s.kind === 'fill'));
        assert(saved.steps.some((s: any) => s.kind === 'click'));
      }
    }
    report[dense ? 'denseTasks' : 'simpleTasks'] = await nativeValue('window.longTasks');
  }
  const first = (await invoke('app:snapshot')).browser.activeTabId;
  await invoke('browser:new-tab', { url: url + '/simple' });
  await settled();
  const second = (await invoke('app:snapshot')).browser.activeTabId;
  for (let i = 0; i < 10; i++) {
    const id = i % 2 ? second : first;
    const t = performance.now();
    await invoke('browser:switch-tab', { id });
    await settled();
    report.tabs.push(performance.now() - t);
  }
  for (const width of [1280, 1600, 1100, 1440]) {
    const t = performance.now();
    await app.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900),
      width,
    );
    await page.waitForTimeout(150);
    await settled();
    report.resize.push({ width, ms: performance.now() - t });
  }
  report.ui = await page.evaluate(() => (window as any).__interactionPerf);
  delete report.ui.frames;
  const summary = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b);
    return {
      median: s[Math.floor(s.length / 2)],
      p95: s[Math.floor(s.length * 0.95)],
      max: s.at(-1),
    };
  };
  report.summary = {
    input: summary(
      report.interactions.filter((x: any) => x.kind === 'input').map((x: any) => x.presentedMs),
    ),
    click: summary(
      report.interactions.filter((x: any) => x.kind === 'click').map((x: any) => x.presentedMs),
    ),
    tab: summary(report.tabs),
    resize: summary(report.resize.map((x: any) => x.ms)),
  };
  assert.deepEqual(report.errors, []);
  assert(
    report.interactions.every((sample: any) => Number.isFinite(sample.presentedMs)),
    'Every accepted input must have a matching decoded marker',
  );
  assert(report.summary.input.p95 < 150, 'Typing must present within 150ms at p95');
  if (!urlSync) assert(report.summary.click.p95 < 150, 'Clicks must present within 150ms at p95');
  assert(report.summary.tab.p95 < 500, 'Warm tab switches must settle within 500ms at p95');
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.error = String(e);
  report.failureNative = (
    await native?.call('Runtime.evaluate', {
      expression:
        '({count:window.count,samples:window.samples,value:document.querySelector("#typing")?.value})',
      returnByValue: true,
    })
  )?.result.value;
  report.failureUI = await page!.evaluate(() => ({
    frames: (window as any).__interactionPerf?.frames.slice(-12),
    loadingHistory: (window as any).__interactionPerf.loading,
    urls: (window as any).__interactionPerf.urls,
    loading: document.querySelector('.frame-loading')?.textContent,
    frame: document.querySelector<HTMLImageElement>('.browser-frame')?.naturalWidth,
  }));
  throw e;
} finally {
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, interactions: report.interactions.length }, null, 2));
  native?.close();
  await app.close();
  await new Promise<void>((r) => site.close(() => r()));
  await rm(temp, { recursive: true, force: true });
}
