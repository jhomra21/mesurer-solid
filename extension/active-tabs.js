export const createActiveTabRegistry = (read, write) => {
  const activeTabs = new Set();
  const pendingStates = new Map();
  let writeQueue = Promise.resolve();

  const ready = read().then((ids) => {
    for (const id of ids) activeTabs.add(id);
  });

  const persist = () => {
    writeQueue = writeQueue.then(() => write([...activeTabs]));

    return writeQueue;
  };

  return {
    ready,
    isActive: (tabId) => pendingStates.get(tabId) ?? activeTabs.has(tabId),
    setActive: async (tabId, active) => {
      pendingStates.set(tabId, active);
      await ready;

      if (pendingStates.get(tabId) !== active) return;

      pendingStates.delete(tabId);

      if (active) activeTabs.add(tabId);
      else activeTabs.delete(tabId);

      await persist();
    },
  };
};
