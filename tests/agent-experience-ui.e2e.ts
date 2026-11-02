/** Local UI regression; injects one controlled notice, no model calls. */
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { seedLegacyWorkspace } from './legacy-workspace-fixture';
const dir = await mkdtemp(path.resolve('.runtime/notice-ui-'));
await seedLegacyWorkspace(dir);
const output = path.resolve('test-results/agent-experience/ui');
await mkdir(output, { recursive: true });
const binary = process.env.WORKBENCH_EXPERIENCE_BINARY;
const app = await electron.launch({
  executablePath: binary,
  args: binary ? [] : ['.'],
  cwd: process.cwd(),
  env: { ...process.env, WORKBENCH_USER_DATA_DIR: dir },
});
try {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '今天想完成什么？' })).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.webContents.setBackgroundThrottling(false);
    w.hide();
    w.webContents.send('workbench:event', {
      type: 'notice',
      message: '用量记录未能保存，请检查本机存储空间。',
      level: 'error',
    });
  });
  const text = page.getByText('用量记录未能保存，请检查本机存储空间。', { exact: true });
  await expect(text).toBeAttached();
  const state = await text.evaluate((n) => ({
    opacity: getComputedStyle(n).opacity,
    height: n.parentElement!.getBoundingClientRect().height,
  }));
  console.log(JSON.stringify(state));
  assert.equal(state.opacity, '1');
  assert.ok(state.height > 32);
  await page.screenshot({
    path: path.resolve('test-results/agent-experience/ui/notice.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await expect(text).toHaveCount(0);
  await writeFile(
    path.join(output, 'notice-verification.json'),
    JSON.stringify({
      passed: true,
      source: 'controlled-notice-event',
      ...state,
      closeAction: true,
    }),
  );
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
