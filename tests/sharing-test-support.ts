import type { Page } from '@playwright/test';

export async function installShareMetrics(page: Page, guest = false) {
  await page.evaluate((guest) => {
    (window as any).__name = (fn: unknown) => fn;
    const sample = ((window as any).__sharingMetrics = {
      decoded: [] as number[],
      received: [] as number[],
      inputs: [] as number[],
      results: [] as { at: number; ms: number }[],
      errors: [] as string[],
      lastSource: '',
      capture: false,
    });
    const now = () => performance.timeOrigin + performance.now();
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const source = this.currentSrc;
      return decode.call(this).then(() => {
        if (
          sample.capture &&
          this.classList.contains(guest ? 'shared-frame' : 'browser-frame') &&
          this.currentSrc === source &&
          source !== sample.lastSource
        ) {
          sample.lastSource = source;
          sample.decoded.push(now());
        }
      });
    };
    if (!guest)
      window.workbench.onEvent((e) => {
        if (sample.capture && e.type === 'browser:frame' && e.frame.data)
          sample.received.push(now());
      });
  }, guest);
}

export async function interceptGuestSocket(page: Page) {
  await page.addInitScript(() => {
    (window as any).__name = (fn: unknown) => fn;
    const Base = window.WebSocket;
    window.WebSocket = class extends Base {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).__testSocket = this;
        const requests = new Map<number, number>();
        const waiters: Array<() => void> = [];
        (window as any).__waitSharedInputs = () =>
          new Promise<void>((resolve, reject) => {
            if (!requests.size) return resolve();
            const timer = setTimeout(
              () => reject(new Error('Guest input acknowledgements did not drain')),
              3000,
            );
            waiters.push(() => {
              clearTimeout(timer);
              resolve();
            });
          });
        const send = this.send.bind(this);
        this.send = (data) => {
          const metrics = (window as any).__sharingMetrics;
          if (typeof data === 'string') {
            const m = JSON.parse(data);
            if (m.type === 'command' && metrics?.capture) {
              requests.set(m.id, performance.timeOrigin + performance.now());
            }
          }
          send(data);
        };
        this.addEventListener('message', (e) => {
          const metrics = (window as any).__sharingMetrics;
          const m = JSON.parse(e.data);
          if (m.type === 'frame') {
            (window as any).__lastFrameSize = { width: m.frame.width, height: m.frame.height };
            if (metrics?.capture) metrics.received.push(performance.timeOrigin + performance.now());
          }
          if (m.type === 'result' && requests.has(m.id)) {
            const t = performance.timeOrigin + performance.now();
            if (metrics?.capture) {
              metrics.results.push({ at: t, ms: t - requests.get(m.id)! });
              if (m.error) metrics.errors.push(m.error);
            }
            requests.delete(m.id);
            if (!requests.size) for (const resolve of waiters.splice(0)) resolve();
          }
        });
      }
    } as typeof WebSocket;
  });
}
export async function resetShareMetrics(page: Page) {
  await page.evaluate(() => {
    const m = (window as any).__sharingMetrics;
    m.decoded = [];
    m.received = [];
    m.inputs = [];
    m.results = [];
    m.errors = [];
    m.capture = true;
  });
}
export async function readShareMetrics(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).__sharingMetrics;
    m.capture = false;
    return {
      decoded: m.decoded,
      received: m.received,
      inputs: m.inputs,
      results: m.results,
      errors: m.errors,
    };
  });
}
export async function scrollShareSurface(page: Page, guest: boolean, duration = 5000) {
  return page.evaluate(
    async ({ guest, duration }) => {
      const m = (window as any).__sharingMetrics;
      const surface = document.querySelector(guest ? '.shared-surface' : '.browser-surface')!;
      const bounds = (
        guest ? document.querySelector('.shared-frame')! : surface
      ).getBoundingClientRect();
      const viewport = guest
        ? (window as any).__lastFrameSize
        : (await window.workbench.invoke<any>('app:snapshot')).browserFrame;
      const scale = guest
        ? Math.min(bounds.width / viewport.width, bounds.height / viewport.height)
        : bounds.width / viewport.width;
      const started = performance.timeOrigin + performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = performance.timeOrigin + performance.now();
          if (t - started >= duration) return resolve();
          m.inputs.push(t);
          surface.dispatchEvent(
            new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: bounds.x + bounds.width / 2,
              clientY: bounds.y + bounds.height * 0.7,
              deltaY: 8 * scale,
              deltaMode: 0,
            }),
          );
          setTimeout(tick, 1000 / 120);
        };
        tick();
      });
      return { started, ended: performance.timeOrigin + performance.now(), sent: m.inputs.length };
    },
    { guest, duration },
  );
}
export const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
export const frameSummary = (times: number[], duration: number, started = times[0]) => ({
  fps: times.length / (duration / 1000),
  frames: times.length,
  firstFrameAfterInputMs: times.length ? times[0] - started : null,
  intervalP95: percentile(
    times.slice(1).map((t, i) => t - times[i]),
    0.95,
  ),
});
