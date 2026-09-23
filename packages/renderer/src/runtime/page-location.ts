type PageLocationListener = (pageKey: string) => void;

type Tracker = {
  listeners: Set<PageLocationListener>;
  pushState: History["pushState"];
  replaceState: History["replaceState"];
  handleNativeChange: () => void;
};

const trackers = new WeakMap<Window, Tracker>();

export const getMesurerPageKey = (ownerWindow: Window) => {
  const path = ownerWindow.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(ownerWindow.location.search);
  params.sort();
  const query = params.toString();
  const hash = ownerWindow.location.hash;
  const routeHash = hash.startsWith("#/") ? hash : "";

  return `${path}${query ? `?${query}` : ""}${routeHash}`;
};

const notify = (ownerWindow: Window, tracker: Tracker) => {
  const pageKey = getMesurerPageKey(ownerWindow);

  for (const listener of tracker.listeners) listener(pageKey);
};

const ensureTracker = (ownerWindow: Window) => {
  const current = trackers.get(ownerWindow);

  if (current) return current;

  const history = ownerWindow.history;
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  const tracker: Tracker = {
    listeners: new Set(),
    pushState,
    replaceState,
    handleNativeChange: () => notify(ownerWindow, tracker),
  };

  history.pushState = function (...args) {
    const result = pushState.apply(this, args);

    notify(ownerWindow, tracker);

    return result;
  };

  history.replaceState = function (...args) {
    const result = replaceState.apply(this, args);

    notify(ownerWindow, tracker);

    return result;
  };

  ownerWindow.addEventListener("popstate", tracker.handleNativeChange);
  ownerWindow.addEventListener("hashchange", tracker.handleNativeChange);
  trackers.set(ownerWindow, tracker);

  return tracker;
};

const releaseTracker = (ownerWindow: Window, tracker: Tracker) => {
  if (tracker.listeners.size > 0 || trackers.get(ownerWindow) !== tracker) return;

  ownerWindow.history.pushState = tracker.pushState;
  ownerWindow.history.replaceState = tracker.replaceState;
  ownerWindow.removeEventListener("popstate", tracker.handleNativeChange);
  ownerWindow.removeEventListener("hashchange", tracker.handleNativeChange);
  trackers.delete(ownerWindow);
};

export const subscribeMesurerPageKey = (
  ownerWindow: Window,
  listener: PageLocationListener,
) => {
  const tracker = ensureTracker(ownerWindow);
  tracker.listeners.add(listener);
  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;
    tracker.listeners.delete(listener);
    releaseTracker(ownerWindow, tracker);
  };
};
