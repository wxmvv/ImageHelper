import { readSettings, writeSettings } from '../platform/storage.ts';
import { registerHandlers } from '../platform/rpc.ts';
import { registerCommands } from './commands.ts';
import { createContextMenu, registerContextMenu } from './context-menu.ts';
import { handlers } from './handlers.ts';
import { registerSnifferMessages } from './sniffer-messages.ts';
import { registerTabListeners } from './tabs.ts';

registerHandlers(handlers);
registerSnifferMessages();
registerTabListeners();
registerContextMenu();
registerCommands();
if (typeof chrome !== 'undefined') {
  chrome.runtime?.onInstalled?.addListener(() => {
    void readSettings()
      .then(writeSettings)
      .catch((error: unknown) => console.warn('Settings initialization failed', error));
    createContextMenu();
  });
}
