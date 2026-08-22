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

    await run(tab.id, {
      func: () => {
        const globalObject = globalThis;
        const existing = globalObject.__MESURER_CONFIG__;
        globalObject.__MESURER_CONFIG__ = existing
          ? { ...existing, contextUi: true }
          : { contextUi: true };
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

chrome.action.onClicked.addListener((tab) => {
  void toggleMesurer(tab);
});
