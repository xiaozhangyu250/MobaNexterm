import { registerShortcutsIpc } from './shortcuts.ipc';
import { registerAppIpc } from './app.ipc';
import { registerSessionIpc } from './session.ipc';
import { registerSshIpc } from './ssh.ipc';
import { registerSftpIpc } from './sftp.ipc';
import { logger } from '../services/Logger';

export function registerAllIpc(): void {
  registerAppIpc();
  registerShortcutsIpc();
  registerSessionIpc();
  registerSshIpc();
  registerSftpIpc();
  logger.info('IPC handlers registered');
}
