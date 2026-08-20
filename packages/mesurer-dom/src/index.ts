export type DomHost = {
  ownerWindow: Window;
  ownerDocument: Document;
  portalTarget: HTMLElement | ShadowRoot;
};

export function createDomHost(target?: HTMLElement | ShadowRoot): DomHost {
  const ownerDocument = target?.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  return { ownerWindow, ownerDocument, portalTarget: target ?? ownerDocument.body };
}

export function createPortalMount(host: DomHost, attribute = "data-mesurer-host") {
  const mount = host.ownerDocument.createElement("div");
  mount.setAttribute(attribute, "true");
  host.portalTarget.append(mount);
  return { mount, dispose: () => mount.remove() };
}

export function isElectronRenderer(globalValue: unknown = globalThis): boolean {
  const value = globalValue as { process?: { type?: string; versions?: { electron?: string } } };
  return value.process?.type === "renderer" || typeof value.process?.versions?.electron === "string";
}

export type StorageAdapter = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export function createLocalStorageAdapter(ownerWindow: Window = window): StorageAdapter {
  return {
    get: (key) => ownerWindow.localStorage.getItem(key),
    set: (key, value) => ownerWindow.localStorage.setItem(key, value),
    remove: (key) => ownerWindow.localStorage.removeItem(key),
  };
}
