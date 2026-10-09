const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startFixture } = require('./ssh-fixture.cjs');
async function waitUntil(check) {
  const deadline = Date.now() + 15000;
  while (!(await check())) { if (Date.now() > deadline) throw new Error('Condition timed out'); await new Promise((resolve) => setTimeout(resolve, 100)); }
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mnl-features-'));
  const fixture = await startFixture({ realShell: true });
  const output = path.resolve('test-results'); fs.mkdirSync(output, { recursive: true });
  const bootstrap = path.join(profile, 'main.cjs');
  fs.writeFileSync(bootstrap, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('out/main/index.js'))});`);
  let app; let page;
  const errors = [];
  try {
    app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', bootstrap], timeout: 30000 });
    page = await app.firstWindow(); page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('h1');
    const hosts = await page.evaluate(async (port) => {
      localStorage.setItem('mobanexterm.settings', JSON.stringify({ language: 'en', shellIntegration: true }));
      const base = { host: '127.0.0.1', port, username: 'tester', authKind: 'password', password: 'fixture-only' };
      return [await window.api.session.create({ ...base, name: 'Robot A' }), await window.api.session.create({ ...base, name: 'Robot B' })];
    }, fixture.port);
    await page.reload();
    const connect = async (name) => {
      await page.getByRole('button', { name: 'Sessions', exact: true }).click();
      await page.getByRole('button').filter({ hasText: name }).first().dblclick();
      await waitUntil(async () => (await page.locator('footer').textContent()).includes('Connected'));
      await page.getByRole('button', { name: 'Commands', exact: true }).click();
    };
    await connect('Robot A');
    await waitUntil(async () => (await page.getByTestId('remote-performance').textContent()).includes('CPU 40%'));
    const metrics = await page.getByTestId('remote-performance').textContent();
    assert(metrics.includes('MEM 60%') && metrics.includes('/ 70%'));
    assert(!fixture.input.join('').includes('__MNL_STAT__'), 'Monitoring never enters interactive shell');
    const directory = path.join(fixture.home, "中文 ' # work"); fs.mkdirSync(directory);
    const openEditor = async () => {
      const created = app.waitForEvent('window');
      await page.getByRole('button', { name: 'Add command', exact: true }).click();
      const editor = await created; editor.on('pageerror', (e) => errors.push(e.message));
      await editor.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
      return editor;
    };
    let editor = await openEditor();
    await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Capture robot');
    await editor.getByRole('textbox', { name: 'Working directory', exact: true }).fill(directory);
    assert.equal(await editor.getByRole('combobox', { name: 'Available for' }).inputValue(), hosts[0].id);
    const commandField = editor.getByRole('textbox', { name: 'Shell commands', exact: true });
    await commandField.fill('if true; then\necho broken');
    await editor.getByRole('button', { name: 'Check Bash syntax', exact: true }).click();
    await editor.getByRole('status').filter({ hasText: 'syntax error' }).waitFor();
    const script = "# Save a small diagnostic sample\nprintf 'RUN:%s\\n' \"$PWD\"\ncat <<'END' > result.txt\n中文 payload $HOME\nsecond line\nEND";
    await commandField.fill(script);
    await editor.getByRole('button', { name: 'Check Bash syntax', exact: true }).click();
    await editor.getByRole('status').filter({ hasText: 'syntax OK' }).waitFor();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await waitUntil(async () => (await editor.locator('footer').textContent()).startsWith('Saved'));
    await editor.screenshot({ path: path.join(output, 'shortcut-editor.png') });
    const placement = await app.evaluate(({ BrowserWindow, screen }) => {
      const wins = BrowserWindow.getAllWindows();
      const main = wins.find((w) => !w.webContents.getURL().includes('#shortcut?'));
      const edit = wins.find((w) => w.webContents.getURL().includes('#shortcut?'));
      return { sameDisplay: screen.getDisplayMatching(main.getBounds()).id === screen.getDisplayMatching(edit.getBounds()).id, modal: edit.isModal() };
    });
    assert(placement.sameDisplay); assert(!placement.modal);
    await page.bringToFront();
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type("printf 'EDITOR_OPEN_OK\\n'"); await page.keyboard.press('Enter');
    await waitUntil(async () => (await page.locator('.xterm-rows').textContent()).includes('EDITOR_OPEN_OK'));
    await editor.close();
    await page.getByRole('button', { name: 'Run Capture robot', exact: true }).click();
    await waitUntil(() => fs.existsSync(path.join(directory, 'result.txt')));
    assert.equal(fs.readFileSync(path.join(directory, 'result.txt'), 'utf8'), '中文 payload $HOME\nsecond line\n');
    // Open another new editor after the first was saved; global scope follows any active host.
    editor = await openEditor();
    await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Global check');
    await editor.getByRole('combobox', { name: 'Available for' }).selectOption('');
    await editor.getByRole('textbox', { name: 'Shell commands', exact: true }).fill("printf 'GLOBAL_OK\\n'");
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await waitUntil(async () => (await editor.locator('footer').textContent()).startsWith('Saved'));
    await editor.close();
    await page.screenshot({ path: path.join(output, 'performance-shortcuts.png') });
    const saved = await page.evaluate(() => window.api.shortcuts.list());
    const local = saved.find((s) => s.name === 'Capture robot');
    assert(local && local.sessionId === hosts[0].id);
    await connect('Robot B');
    await page.getByRole('button', { name: 'Run Capture robot', exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Run Global check', exact: true }).click();
    await waitUntil(async () => (await page.locator('.xterm-rows').last().textContent()).includes('GLOBAL_OK'));
    // Full-screen editors must not receive injected shell commands.
    fixture.shells.at(-1).write('\x1b[?1049h\x1b[2J\x1b[Hfullscreen');
    await waitUntil(async () => (await page.locator('.xterm-rows').last().textContent()).includes('fullscreen'));
    const before = fixture.input.length;
    await page.getByRole('button', { name: 'Run Global check', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'full-screen' }).waitFor();
    assert.equal(fixture.input.length, before);
    fixture.shells.at(-1).write('\x1b[?1049l');
    // Sampling failure clears stale percentages without interrupting the terminal.
    fixture.monitor.fail = true;
    await waitUntil(async () => (await page.getByTestId('remote-performance').textContent()).includes('Unavailable'));
    assert(!(await page.getByTestId('remote-performance').textContent()).includes('40%'));
    fixture.shells.at(-1).close();
    await page.getByTestId('remote-performance').waitFor({ state: 'detached' });
    assert(await page.getByRole('button', { name: 'Run Global check', exact: true }).isDisabled());
    await page.reload();
    const reloaded = await page.evaluate(() => window.api.shortcuts.list());
    assert.equal(reloaded.length, 2); assert.equal(reloaded.find((s) => s.id === local.id).command, script);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: independent metrics, unavailable/disconnect states, non-modal command editor, syntax check, multiline execution, host/global scopes, fullscreen guard and persistence');
  } catch (e) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'features-failure.png') }).catch(() => {});
    throw e;
  } finally {
    try { if (app) await app.close(); } finally { fixture.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
