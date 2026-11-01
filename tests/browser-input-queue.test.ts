import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserRuntime } from '../src/main/browser';

function fixture() {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: any[] = [];
  const runtime = new BrowserRuntime({
    storageDir: '/unused-wheel-test',
    onState() {},
    onFrame() {},
    onStep() {},
    onSelected() {},
    onHumanTakeover() {},
  }) as any;
  runtime.state.status = 'ready';
  runtime.activeTabId = 'tab';
  runtime.tabs.set('tab', {
    info: { id: 'tab' },
    diagnostics: [],
    page: {
      async call(method: string, params: any) {
        assert.equal(method, 'Input.dispatchMouseEvent');
        calls.push({ ...params });
        if (calls.length === 1) {
          entered();
          await blocked;
        }
      },
    },
  });
  runtime.setSource = async () => {};
  const wheel = (deltaY = 8, patch = {}) =>
    runtime.dispatchInput({
      type: 'wheel',
      x: 50,
      y: 60,
      deltaX: 0,
      deltaY,
      tabId: 'tab',
      ...patch,
    });
  return { runtime, calls, wheel, started, release };
}

test('trackpad input keeps its distance without queuing one native call for every event', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const burst = Array.from({ length: 120 }, () => f.wheel());
  f.release();
  await Promise.all([first, ...burst]);
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8, 960],
    'One in-flight event and one accumulated event must replace the backlog',
  );
});

test('wheel accumulation does not cross a click, target, direction or modifier boundary', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const pending = [
    f.wheel(10),
    f.wheel(20),
    f.runtime.dispatchInput({ type: 'mouse', action: 'down', x: 50, y: 60 }),
    f.wheel(30),
    f.wheel(40),
    f.wheel(-5),
    f.wheel(-7),
    f.wheel(-11, { x: 80 }),
    f.wheel(-13, { x: 80, modifiers: 1 }),
  ];
  f.release();
  await Promise.all([first, ...pending]);
  assert.deepEqual(
    f.calls.map((c) => [c.type, c.deltaY, c.x, c.modifiers]),
    [
      ['mouseWheel', 8, 50, 0],
      ['mouseWheel', 30, 50, 0],
      ['mousePressed', undefined, 50, 0],
      ['mouseWheel', 70, 50, 0],
      ['mouseWheel', -12, 50, 0],
      ['mouseWheel', -11, 80, 0],
      ['mouseWheel', -13, 80, 1],
    ],
  );
});

test('invalid input cannot poison a valid pending wheel batch', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const pending = f.wheel(15);
  const invalid = [
    assert.rejects(f.wheel(NaN), /Invalid scroll input/),
    assert.rejects(f.wheel(20, { x: -1 }), /outside/),
  ];
  f.release();
  await Promise.all([first, pending, ...invalid]);
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8, 15],
  );
});

test('human input reuses source state, but still resets an agent-controlled frame', async () => {
  for (const source of ['human', 'agent']) {
    const f = fixture();
    const tab = f.runtime.tabs.get('tab');
    tab.source = 'human';
    const frame = { source };
    tab.frames = new Map([['frame', frame]]);
    let resets = 0;
    f.runtime.setSource = async () => {
      resets++;
      frame.source = 'human';
    };
    const first = f.wheel();
    await f.started;
    const next = f.wheel();
    f.release();
    await Promise.all([first, next]);
    assert.equal(resets, source === 'agent' ? 1 : 0);
  }
});

test('queued wheel input is rejected if its tab is no longer active', async () => {
  const f = fixture();
  let unblock!: () => void;
  f.runtime.queue = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const pending = [f.wheel(), f.wheel()];
  f.runtime.tabs.set('other', { info: { id: 'other' } });
  f.runtime.activeTabId = 'other';
  const rejected = pending.map((p) => assert.rejects(p, /活动标签页已改变/));
  unblock();
  await Promise.all(rejected);
  assert.equal(f.calls.length, 0);
});

test('accumulated packets retain the existing per-packet wheel bound without losing distance', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const pending = [f.wheel(4000), f.wheel(2000), f.wheel(1000)];
  f.release();
  await Promise.all([first, ...pending]);
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8, 4000, 3000],
  );
});

test('capture acknowledgements pace idle frames and release each pending frame once on interaction', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const f = fixture();
  const acknowledged: number[] = [];
  const page = {
    call: async (_method: string, args: any) => {
      acknowledged.push(args.sessionId);
    },
  };
  f.runtime.acknowledgeFrame(page, 1);
  f.runtime.acknowledgeFrame(page, 2);
  f.runtime.acknowledgeFrame(page, 3);
  assert.deepEqual(acknowledged, []);
  t.mock.timers.tick(42);
  assert.deepEqual(acknowledged, [1]);
  f.runtime.boostFrames();
  assert.deepEqual(acknowledged, [1, 2, 3]);
  f.runtime.acknowledgeFrame(page, 4);
  assert.deepEqual(acknowledged, [1, 2, 3, 4]);
  t.mock.timers.tick(300);
  assert.deepEqual(acknowledged, [1, 2, 3, 4]);
  f.runtime.acknowledgeFrame(page, 5);
  t.mock.timers.tick(42);
  assert.deepEqual(acknowledged, [1, 2, 3, 4, 5]);
});

test('horizontal wheel increments accumulate independently and retain reversals', async () => {
  const f = fixture();
  const first = f.wheel(0, { deltaX: 4 });
  await f.started;
  const pending = [
    f.wheel(0, { deltaX: 3 }),
    f.wheel(0, { deltaX: 5 }),
    f.wheel(0, { deltaX: -2 }),
  ];
  f.release();
  await Promise.all([first, ...pending]);
  assert.deepEqual(
    f.calls.map((c) => [c.deltaX, c.deltaY]),
    [
      [4, 0],
      [8, 0],
      [-2, 0],
    ],
  );
});

test('wheel batches never merge across authenticated participant identities', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const a = f.runtime.withActor({ id: 'alice', name: 'Alice' }, undefined, () => f.wheel(15));
  const b = f.runtime.withActor({ id: 'bob', name: 'Bob' }, undefined, () => f.wheel(25));
  f.release();
  await Promise.all([first, a, b]);
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8, 15, 25],
  );
});

test('revoking a lease cancels queued inputs before their native dispatch', async () => {
  const f = fixture();
  let allowed = true;
  const guard = () => {
    if (!allowed) throw new Error('revoked');
  };
  const first = f.wheel();
  await f.started;
  const queued = f.runtime.withActor({ id: 'bob', name: 'Bob' }, guard, () => f.wheel(100));
  allowed = false;
  const rejected = assert.rejects(queued, /revoked/);
  f.release();
  await first;
  await rejected;
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8],
  );
});

test('the native action queue is bounded and rejects overflow without replay', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const queued = Array.from({ length: 127 }, (_, i) => f.wheel(1, { x: i }));
  await assert.rejects(f.wheel(2, { x: 200 }), /操作过快/);
  f.release();
  await Promise.all([first, ...queued]);
  assert.equal(f.calls.length, 128);
});

test('same-tab document changes cancel queued input', async () => {
  const f = fixture();
  const first = f.wheel();
  await f.started;
  const queued = f.wheel(100);
  f.runtime.surfaceEpoch++;
  const rejected = assert.rejects(queued, /页面已改变/);
  f.release();
  await first;
  await rejected;
  assert.equal(f.calls.length, 1);
});

test('recorded scroll coalescing preserves each participant', () => {
  const f = fixture();
  f.runtime.recording = { id: 'r', title: 'test', startedAt: Date.now(), steps: [] };
  const step = {
    kind: 'scroll',
    description: 'scroll',
    url: 'https://example.test',
    source: 'human',
    tabId: 'tab',
    frameId: 'frame',
  };
  f.runtime.withActor({ id: 'alice', name: 'Alice' }, undefined, () => f.runtime.appendStep(step));
  f.runtime.withActor({ id: 'bob', name: 'Bob' }, undefined, () => f.runtime.appendStep(step));
  assert.deepEqual(
    f.runtime.recording.steps.map((s: any) => s.actor.id),
    ['alice', 'bob'],
  );
});

test('unpainted document refresh ignores a revoked caller and discards a capture from an older epoch', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const f = fixture();
  const frames: any[] = [];
  const tab = f.runtime.tabs.get('tab');
  f.runtime.browser = {};
  f.runtime.surfaceEpoch = 2;
  f.runtime.publishedEpoch = 1;
  f.runtime.options.onFrame = (frame: any) => frames.push(frame);
  let release!: () => void;
  let captures = 0;
  tab.page.call = async (method: string) => {
    if (method === 'Page.getLayoutMetrics') return { cssVisualViewport: { pageX: 0, pageY: 300 } };
    assert.equal(method, 'Page.captureScreenshot');
    captures++;
    if (captures === 1) await new Promise<void>((r) => (release = r));
    return { data: 'fixture-frame' };
  };
  f.runtime.withActor(
    { id: 'bob', name: 'Bob' },
    () => {
      throw new Error('revoked');
    },
    () => f.runtime.refreshUnpaintedSurface(tab),
  );
  t.mock.timers.tick(60);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(captures, 1, 'internal refresh is independent of the expired input lease');
  f.runtime.surfaceEpoch = 3;
  release();
  await f.runtime.queue;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(frames.length, 0, 'old document pixels must not get a fresh epoch');
  t.mock.timers.tick(60);
  await f.runtime.queue;
  await Promise.resolve();
  assert.equal(frames.length, 1);
  assert.equal(frames[0].epoch, 3);
});

test('a rejected old-epoch wheel cannot absorb input from a fresh displayed frame', async () => {
  const f = fixture(),
    actor = { id: 'bob', name: 'Bob' },
    guard = () => {};
  const first = f.wheel();
  await f.started;
  const old = f.runtime.withActor(actor, guard, () => f.wheel(10), 0);
  f.runtime.surfaceEpoch = 1;
  const rejected = assert.rejects(old, /页面已改变/);
  f.release();
  await first;
  await rejected;
  await f.runtime.withActor(actor, guard, () => f.wheel(20), 1);
  assert.deepEqual(
    f.calls.map((c) => c.deltaY),
    [8, 20],
  );
});
