const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
async function waitUntil(check) {
  const deadline = Date.now() + 15000;
  while (!(await check())) { if (Date.now() > deadline) throw new Error('Condition timed out'); await new Promise((resolve) => setTimeout(resolve, 100)); }
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mnl-shortcut-transfer-'));
  const output = path.resolve('test-results'); fs.mkdirSync(output, { recursive: true });
  const bootstrap = path.join(profile, 'main.cjs');
  fs.writeFileSync(bootstrap, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('out/main/index.js'))});`);
  let app; let page;
  const errors = [];
  const file = path.join(profile, 'shared-commands.json');
  try {
    app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', bootstrap], timeout: 30000 });
    page = await app.firstWindow(); page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('h1');
    const script = "# 中文诊断\ncat <<'END'\n$HOME 'literal'\nsecond line\nEND";
    const hosts = await page.evaluate(async (script) => {
      localStorage.setItem('mobanexterm.settings', JSON.stringify({ language: 'en' }));
      const base = { host: '192.0.2.1', port: 22, username: 'tester', authKind: 'password', password: 'must-not-export-password' };
      const a = await window.api.session.create({ ...base, name: 'Robot A' });
      const b = await window.api.session.create({ ...base, name: 'Robot B' });
      const c = await window.api.session.create({ ...base, name: 'Temporary target' });
      await window.api.shortcuts.save({ name: 'Host diagnostics', directory: "/tmp/中文 ' dir", command: script, sessionId: a.id });
      await window.api.shortcuts.save({ name: 'Shared check', directory: '', command: 'printf hello', sessionId: null });
      await window.api.shortcuts.save({ name: 'Private setup', directory: '~', command: 'pwd', sessionId: b.id });
      return [a, b, c];
    }, script);
    await page.reload();
    await page.getByRole('button', { name: 'Commands', exact: true }).click();
    const original = await page.evaluate(() => window.api.shortcuts.list());
    const saveDialog = async (canceled) => app.evaluate(({ dialog }, arg) => { dialog.showSaveDialog = async () => ({ canceled: arg.canceled, filePath: arg.file }); }, { canceled, file });
    const openDialog = async (filename, canceled = false) => app.evaluate(({ dialog }, arg) => { dialog.showOpenDialog = async () => ({ canceled: arg.canceled, filePaths: arg.canceled ? [] : [arg.filename] }); }, { filename, canceled });
    const openExport = async () => {
      await page.getByRole('button', { name: 'Export commands', exact: true }).click();
      return page.getByRole('dialog', { name: 'Export commands', exact: true });
    };
    const openImport = async () => {
      await page.getByRole('button', { name: 'Import commands', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Import commands', exact: true });
      await modal.waitFor(); return modal;
    };
    await saveDialog(true);
    let modal = await openExport();
    assert.equal(await modal.getByRole('checkbox').count(), 3, 'Export includes host-specific commands even without an active terminal');
    await modal.getByRole('checkbox', { name: 'Select Private setup', exact: true }).uncheck();
    await modal.getByRole('button', { name: 'Export selected (2)', exact: true }).click();
    await waitUntil(() => modal.getByRole('button', { name: 'Export selected (2)', exact: true }).isEnabled());
    assert(!fs.existsSync(file), 'Canceling native save does not write a file');
    await saveDialog(false);
    await modal.getByText('Preview directory and script', { exact: true }).first().click();
    await page.screenshot({ path: path.join(output, 'shortcut-export.png') });
    await modal.getByRole('button', { name: 'Export selected (2)', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(exported.shortcuts.length, 2); assert.equal(exported.shortcuts[0].command, script);
    const text = JSON.stringify(exported);
    assert(!text.includes('must-not-export-password')); assert(!text.includes(hosts[0].id)); assert(!text.includes('192.0.2.1')); assert(!text.includes('Private setup'));
    // Canceled open and canceled preview do not change configuration.
    await openDialog(file, true);
    await page.getByRole('button', { name: 'Import commands', exact: true }).click();
    await waitUntil(() => page.getByRole('button', { name: 'Import commands', exact: true }).isEnabled());
    assert.equal(await page.getByRole('dialog').count(), 0);
    await openDialog(file);
    modal = await openImport();
    assert(await modal.getByRole('button', { name: 'Import selected (2)', exact: true }).isDisabled(), 'Host-scoped import requires explicit mapping');
    await modal.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    assert.deepEqual(await page.evaluate(() => window.api.shortcuts.list()), original);
    // Import only the chosen host command, remapping it to another local host.
    modal = await openImport();
    await modal.getByRole('checkbox', { name: 'Select Shared check', exact: true }).uncheck();
    await modal.getByRole('combobox', { name: 'Import scope for Host diagnostics', exact: true }).selectOption(hosts[1].id);
    await modal.getByText('Preview directory and script', { exact: true }).first().click();
    await page.screenshot({ path: path.join(output, 'shortcut-import.png') });
    await modal.getByRole('button', { name: 'Import selected (1)', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    let items = await page.evaluate(() => window.api.shortcuts.list());
    assert.equal(items.length, 4);
    assert.equal(items[3].name, 'Host diagnostics (2)'); assert.equal(items[3].sessionId, hosts[1].id); assert.equal(items[3].command, script);
    assert.notEqual(items[3].id, original[0].id); assert.deepEqual(items.slice(0, 3), original);
    // Select a subset and bulk-convert it to global scope.
    modal = await openImport();
    await modal.getByRole('button', { name: 'Select none', exact: true }).click();
    assert(await modal.getByRole('button', { name: 'Import selected (0)', exact: true }).isDisabled());
    await modal.getByRole('checkbox', { name: 'Select Shared check', exact: true }).check();
    await modal.getByRole('combobox', { name: 'Set scope for selected…', exact: true }).selectOption('@global');
    await modal.getByRole('button', { name: 'Import selected (1)', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Run Shared check (2)', exact: true }).waitFor();
    items = await page.evaluate(() => window.api.shortcuts.list());
    assert.equal(items.length, 5); assert.equal(items[4].sessionId, null);
    // A target disappearing between preview and import rejects the entire batch.
    modal = await openImport();
    await modal.getByRole('combobox', { name: 'Import scope for Host diagnostics', exact: true }).selectOption(hosts[2].id);
    await page.evaluate((id) => window.api.session.remove(id), hosts[2].id);
    await modal.getByRole('button', { name: 'Import selected (2)', exact: true }).click();
    await modal.getByRole('alert').filter({ hasText: 'Target host no longer exists' }).waitFor();
    assert.equal((await page.evaluate(() => window.api.shortcuts.list())).length, 5);
    await modal.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    // Malformed files never reach the selection dialog or mutate saved commands.
    const invalid = path.join(profile, 'invalid.json'); fs.writeFileSync(invalid, JSON.stringify({ ...exported, version: 999 }));
    await openDialog(invalid);
    await page.getByRole('button', { name: 'Import commands', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Unsupported shortcut file' }).waitFor();
    assert.equal((await page.evaluate(() => window.api.shortcuts.list())).length, 5);
    await page.reload();
    assert.equal((await page.evaluate(() => window.api.shortcuts.list())).length, 5);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: selective JSON export/import, native dialog cancellation, command preview, explicit host mapping, unique copies, atomic failure and persistence');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'shortcut-transfer-failure.png') }).catch(() => {});
    throw error;
  } finally {
    try { if (app) await app.close(); } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
