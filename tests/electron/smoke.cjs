const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startFixture } = require('./ssh-fixture.cjs');

async function waitUntil(check) {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mobanexterm-e2e-'));
  const output = path.resolve('test-results'); fs.mkdirSync(output, { recursive: true });
  const bootstrap = path.join(profile, 'main.cjs');
  fs.writeFileSync(bootstrap, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('out/main/index.js'))});`);
  const fixture = await startFixture();
  let app;
  let bashFixture;
  const errors = [];
  try {
    app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', bootstrap], timeout: 30000 });
    const page = await app.firstWindow(); page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('h1');
    await page.screenshot({ path: path.join(output, 'workspace.png') });
    await page.evaluate(async (port) => {
      // This protocol fixture emits OSC 7 natively: verify explicit integration opt-out too.
      localStorage.setItem('mobanexterm.settings', JSON.stringify({ shellIntegration: false }));
      await window.api.session.create({ name: 'Loopback fixture', host: '127.0.0.1', port, username: 'tester', authKind: 'password', password: 'fixture-only' });
    }, fixture.port);
    await page.reload();
    await page.getByRole('button').filter({ hasText: 'Loopback fixture' }).first().dblclick();
    await page.waitForSelector('.xterm-rows');
    await page.getByRole('button', { name: /config.txt/ }).waitFor();
    assert(fixture.sizes[0].cols > 80, 'PTY receives actual visible width at startup');
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type('echo hello');
    await page.keyboard.press('Enter');
    await waitUntil(async () => (await page.locator('.xterm-rows').textContent()).includes('echo hello'));
    assert(fixture.input.join('').includes('echo hello'));
    assert(!fixture.input.join('').includes('stty'), 'No unsolicited shell commands');
    await page.keyboard.press('ArrowUp');
    await waitUntil(() => fixture.input.join('').includes('\x1b[A'));
    fixture.shells[0].write('\x1b[?1049h\x1b[2J\x1b[Hvim-screen-fixture');
    await waitUntil(async () => (await page.locator('.xterm-rows').textContent()).includes('vim-screen-fixture'));
    fixture.shells[0].write('\x1b[?1049l');
    await waitUntil(async () => (await page.locator('.xterm-rows').textContent()).includes('echo hello'));
    const previousCols = fixture.sizes.at(-1).cols;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 720));
    await waitUntil(() => fixture.sizes.at(-1).cols < previousCols);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
    await waitUntil(() => fixture.sizes.at(-1).cols === previousCols);
    await page.keyboard.press('Control+Shift+F');
    const search = page.getByRole('textbox', { name: /Find in terminal|查找/ });
    await search.fill('Connected'); await search.press('Enter');
    await search.press('Escape');
    fixture.files.set('/workspace/from-terminal.txt', Buffer.from('created outside file browser'));
    await page.getByRole('button', { name: /from-terminal.txt/ }).waitFor({ timeout: 10000 });
    fixture.files.delete('/workspace/from-terminal.txt');
    await page.getByRole('button', { name: /from-terminal.txt/ }).waitFor({ state: 'detached', timeout: 10000 });
    const editorPromise = app.waitForEvent('window');
    await page.getByRole('button', { name: /config.txt/ }).dblclick();
    const editor = await editorPromise; editor.on('pageerror', (e) => errors.push(e.message));
    assert(await app.evaluate(({ BrowserWindow, screen }) => {
      const windows = BrowserWindow.getAllWindows();
      const main = windows.find((w) => !w.webContents.getURL().includes('#editor?'));
      const editor = windows.find((w) => w.webContents.getURL().includes('#editor?'));
      return screen.getDisplayMatching(main.getBounds()).id === screen.getDisplayMatching(editor.getBounds()).id;
    }), 'Editor opens on the invoking window display');
    const area = editor.getByRole('textbox', { name: '/workspace/config.txt', exact: true });
    await area.waitFor(); await waitUntil(async () => (await area.inputValue()).includes('hello world'));
    await area.fill('hello world\nhello SSH\n中文配置\n');
    await area.press('Control+h');
    await editor.getByRole('textbox', { name: /Find in terminal|查找/ }).fill('hello');
    await editor.getByRole('textbox', { name: /Replace|替换/, exact: true }).fill('goodbye');
    await editor.getByRole('button', { name: /Replace all|全部替换/ }).click();
    assert((await area.inputValue()).startsWith('goodbye world\ngoodbye SSH'));
    await editor.screenshot({ path: path.join(output, 'editor.png') });
    // The fixture deliberately has no OpenSSH atomic-rename extension: saving must fail safely.
    await editor.getByRole('button', { name: /^Save$|^保存$/ }).click();
    await editor.getByText(/Server does not support/).waitFor();
    assert(fixture.files.get('/workspace/config.txt').toString().startsWith('hello world'));
    await editor.screenshot({ path: path.join(output, 'editor-save-error.png') });
    await app.evaluate(({ dialog }) => { globalThis.discardPrompts = 0; dialog.showMessageBoxSync = () => { globalThis.discardPrompts++; return 0; }; });
    await editor.evaluate(() => window.api.app.close());
    await page.waitForTimeout(200);
    assert(!editor.isClosed(), 'Cancel keeps dirty editor open');
    assert.equal(await app.evaluate(() => globalThis.discardPrompts), 1);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    await editor.evaluate(() => window.api.app.close());
    await page.screenshot({ path: path.join(output, 'terminal.png') });
    fixture.shells[0].close();
    const terminalText = () => page.locator('.xterm-rows').textContent();
    await waitUntil(async () => /Press R to reconnect|按 R 重新连接/.test(await terminalText()));
    assert((await terminalText()).includes('echo hello'), 'Disconnect retains previous output');
    assert.equal(await page.locator('.connection-state-overlay').count(), 0, 'No terminal overlay');
    const reconnectLine = page.locator('.xterm-rows > div').filter({ hasText: /Press R to reconnect|按 R 重新连接/ });
    assert(await reconnectLine.locator('span').evaluateAll((spans) => spans.some((span) => {
      const color = getComputedStyle(span).color;
      return color === 'rgb(255, 90, 90)' || color === 'rgb(220, 38, 38)';
    })), 'Reconnect instructions are ANSI red');
    await page.screenshot({ path: path.join(output, 'disconnected.png') });
    // Search and selection remain available after disconnect.
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.press('Control+Shift+F');
    await search.fill('echo hello'); await search.press('Enter');
    await page.locator('.xterm-selection div').first().waitFor();
    await search.press('Escape');
    await page.keyboard.press('r');
    await waitUntil(() => fixture.shells.length === 2);
    await page.getByRole('button', { name: /config.txt/ }).waitFor();
    assert((await terminalText()).includes('echo hello'), 'Reconnect retains previous output');
    assert.equal((await terminalText()).match(/Press R to reconnect|按 R 重新连接/g)?.length, 1, 'Disconnect notice is not duplicated');
    fixture.shells[1].write(Array.from({ length: 100 }, (_, i) => `\r\nscrollback-line-${i}`).join(''));
    await waitUntil(async () => (await terminalText()).includes('scrollback-line-99'));
    // Disconnect inside an alternate-screen application preserves its last screen too.
    fixture.shells[1].write('\x1b[?1049h\x1b[2J\x1b[Hlast-vim-screen');
    await waitUntil(async () => (await terminalText()).includes('last-vim-screen'));
    fixture.shells[1].close();
    await waitUntil(async () => /Press R to reconnect|按 R 重新连接/.test(await terminalText()));
    assert((await terminalText()).includes('last-vim-screen'), 'Final alternate screen is retained');
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.press('Control+Shift+F');
    await search.fill('echo hello'); await search.press('Enter');
    await waitUntil(async () => (await terminalText()).includes('echo hello'));
    await page.locator('.xterm-selection div').first().waitFor();
    await search.press('Escape');
    // Real Bash has no preconfigured OSC 7: exercise the opt-out recovery action and cd workflow.
    bashFixture = await startFixture({ realShell: true });
    const specialDirectory = path.join(bashFixture.home, "中文 space #%?\\ ' [test]");
    fs.mkdirSync(specialDirectory);
    await page.evaluate(async (port) => {
      await window.api.session.create({ name: 'Bash directory fixture', host: '127.0.0.1', port, username: 'tester', authKind: 'password', password: 'fixture-only' });
    }, bashFixture.port);
    await page.reload();
    await page.getByRole('button').filter({ hasText: 'Bash directory fixture' }).first().dblclick();
    await page.getByRole('button', { name: /Enable integration and reconnect|启用目录集成并重新连接/ }).click();
    await waitUntil(() => bashFixture.shells.length === 2);
    const pathInput = page.getByRole('textbox', { name: /Remote path|远程路径/ });
    await waitUntil(async () => (await page.locator('footer').textContent()).includes(bashFixture.home));
    const typeCommand = async (command) => {
      await page.locator('.xterm-helper-textarea').focus();
      await page.keyboard.type(command); await page.keyboard.press('Enter');
    };
    const quotedDirectory = "'" + specialDirectory.replaceAll("'", "'\\''") + "'";
    await typeCommand(`cd ${quotedDirectory}`);
    await waitUntil(async () => (await pathInput.inputValue()) === specialDirectory).catch(async (error) => {
      console.error({ input: bashFixture.input, path: await pathInput.inputValue(), footer: await page.locator('footer').textContent(), terminal: await page.locator('.xterm-rows').textContent() });
      throw error;
    });
    await waitUntil(() => bashFixture.listedPaths.includes(specialDirectory));
    const follow = page.getByRole('button', { name: /Follow terminal directory|跟随终端目录/ });
    await follow.click();
    await typeCommand('cd ..');
    await waitUntil(async () => !(await page.locator('footer').textContent()).includes(specialDirectory));
    assert.equal(await pathInput.inputValue(), specialDirectory, 'Manual browsing is not overwritten by cd');
    await follow.click();
    await waitUntil(async () => (await pathInput.inputValue()) === bashFixture.home);
    await typeCommand(`cd ${quotedDirectory}`);
    await waitUntil(async () => (await pathInput.inputValue()) === specialDirectory);
    bashFixture.shells.at(-1).close();
    await waitUntil(async () => /Press R to reconnect|按 R 重新连接/.test(await page.locator('.xterm-rows').textContent()));
    await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.press('r');
    await waitUntil(() => bashFixture.shells.length === 3);
    await waitUntil(async () => (await page.locator('footer').textContent()).includes('已连接') || (await page.locator('footer').textContent()).includes('Connected'));
    await typeCommand("printf 'RESTORED:%s\\n' \"$PWD\"");
    await waitUntil(async () => (await page.locator('.xterm-rows').textContent()).includes('RESTORED:' + specialDirectory));
    assert.equal(await pathInput.inputValue(), specialDirectory, 'Reconnect restores and follows the last directory');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: real SSH/PTY, terminal input/search, SFTP polling, independent editor, replace-all, safe save failure, dirty-close protection, editor display, inline disconnect notices, scrollback, real Bash cd/follow/manual/reconnect');
  } finally {
    try { if (app) await app.close(); }
    finally { bashFixture?.close(); fixture.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
