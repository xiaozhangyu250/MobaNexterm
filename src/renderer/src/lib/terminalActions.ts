const handlers = new Map<string, (shortcutId: string) => Promise<void>>();
export function registerTerminalAction(
  tabId: string,
  handler: (shortcutId: string) => Promise<void>,
): () => void {
  handlers.set(tabId, handler);
  return () => {
    if (handlers.get(tabId) === handler) handlers.delete(tabId);
  };
}
export async function runTerminalShortcut(tabId: string, shortcutId: string): Promise<void> {
  const handler = handlers.get(tabId);
  if (!handler) throw new Error('Terminal unavailable / 终端不可用');
  await handler(shortcutId);
}
