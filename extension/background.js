const CAPTURE_VISIBLE_MESSAGE = "mesurer:capture-visible";

async function run(tabId, options) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    ...options,
  });
  return result[0]?.result;
}

async function toggleMesurer(tab) {
  if (!tab.id) return;

  try {
    const disposed = await run(tab.id, {
      func: () => {
        const globalObject = globalThis;
        const instance = globalObject.__MESURER_INSTANCE__;
        if (!instance) return false;
        instance.dispose();
        delete globalObject.__MESURER_INSTANCE__;
        return true;
      },
    });
    if (disposed) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["capture-bridge.js"],
    });
    await run(tab.id, {
      func: () => {
        const globalObject = globalThis;
        globalObject.__MESURER_CONFIG__ = {
          ...(globalObject.__MESURER_CONFIG__ ?? {}),
          screenshot: true,
        };
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["mesurer-main.js"],
    });
  } catch (error) {
    console.warn("Mesurer cannot run on this page.", error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== CAPTURE_VISIBLE_MESSAGE) return false;
  const windowId = sender.tab?.windowId;
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    const error = chrome.runtime.lastError?.message;
    if (error || !dataUrl) {
      sendResponse({ ok: false, error: error ?? "Capture failed" });
      return;
    }
    sendResponse({ ok: true, dataUrl });
  });
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  void toggleMesurer(tab);
});
