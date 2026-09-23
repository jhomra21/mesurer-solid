const CAPTURE_VISIBLE_MESSAGE = "mesurer:capture-visible";

const ACTIVE_TABS_KEY = "mesurer:active-tabs";

const restoreTimers = new Map();

const isInjectableUrl = (url) => {
  if (!url) return true;

  return !url.startsWith("chrome://")
    && !url.startsWith("chrome-extension://")
    && !url.startsWith("edge://")
    && !url.startsWith("about:")
    && !url.startsWith("https://chrome.google.com/webstore")
    && !url.startsWith("https://chromewebstore.google.com/");
};

const readActiveTabs = async () => {
  try {
    const stored = await chrome.storage.session.get(ACTIVE_TABS_KEY);
    const ids = stored[ACTIVE_TABS_KEY];

    return Array.isArray(ids)
      ? ids.filter(Number.isInteger)
      : [];
  } catch {
    return [];
  }
};

const writeActiveTabs = async (ids) => {
  try {
    await chrome.storage.session.set({ [ACTIVE_TABS_KEY]: ids });
  } catch {
    // Session storage is optional. The current service-worker lifetime still works.
  }
};

const setTabActive = async (tabId, active) => {
  const ids = await readActiveTabs();

  const next = active
    ? Array.from(new Set([...ids, tabId]))
    : ids.filter((id) => id !== tabId);

  await writeActiveTabs(next);
};

async function run(tabId, options) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    ...options,
  });

  return result[0]?.result;
}

const mounted = (tabId) => run(tabId, {
  func: () => Boolean(globalThis.__MESURER_INSTANCE__?.element?.isConnected),
});

const disposeMesurer = (tabId) => run(tabId, {
  func: () => {
    const globalObject = globalThis;
    const instance = globalObject.__MESURER_INSTANCE__;

    if (!instance) return false;
    globalObject.__MESURER_INJECT_RECOVERY__?.stop();
    delete globalObject.__MESURER_INJECT_RECOVERY__;
    instance.dispose();
    delete globalObject.__MESURER_INSTANCE__;

    return true;
  },
});

const injectMesurer = async (tabId) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["capture-bridge.js"],
  });

  await run(tabId, {
    func: () => {
      const globalObject = globalThis;
      const current = globalObject.__MESURER_CONFIG__;
      globalObject.__MESURER_CONFIG__ = current
        ? { ...current, screenshot: true, recoverDisconnected: true }
        : { screenshot: true, recoverDisconnected: true };
    },
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["mesurer-main.js"],
  });
};

async function toggleMesurer(tab) {
  if (!Number.isInteger(tab.id) || !isInjectableUrl(tab.url)) return;

  try {
    const disposed = await disposeMesurer(tab.id);

    if (disposed) {
      await setTabActive(tab.id, false);

      return;
    }

    await injectMesurer(tab.id);
    await setTabActive(tab.id, true);
  } catch (error) {
    console.warn("Mesurer cannot run on this page.", error);
  }
}

const restoreTab = (tabId, url) => {
  if (!isInjectableUrl(url)) return;
  const previous = restoreTimers.get(tabId);

  if (previous) clearTimeout(previous);

  restoreTimers.set(tabId, setTimeout(() => {
    restoreTimers.delete(tabId);

    void mounted(tabId)
      .then(async (alive) => {
        if (alive) return;

        await injectMesurer(tabId);
      })
      .catch(async (error) => {
        // activeTab is intentionally retained instead of broad host permissions.
        // A navigation that revokes that temporary grant should stop recovery
        // until the user explicitly clicks the extension action again.
        await setTabActive(tabId, false);
        console.warn("Mesurer could not restore on this page.", error);
      });
  }, 75));
};

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" && !changeInfo.url) return;

  void readActiveTabs().then((ids) => {
    if (!ids.includes(tabId)) return;

    restoreTab(tabId, changeInfo.url ?? tab.url);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = restoreTimers.get(tabId);

  if (timer) clearTimeout(timer);
  restoreTimers.delete(tabId);
  void setTabActive(tabId, false);
});
