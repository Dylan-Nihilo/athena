/** Isolated renderer regression: every host action is controlled; no CLI, model or messaging calls. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const output = path.resolve('test-results/design-release/homepage');
await mkdir(output, { recursive: true });
const now = Date.now();
const snapshot = {
  localUser: { name: 'alina' },
  settings: { workspace: '/workspace/athena', agent: 'codex' },
  agents: [
    {
      id: 'codex',
      name: 'Codex',
      available: true,
      supported: true,
      authentication: 'ready',
      path: '/fixture/bin/codex',
      version: 'fixture-version',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      available: true,
      supported: false,
      path: '/fixture/bin/claude',
    },
    { id: 'opencode', name: 'OpenCode', available: false, supported: false },
    { id: 'gemini', name: 'Gemini CLI', available: false, supported: false },
  ],
  codexConnection: { status: 'ready', conversationId: 'home' },
  browser: {
    status: 'ready',
    engine: 'browseros',
    tabs: [],
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    recording: false,
    inspecting: false,
  },
  neo: { status: 'stopped' },
  feishu: { status: 'disconnected', paired: false },
  recordings: [],
  conversations: [
    { id: 'home', title: '新对话', updatedAt: now, workspace: '/workspace/athena', messages: [] },
    {
      id: 'a',
      title: '优化首页交互',
      updatedAt: now - 1000,
      workspace: '/workspace/athena',
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          text: '核对无障碍键盘操作和按钮文案。',
          createdAt: now,
          status: 'done',
          tools: [{ id: 't1', name: 'fixture', input: 'private_tool_marker', status: 'completed' }],
        },
      ],
    },
    {
      id: 'b',
      title: '检查网页表单',
      updatedAt: now - 2000,
      workspace: '/workspace/athena',
      messages: [{ id: 'b1', role: 'user', text: '确认表单说明完整。', createdAt: now }],
    },
    {
      id: 'legacy',
      title: '旧任务',
      updatedAt: now - 3000,
      messages: [{ id: 'l1', role: 'user', text: '兼容旧记录', createdAt: now }],
    },
    {
      id: 'other',
      title: '其他项目匹配',
      updatedAt: now - 4000,
      workspace: '/workspace/other',
      messages: [{ id: 'o1', role: 'user', text: '无障碍键盘', createdAt: now }],
    },
  ],
};
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '/src/renderer/App';
import '/src/renderer/styles.css';
const fixture=window.__homeFixture={snapshot:${JSON.stringify(snapshot)},listeners:[],calls:[],pendingSnapshots:[],ready:false,failSend:false,folderChoice:null};
fixture.emit=event=>{for(const listener of fixture.listeners)listener(event)};
fixture.release=()=>{fixture.ready=true;for(const resolve of fixture.pendingSnapshots)resolve(structuredClone(fixture.snapshot));fixture.pendingSnapshots=[]};
fixture.browser=patch=>{Object.assign(fixture.snapshot.browser,patch);fixture.emit({type:'browser:state',state:structuredClone(fixture.snapshot.browser)})};
fixture.feishu=state=>fixture.emit({type:'feishu:state',state});
window.workbench={
 async invoke(action,payload){
  fixture.calls.push({action,payload});
  if(action==='app:snapshot')return fixture.ready?structuredClone(fixture.snapshot):new Promise(resolve=>fixture.pendingSnapshots.push(resolve));
  if(action==='models:list')return [{model:'fixture-model',name:'Fixture model',efforts:[{id:'low',description:'Low'},{id:'high',description:'High'}],defaultEffort:'low'}];
  if(action==='conversation:prepare')return {status:'ready',conversationId:payload.conversationId};
  if(action==='conversation:new'){const item={id:'new-'+fixture.calls.length,title:'新对话',updatedAt:Date.now(),workspace:fixture.snapshot.settings.workspace,messages:[]};fixture.snapshot.conversations.unshift(item);return item;}
  if(action==='conversation:send'){
   if(fixture.failSend)throw new Error('测试发送失败，请稍后重试。');
   const item=fixture.snapshot.conversations.find(c=>c.id===payload.id);
   item.messages.push({id:'user-'+Date.now(),role:'user',text:payload.text,createdAt:Date.now()},{id:'assistant-'+Date.now(),role:'assistant',text:'',createdAt:Date.now(),status:'streaming'});
   fixture.emit({type:'conversation:updated',conversation:structuredClone(item)});return {conversationId:item.id};
  }
  if(action==='conversation:stop'){for(const item of fixture.snapshot.conversations){for(const message of item.messages)if(message.status==='streaming')message.status='done';fixture.emit({type:'conversation:updated',conversation:structuredClone(item)})}return true;}
  if(action==='settings:workspace'){if(!fixture.folderChoice)return null;fixture.snapshot.settings.workspace=fixture.folderChoice;return structuredClone(fixture.snapshot.settings);}
  if(action==='settings:model'){fixture.snapshot.settings.modelSelection=payload;return structuredClone(fixture.snapshot.settings);}
  if(action==='agents:refresh')return fixture.snapshot.agents;
  if(action==='browser:inspect'){fixture.browser({inspecting:payload.enabled});return true;}
  if(action==='recording:start'){fixture.browser({recording:true});return true;}
  if(action==='browser:resize')return {width:payload.width,height:payload.height,deviceScaleFactor:1};
  if(action==='share:state')return {active:false,participants:[]};
  if(action==='usage:snapshot')return {records:[],since:Date.now(),updatedAt:Date.now()};
  if(action==='neo:records')return [];
  return true;
 },
 onEvent(fn){fixture.listeners.push(fn);return()=>{fixture.listeners=fixture.listeners.filter(item=>item!==fn)}}
};
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
`;
const fixture: Plugin = {
  name: 'homepage-ui-fixture',
  resolveId(id) {
    if (id === '/homepage-entry.js') return '\0homepage-entry';
  },
  load(id) {
    if (id === '\0homepage-entry') return entry;
  },
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url !== '/') return next();
      response.setHeader('content-type', 'text/html');
      response.end(
        await server.transformIndexHtml(
          '/index.html',
          '<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="/homepage-entry.js"></script>',
        ),
      );
    });
  },
};
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: path.join(output, '.vite-cache'),
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'motion/react',
      '@heroui/react',
      '@heroui-pro/react',
    ],
  },
  appType: 'custom',
  logLevel: 'error',
  plugins: [react(), tailwindcss(), fixture],
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await chromium.launch({
  executablePath: path.resolve(
    '../browseros-runtime/BrowserOS neo.app/Contents/MacOS/BrowserOS neo',
  ),
  headless: true,
  args: [
    '--disable-browseros-server',
    '--disable-browseros-server-updater',
    '--disable-browseros-extensions',
    '--browseros-disable-url-overrides',
    '--use-mock-keychain',
    '--disable-sync',
  ],
});
const checks: string[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(8000);
  await page.addInitScript('window.__name = (value) => value;');
  page.on('pageerror', (error) => errors.push(error.message));
  const calls = (action: string) =>
    page.evaluate(
      (name) => (window as any).__homeFixture.calls.filter((c: any) => c.action === name),
      action,
    );
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.getByRole('status')).toContainText('正在打开工作区');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: '搜索对话' })).toHaveCount(0);
  assert.equal((await calls('models:list')).length, 0);
  await page.evaluate(() => (window as any).__homeFixture.release());
  await expect(page.getByRole('heading', { name: '今天想完成什么？' })).toBeVisible();
  await expect(page.getByRole('button', { name: '本机用户菜单' })).toContainText('alina');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const geometry = await page.evaluate(() => {
    const info = (selector: string) => {
      const node = document.querySelector(selector)!;
      const b = node.getBoundingClientRect();
      const c = getComputedStyle(node);
      return {
        width: b.width,
        height: b.height,
        radius: c.borderRadius,
        border: c.borderLeftWidth,
        font: c.fontSize,
      };
    };
    return {
      sidebar: info('.athena-sidebar'),
      logo: info('.brand-mark'),
      welcomeLogo: info('.welcome-symbol'),
      title: info('.welcome h1'),
      composer: info('.composer'),
      shell: info('[data-slot="prompt-input-shell"]'),
    };
  });
  assert.equal(geometry.sidebar.width, 216);
  assert.equal(geometry.logo.width, 34);
  assert.equal(geometry.welcomeLogo.width, 56);
  assert.equal(geometry.title.font, '36px');
  assert.equal(geometry.composer.width, 760);
  assert.equal(geometry.shell.radius, '24px');
  assert.equal(geometry.shell.border, '0px');
  await page.screenshot({ path: path.join(output, 'home-light.png') });
  checks.push(
    'Initial snapshot gate prevents early model requests; actual local username/initial, 216px sidebar, 760px composer, 34/56px official logos, neutral borderless 24px surface',
  );

  const userMenu = page.getByRole('button', { name: '本机用户菜单' });
  await userMenu.click();
  await expect(page.locator('.local-user-menu')).toBeVisible();
  await expect(page.locator('.local-user-menu')).not.toContainText(/订阅|账户|登录/);
  await page.screenshot({ path: path.join(output, 'user-menu.png') });
  const appearance = async (label: string) => {
    if (!(await page.locator('.local-user-menu').isVisible())) await userMenu.click();
    await page.getByRole('menuitem', { name: /外观/ }).hover();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
  };
  await appearance('深色');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('athena.appearance')), 'dark');
  await page.screenshot({ path: path.join(output, 'home-dark.png') });
  await appearance('跟随系统');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await appearance('浅色');
  checks.push(
    'User menu actions have no account features; light/dark/system preference is persisted and reacts to system changes',
  );

  await page.keyboard.press('Meta+k');
  const search = page.getByRole('searchbox', { name: '搜索对话标题或消息' });
  await search.fill('无障碍键盘');
  assert.equal((await page.locator('.conversation-search').boundingBox())?.width, 704);
  await expect(page.getByRole('menuitem', { name: /^优化首页交互/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^其他项目匹配/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(output, 'search-results.png') });
  await search.fill('private_tool_marker');
  await expect(page.getByText('没有找到相关对话', { exact: true })).toBeVisible();
  await search.fill('兼容旧记录');
  await expect(page.getByRole('menuitem', { name: /^旧任务/ })).toBeVisible();
  await search.fill('优化首页');
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '搜索对话' })).toHaveCount(0);
  await expect(page.locator('.topbar-title')).toContainText('优化首页交互');
  checks.push(
    'Search matches visible message text and titles, limits current workspace while retaining legacy records, excludes raw tool payloads, and supports arrows/Enter/Escape',
  );

  await page.keyboard.press('Meta+n');
  const composer = page.getByRole('textbox', { name: '发送给 Agent 的任务' });
  await composer.fill('保留这段草稿');
  await userMenu.click();
  await page.keyboard.press('Escape');
  await expect(composer).toHaveValue('保留这段草稿');
  await page.getByRole('button', { name: '添加网页上下文', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'context-menu.png') });
  await page.getByRole('menuitem', { name: '当前页面', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '当前页面', exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue('保留这段草稿');
  assert.equal((await calls('conversation:send')).length, 0);
  await page.locator('.browser-keyboard').focus();
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: '搜索对话' })).toBeVisible();
  await expect(search).toBeFocused();
  await page.keyboard.type('键盘');
  await expect(search).toHaveValue('键盘');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '搜索对话' })).toHaveCount(0);
  await expect(page.locator('.browser-keyboard')).toBeFocused();
  await page.evaluate(() => (window as any).__homeFixture.browser({ status: 'starting' }));
  await page.getByRole('button', { name: '添加网页上下文', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '选取页面元素', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.getByRole('menuitem', { name: '录制网页操作', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__homeFixture.browser({ status: 'ready' }));
  await page.getByRole('button', { name: '添加网页上下文', exact: true }).click();
  await page.getByRole('menuitem', { name: '录制网页操作', exact: true }).click();
  await expect(page.locator('.composer-recording')).toContainText('录制中');
  assert.equal((await calls('recording:start')).length, 1);
  await page.evaluate(() => (window as any).__homeFixture.browser({ recording: false }));
  await page.getByRole('button', { name: '收起浏览器', exact: true }).first().click();
  checks.push(
    'Context actions preserve drafts, do not auto-send, gate element/recording on browser readiness and call existing recording action',
  );

  const sendCount = (await calls('conversation:send')).length;
  await composer.evaluate((node) =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 229,
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal((await calls('conversation:send')).length, sendCount);
  await page.evaluate(() => {
    (window as any).__homeFixture.failSend = true;
  });
  await composer.press('Enter');
  await expect(page.getByRole('alert')).toContainText('测试发送失败');
  await expect(composer).toHaveValue('保留这段草稿');
  await page.evaluate(() => {
    (window as any).__homeFixture.failSend = false;
  });
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+n');
  await composer.fill('下一段草稿');
  await expect(page.getByText('另一任务进行中', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止任务', exact: true }).click();
  await expect(composer).toHaveValue('下一段草稿');
  await expect(page.getByRole('button', { name: '发送任务', exact: true })).toBeEnabled();
  checks.push(
    'IME confirmation does not submit; failed send retains draft; acknowledged send clears it; global busy switches to Stop and stopping preserves the next draft without queueing',
  );

  await page.locator('.sidebar-settings').click();
  await expect(page.locator('.settings-workspace')).toBeVisible();
  await expect(page.getByRole('heading', { name: '使用你已有的 Agent' })).toBeVisible();
  await expect(page.locator('.settings-workspace')).toContainText('/fixture/bin/codex');
  await expect(page.locator('.settings-workspace')).toContainText('Claude Code');
  await page.evaluate(() => {
    const fixture = (window as any).__homeFixture;
    fixture.emit({
      type: 'codex:state',
      state: {
        status: 'error',
        conversationId: fixture.snapshot.conversations[0].id,
        message: '本机连接测试错误',
      },
    });
  });
  await expect(page.locator('.agent-connection-card')).toContainText('连接失败');
  await expect(page.locator('.agent-connection-card').getByRole('alert')).toHaveText(
    '本机连接测试错误',
  );
  await page.evaluate(() => {
    const fixture = (window as any).__homeFixture;
    fixture.emit({
      type: 'codex:state',
      state: { status: 'ready', conversationId: fixture.snapshot.conversations[0].id },
    });
  });
  assert.equal(
    await page
      .locator('.settings-workspace-card > .card__content')
      .evaluate((node) => getComputedStyle(node).flexDirection),
    'row',
  );
  assert.equal(await page.getByRole('dialog', { name: '设置与连接' }).count(), 0);
  await page.screenshot({ path: path.join(output, 'settings-agent.png') });
  await page.getByRole('tab', { name: '浏览器', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择 BrowserOS neo', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '飞书', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建专用机器人', exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as any).__homeFixture.feishu({ status: 'restoring', paired: false }),
  );
  await expect(page.getByRole('heading', { name: '正在恢复飞书连接' })).toBeVisible();
  await page.evaluate(() =>
    (window as any).__homeFixture.feishu({ status: 'error', paired: false, restoreFailed: true }),
  );
  await expect(page.getByRole('button', { name: '重试恢复连接' })).toBeVisible();
  await page.evaluate(() =>
    (window as any).__homeFixture.feishu({
      status: 'connected',
      paired: false,
      pairingCode: 'FIXTURE',
      appId: 'fixture-app',
    }),
  );
  await expect(page.getByRole('button', { name: '绑定 FIXTURE' })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'settings-feishu.png') });
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  await expect(composer).toHaveValue('下一段草稿');
  await page.locator('.sidebar-settings').click();
  await page.keyboard.press('Meta+l');
  await expect(page.locator('.settings-workspace')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '网页地址' })).toBeFocused();
  await page.locator('.topbar .browser-toggle').click();
  checks.push(
    'Settings occupies the main workspace, retains real provider detail, browser controls and Feishu disconnected/restoring/failed/pairing branches, and preserves draft on return',
  );

  const beforeCancel = (await calls('conversation:new')).length;
  await userMenu.click();
  await page.getByRole('menuitem', { name: /^选择工作目录/ }).click();
  assert.equal((await calls('conversation:new')).length, beforeCancel);
  await expect(composer).toHaveValue('下一段草稿');
  await page.evaluate(() => {
    (window as any).__homeFixture.folderChoice = '/workspace/next';
  });
  await userMenu.click();
  await page.getByRole('menuitem', { name: /^选择工作目录/ }).click();
  await expect(composer).toHaveValue('');
  await expect(page.locator('.workspace-selector')).toContainText('next');
  checks.push(
    'Cancelled workspace picker changes nothing; accepted workspace updates directory and creates a new conversation',
  );

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: path.join(output, 'home-1024.png') });
  assert.ok(
    await page.locator('.work-area').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  await page.keyboard.press('Meta+b');
  await expect(page.getByRole('button', { name: '展开侧栏', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+b');
  await expect(userMenu).toBeVisible();
  await page.locator('.sidebar-settings').click();
  await page.screenshot({ path: path.join(output, 'settings-1024.png') });
  assert.ok(
    await page
      .locator('.settings-workspace')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  checks.push(
    '1024px layout and sidebar keyboard toggle remain usable without horizontal overflow',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(
      {
        passed: true,
        source: 'controlled-renderer-host-fixture',
        realModelCalls: 0,
        realMessagesSent: 0,
        geometry,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks: checks.length, output }));
} finally {
  await browser.close();
  await server.close();
}
