import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { BrowserRuntime } from '../src/main/browser';
import { dispatchBrowserAction } from '../src/main/browser-actions';

function fixture(t: TestContext, contentWidth = 0) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const calls: { method: string; params: any }[] = [];
  const frames: any[] = [];
  const runtime = new BrowserRuntime({
    storageDir: '/unused-capture-size',
    onState() {},
    onStep() {},
    onSelected() {},
    onHumanTakeover() {},
    onFrame: (frame) => frames.push(frame),
  }) as any;
  let width = 1100;
  const tab = {
    info: { id: 'tab', url: 'http://localhost/' },
    activation: 0,
    diagnostics: [],
    edits: [],
    page: {
      async call(method: string, params: any) {
        calls.push({ method, params });
        if (method === 'Emulation.setDeviceMetricsOverride') width = params.width;
        if (method === 'Page.getLayoutMetrics')
          return {
            cssContentSize: { width: Math.max(width, contentWidth) },
            cssLayoutViewport: { clientWidth: width },
            cssVisualViewport: { pageX: 0, pageY: 120 },
          };
        return method === 'Page.captureScreenshot' ? { data: 'frame' } : {};
      },
    },
  };
  runtime.browser = {};
  runtime.state.status = 'ready';
  runtime.activeTabId = 'tab';
  runtime.tabs.set('tab', tab);
  const capture = () => calls.filter((c) => c.method === 'Page.startScreencast').at(-1)!.params;
  t.after(() => {
    runtime.disposed = true;
    clearTimeout(runtime.frameRefreshTimer);
    runtime.releaseFrames();
  });
  return { runtime, tab, calls, frames, capture };
}

test('IPC fits the page but captures only the panel physical pixels, including fallback', async (t) => {
  const f = fixture(t, 1260);
  const view = await dispatchBrowserAction(f.runtime, 'browser:resize', {
    width: 619,
    height: 608,
    pixelRatio: 2,
    fitToWidth: true,
    tabId: 'tab',
  });
  assert.deepEqual(view, { width: 1260, height: 1238, tabId: 'tab', limited: false });
  assert.equal(f.capture().maxWidth, 1238);
  assert.equal(f.capture().maxHeight, 1216);
  assert.equal(f.capture().quality, 88);
  assert.equal(f.capture().maxFramesInFlight, 3);
  t.mock.timers.tick(60);
  await f.runtime.queue;
  const clip = f.calls.find((c) => c.method === 'Page.captureScreenshot')!.params.clip;
  assert.equal(clip.scale, Math.min(1238 / (1260 * 2), 1216 / (1238 * 2)));
  assert.equal(clip.y, 120);
  assert.deepEqual([f.frames[0].width, f.frames[0].height], [1260, 1238]);
});

test('DPR-only changes refresh capture; identical responsive geometry keeps its input epoch', async (t) => {
  const f = fixture(t);
  await dispatchBrowserAction(f.runtime, 'browser:resize', {
    width: 620,
    height: 400,
    pixelRatio: 1,
    fitToWidth: true,
  });
  assert.equal(f.capture().maxWidth, 620);
  const epoch = f.runtime.getSurfaceEpoch();
  f.calls.length = 0;
  await f.runtime.resize(620, 400, { pixelRatio: 1, fitToWidth: true });
  assert.equal(f.runtime.getSurfaceEpoch(), epoch);
  assert(!f.calls.some((c) => c.method === 'Page.startScreencast'));
  await f.runtime.resize(620, 400, { pixelRatio: 1.5, fitToWidth: true });
  assert.equal(f.capture().maxWidth, 930);
  assert.equal(f.capture().maxHeight, 600);
  assert.equal(f.runtime.getSurfaceViewport().width, 620);
});

test('pre-start capture, legacy DPR and maximum edge stay bounded', async (t) => {
  const f = fixture(t);
  f.runtime.state.status = 'idle';
  await f.runtime.resize(1100, 1500);
  await f.runtime.startScreencast(f.tab);
  assert.deepEqual([f.capture().maxWidth, f.capture().maxHeight], [2048, 2048]);
  await f.runtime.resize(300, 200, { pixelRatio: 1.25 });
  await f.runtime.startScreencast(f.tab);
  assert.deepEqual([f.capture().maxWidth, f.capture().maxHeight], [375, 250]);
});

test('invalid density and stale tabs cannot change capture; resize failure restores previous bounds', async (t) => {
  const f = fixture(t);
  await f.runtime.resize(620, 400, { pixelRatio: 1 });
  for (const pixelRatio of [0, -1, NaN, Infinity, '2', null]) {
    await assert.rejects(
      dispatchBrowserAction(f.runtime, 'browser:resize', {
        width: 620,
        height: 400,
        pixelRatio,
      }),
    );
  }
  await assert.rejects(f.runtime.resize(620, 400, { pixelRatio: 2, tabId: 'old' }));
  const call = f.tab.page.call;
  f.tab.page.call = async (method, params) => {
    if (method === 'Page.getLayoutMetrics') throw new Error('layout failed');
    return call(method, params);
  };
  await assert.rejects(
    f.runtime.resize(700, 500, { pixelRatio: 2, fitToWidth: true }),
    /layout failed/,
  );
  assert.deepEqual([f.capture().maxWidth, f.capture().maxHeight], [620, 400]);
  assert.equal(f.runtime.getSurfaceViewport().width, 620);
});
