export async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) return false;
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['sniffer.js'] });
    return true;
  } catch {
    return false;
  }
}

export async function notifyTab(tabId: number, message: unknown): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return false;
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}
