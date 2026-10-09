#!/usr/bin/env node
// Capture the real Electron UI with an isolated profile and loopback demo SSH/SFTP data.
// Never connects to saved user hosts or edits pixels/DOM to fabricate product features.
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startFixture } = require('../tests/electron/ssh-fixture.cjs');
const root = path.resolve(__dirname, '..');
async function waitUntil(check) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Screenshot preparation timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mnl-readme-'));
  const output = path.join(root, 'doc/img');
  fs.mkdirSync(output, { recursive: true });
  const fixture = await startFixture();
  fixture.files.clear();
  const yaml = `# MobaNexterm demo configuration — fictional robot\n# Review changes before saving to a real device.\n\nrobot:\n  name: demo-rover\n  workspace: /workspace\n  mode: development\n\nnavigation:\n  controller_frequency: 20.0\n  max_linear_velocity: 0.40\n  max_angular_velocity: 0.80\n  goal_tolerance: 0.15\n\nsensors:\n  lidar_topic: /scan\n  imu_topic: /imu/data\n  odometry_topic: /odom\n\nlogging:\n  level: info\n  directory: /workspace/logs\n  keep_days: 7\n`;
  for (const [name, content] of Object.entries({
    'robot.yaml': yaml,
    'diagnostics.log': '2026-10-09 09:42:18 [INFO] Demo diagnostics complete\n',
    'README.md': '# Demo robot workspace\n\nFictional data used for MobaNexterm screenshots.\n',
    'start_robot.sh':
      '#!/usr/bin/env bash\nset -eu\nsource /opt/ros/humble/setup.bash\nsource install/setup.bash\nros2 launch demo_robot bringup.launch.py\n',
    'waypoints.json': '{"frame": "map", "waypoints": [[0, 0], [1, 2]]}\n',
    'requirements.txt': '# Demo dependencies\npyyaml\n',
  }))
    fixture.files.set(`/workspace/${name}`, Buffer.from(content));
  const bootstrap = path.join(profile, 'main.cjs');
  fs.writeFileSync(
    bootstrap,
    `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); app.setVersion(${JSON.stringify(require('../package.json').version)}); require(${JSON.stringify(path.join(root, 'out/main/index.js'))});`,
  );
  let app;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: ['--no-sandbox', bootstrap],
      timeout: 30000,
    });
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForSelector('h1');
    const config = await page.evaluate(
      async ({ port }) => {
        localStorage.setItem(
          'mobanexterm.settings',
          JSON.stringify({
            language: 'zh',
            theme: 'dark',
            terminalFontSize: 15,
            shellIntegration: false,
          }),
        );
        const base = {
          host: '127.0.0.1',
          port,
          username: 'tester',
          authKind: 'password',
          password: 'fixture-only',
        };
        const host = await window.api.session.create({ ...base, name: '移动机器人 · 演示' });
        await window.api.session.create({ ...base, name: '传感器网关 · 演示' });
        const commands = [
          {
            name: '查看系统资源',
            directory: '',
            command: '# 快速检查内存与根分区\nfree -h\ndf -h /',
            sessionId: null,
          },
          {
            name: '查看导航服务日志',
            directory: '/workspace',
            command: '# 最近 100 行导航日志\njournalctl -u robot-navigation --no-pager -n 100',
            sessionId: host.id,
          },
          {
            name: '检查 ROS 2 话题',
            directory: '/workspace',
            command:
              '# 在当前终端加载环境，再查看话题\nsource /opt/ros/humble/setup.bash\nsource install/setup.bash\nros2 topic list\nros2 topic info /scan',
            sessionId: host.id,
          },
          {
            name: '记录软件版本',
            directory: '/workspace',
            command:
              '# 留下本次调试对应的版本信息\ndate -Is\ngit log -1 --format="%h %s"\npython3 --version',
            sessionId: null,
          },
        ];
        const shortcuts = [];
        for (const command of commands) shortcuts.push(await window.api.shortcuts.save(command));
        return { host, shortcuts };
      },
      { port: fixture.port },
    );
    await page.reload();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 860));
    await page.getByRole('button').filter({ hasText: '移动机器人 · 演示' }).first().dblclick();
    await page.getByRole('button', { name: /robot.yaml/ }).waitFor();
    await waitUntil(async () =>
      (await page.getByTestId('remote-performance').textContent()).includes('40%'),
    );
    const shell = fixture.shells[0];
    const prompt = '\x1b[32mtester@demo-rover\x1b[0m:\x1b[34m/workspace\x1b[0m$ ';
    const log = [
      '\x1b[1;36mMobaNexterm · SSH demo workspace\x1b[0m',
      '\x1b[90mFictional robot data · local SSH/SFTP fixture\x1b[0m',
      '',
      `${prompt}ls`,
      'README.md       diagnostics.log  requirements.txt',
      'robot.yaml      start_robot.sh   waypoints.json',
      '',
      `${prompt}journalctl -u robot-navigation --no-pager -n 12`,
      '\x1b[90m09:42:01\x1b[0m  \x1b[32mINFO\x1b[0m  [navigation] Loading robot.yaml',
      '\x1b[90m09:42:01\x1b[0m  \x1b[32mINFO\x1b[0m  [navigation] Controller frequency: 20.0 Hz',
      '\x1b[90m09:42:02\x1b[0m  \x1b[32mINFO\x1b[0m  [lidar]      Input stream /scan is ready',
      '\x1b[90m09:42:02\x1b[0m  \x1b[32mINFO\x1b[0m  [imu]        Calibration loaded',
      '\x1b[90m09:42:03\x1b[0m  \x1b[32mINFO\x1b[0m  [localizer]  Initial pose received',
      '\x1b[90m09:42:04\x1b[0m  \x1b[33mWARN\x1b[0m  [network]    Sample packet delayed: 84 ms',
      '\x1b[90m09:42:05\x1b[0m  \x1b[32mINFO\x1b[0m  [network]    Link recovered',
      '\x1b[90m09:42:06\x1b[0m  \x1b[32mINFO\x1b[0m  [planner]    Local map updated',
      '\x1b[90m09:42:08\x1b[0m  \x1b[32mINFO\x1b[0m  [controller] Goal accepted: checkpoint_02',
      '\x1b[90m09:42:12\x1b[0m  \x1b[32mINFO\x1b[0m  [controller] Goal reached',
      '\x1b[90m09:42:15\x1b[0m  \x1b[32mINFO\x1b[0m  [diagnostics] Sensor streams available',
      '\x1b[90m09:42:18\x1b[0m  \x1b[32mINFO\x1b[0m  [diagnostics] Demo inspection complete',
      '',
      prompt,
    ].join('\r\n');
    shell.write('\x1b[2J\x1b[H' + log);
    await waitUntil(async () =>
      (await page.locator('.xterm-rows').textContent()).includes('Demo inspection complete'),
    );
    await page.mouse.move(1300, 42);
    const shot = async (surface, name) => {
      await surface.evaluate(() => document.fonts.ready);
      await surface.screenshot({
        path: path.join(output, `readme-${name}.png`),
        animations: 'disabled',
      });
    };
    await shot(page, 'workspace');
    const editorPending = app.waitForEvent('window');
    await page.getByRole('button', { name: /robot.yaml/ }).dblclick();
    const editor = await editorPending;
    editor.on('pageerror', (error) => errors.push(error.message));
    const area = editor.getByRole('textbox', { name: '/workspace/robot.yaml', exact: true });
    await waitUntil(async () => (await area.inputValue()).includes('controller_frequency'));
    await area.press('Control+h');
    await editor.getByRole('textbox', { name: '查找', exact: true }).fill('0.40');
    await editor.getByRole('textbox', { name: '替换', exact: true }).fill('0.35');
    await shot(editor, 'file-editor');
    await editor.close();
    await page.getByRole('button', { name: '快捷指令', exact: true }).click();
    await shot(page, 'shortcuts');
    const commandPending = app.waitForEvent('window');
    await page.getByRole('button', { name: '编辑 检查 ROS 2 话题', exact: true }).click();
    const commandEditor = await commandPending;
    commandEditor.on('pageerror', (error) => errors.push(error.message));
    await commandEditor.getByRole('textbox', { name: '终端指令', exact: true }).waitFor();
    await commandEditor.getByRole('button', { name: '检查 Bash 语法', exact: true }).click();
    await commandEditor.getByRole('status').filter({ hasText: 'Bash 语法检查通过' }).waitFor();
    await shot(commandEditor, 'command-editor');
    await commandEditor.close();
    await page.getByRole('button', { name: '导出指令', exact: true }).click();
    let modal = page.getByRole('dialog', { name: '导出指令', exact: true });
    await modal.getByRole('checkbox', { name: '选择 记录软件版本', exact: true }).uncheck();
    await modal.getByText('预览目录与指令', { exact: true }).nth(2).click();
    await shot(page, 'command-export');
    const exportPath = path.join(profile, 'robot-debug-commands.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, exportPath);
    await modal.getByRole('button', { name: '导出所选（3）', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, exportPath);
    await page.getByRole('button', { name: '导入指令', exact: true }).click();
    modal = page.getByRole('dialog', { name: '导入指令', exact: true });
    await modal.waitFor();
    await modal
      .getByRole('combobox', { name: '查看导航服务日志 的导入范围', exact: true })
      .selectOption(config.host.id);
    await modal
      .getByRole('combobox', { name: '检查 ROS 2 话题 的导入范围', exact: true })
      .selectOption(config.host.id);
    await modal.getByText('预览目录与指令', { exact: true }).nth(1).click();
    await shot(page, 'command-import');
    await modal.getByRole('button', { name: '取消', exact: true }).last().click();
    shell.close();
    await waitUntil(async () =>
      (await page.locator('.xterm-rows').textContent()).includes('按 R 重新连接'),
    );
    await shot(page, 'reconnect');
    assert.deepEqual(errors, []);
    console.log('Captured 7 README screenshots from the real app using isolated demo data.');
  } finally {
    try {
      if (app) await app.close();
    } finally {
      fixture.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
