import type {
  MesurerElementFingerprint,
  MesurerPluginContext,
  PluginValue,
} from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  isElementFingerprintCompatible,
  isElementFingerprintRebindable,
  isElementWithinDomTarget,
} from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

export const MESURER_TEXT_EDIT_STATE_ID = "mesurer.text-edit.intents";
export const MESURER_TEXT_EDIT_SERVICE_ID = "text-edit";

const COMMIT_COMMAND = "text-edit.commit";
const CLEAR_COMMAND = "text-edit.clear";
const MAX_EDITS = 100;
const SKIP_TAGS = new Set([
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OPTION",
]);

type TextEditValue = {
  [key: string]: PluginValue;
  id: string;
  createdAt: number;
  pageUrl: string;
  selector: string;
  nodeIndex: number;
  beforeText: string;
  desiredText: string;
  fingerprintTag: string;
  fingerprintId: string | null;
  fingerprintTestId: string | null;
  fingerprintRole: string | null;
  fingerprintAriaLabel: string | null;
  fingerprintClasses: string[];
  fingerprintText: string | null;
};

type TextEditStateValue = {
  [key: string]: PluginValue;
  edits: TextEditValue[];
};

export type MesurerTextEditIntent = {
  id: string;
  createdAt: number;
  pageUrl: string;
  selector: string;
  nodeIndex: number;
  before: string;
  desired: string;
};

export type MesurerTextEditService = {
  intents(): MesurerTextEditIntent[];
  clear(): Promise<void>;
};

type ResolvedEdit = {
  element: HTMLElement;
  node: Text;
};

type AppliedEdit = ResolvedEdit & {
  beforeText: string;
  desiredText: string;
};

type EditorSession = {
  element: HTMLElement;
  node: Text;
  editor: HTMLTextAreaElement;
  editId: string;
  beforeText: string;
  initialText: string;
  leading: string;
  trailing: string;
  nodeIndex: number;
  selector: string;
  fingerprint: MesurerElementFingerprint;
};

const currentPage = (ownerWindow: Window) => {
  const { origin, pathname, search } = ownerWindow.location;
  return `${origin}${pathname}${search}`;
};

const randomId = (ownerWindow: Window, prefix: string) => {
  const value = ownerWindow.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
};

const fingerprintFromValue = (value: TextEditValue): MesurerElementFingerprint => ({
  tag: value.fingerprintTag,
  id: value.fingerprintId,
  testId: value.fingerprintTestId,
  role: value.fingerprintRole,
  ariaLabel: value.fingerprintAriaLabel,
  classes: value.fingerprintClasses,
  text: value.fingerprintText,
});

const publicIntent = (value: TextEditValue): MesurerTextEditIntent => ({
  id: value.id,
  createdAt: value.createdAt,
  pageUrl: value.pageUrl,
  selector: value.selector,
  nodeIndex: value.nodeIndex,
  before: value.beforeText,
  desired: value.desiredText,
});

const splitTextFrame = (value: string) => {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const remainder = value.slice(leading.length);
  const trailing = remainder.match(/\s*$/)?.[0] ?? "";
  return {
    leading,
    trailing,
    value: remainder.slice(0, Math.max(0, remainder.length - trailing.length)),
  };
};

export function installTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument, so it carries that realm's DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const workspace = runtime.createWorkspaceRuntime();
  const inspectorMount = runtime.createInspectorMount();
  inspectorMount.element.dataset.mesurerTextEditRuntime = "true";
  inspectorMount.element.style.position = "fixed";
  inspectorMount.element.style.inset = "0";
  inspectorMount.element.style.zIndex = "2147483646";
  inspectorMount.element.style.pointerEvents = "none";

  ctx.state.register<TextEditStateValue>({
    id: MESURER_TEXT_EDIT_STATE_ID,
    initial: { edits: [] },
    history: true,
    persist: true,
  });

  const state = () => ctx.state.get<TextEditStateValue>(MESURER_TEXT_EDIT_STATE_ID) ?? { edits: [] };
  const liveNodes = new Map<string, ResolvedEdit>();
  const applied = new Map<string, AppliedEdit>();
  const expectedMutations = new WeakMap<Text, number>();
  let pendingCommit: TextEditValue | null = null;
  let editorSession: EditorSession | null = null;
  let disposed = false;
  let frame = 0;
  const currentToolMode = () => runtime.currentToolMode?.() ?? "none";

  const isPageElement = (element: HTMLElement) =>
    isElementWithinDomTarget(element, pageTarget)
    && !element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']");

  const queryCandidates = (selector: string): HTMLElement[] => {
    const matches: HTMLElement[] = [];
    if (pageTarget instanceof realm.HTMLElement && pageTarget.matches(selector) && isPageElement(pageTarget)) {
      matches.push(pageTarget);
    }
    for (const candidate of pageTarget.querySelectorAll(selector)) {
      if (candidate instanceof realm.HTMLElement && isPageElement(candidate)) matches.push(candidate);
    }
    return matches;
  };

  const resolve = (edit: TextEditValue): ResolvedEdit | null => {
    const live = liveNodes.get(edit.id);
    if (live?.element.isConnected && live.node.isConnected && isPageElement(live.element)) return live;
    liveNodes.delete(edit.id);

    const fingerprint = fingerprintFromValue(edit);
    if (!isElementFingerprintRebindable(fingerprint)) return null;
    let selectorMatches: HTMLElement[] = [];
    try {
      selectorMatches = queryCandidates(edit.selector)
        .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
    } catch {
      return null;
    }
    if (selectorMatches.length !== 1) return null;

    if (!fingerprint.id && !fingerprint.testId) {
      let fingerprintMatches: HTMLElement[] = [];
      try {
        fingerprintMatches = queryCandidates(fingerprint.tag)
          .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
      } catch {
        return null;
      }
      if (fingerprintMatches.length !== 1 || fingerprintMatches[0] !== selectorMatches[0]) return null;
    }

    const element = selectorMatches[0];
    const node = element.childNodes.item(edit.nodeIndex);
    if (!node || node.nodeType !== realm.Node.TEXT_NODE) return null;
    // SAFETY: nodeType was checked against this realm's TEXT_NODE constant immediately above.
    const resolved = { element, node: node as Text };
    liveNodes.set(edit.id, resolved);
    return resolved;
  };

  const setNodeText = (node: Text, value: string) => {
    if (node.nodeValue === value) return;
    expectedMutations.set(node, (expectedMutations.get(node) ?? 0) + 1);
    node.nodeValue = value;
  };

  const restoreApplied = () => {
    for (const value of applied.values()) {
      if (value.node.isConnected && value.node.nodeValue === value.desiredText) {
        setNodeText(value.node, value.beforeText);
      }
    }
    applied.clear();
  };

  const applyDesired = () => {
    const edits = state().edits.filter((edit) => edit.pageUrl === currentPage(ownerWindow));
    const nextIds = new Set(edits.map((edit) => edit.id));

    for (const [id, value] of applied) {
      if (nextIds.has(id) && value.node.isConnected) continue;
      if (value.node.isConnected && value.node.nodeValue === value.desiredText) {
        setNodeText(value.node, value.beforeText);
      }
      applied.delete(id);
    }

    for (const edit of edits) {
      const target = resolve(edit);
      if (!target) continue;
      const current = target.node.nodeValue ?? "";
      const owned = applied.get(edit.id);
      if (owned?.node === target.node) {
        if (current === owned.desiredText) continue;
        if (current !== owned.beforeText && current !== edit.beforeText) {
          applied.delete(edit.id);
          continue;
        }
      }
      if (current === edit.desiredText) continue;
      if (current !== edit.beforeText) continue;
      setNodeText(target.node, edit.desiredText);
      applied.set(edit.id, {
        ...target,
        beforeText: edit.beforeText,
        desiredText: edit.desiredText,
      });
    }
  };

  const positionEditor = () => {
    const session = editorSession;
    if (!session || !session.element.isConnected) return;
    const rect = session.element.getBoundingClientRect();
    const style = ownerWindow.getComputedStyle(session.element);
    const width = Math.min(
      Math.max(120, rect.width),
      Math.max(120, ownerWindow.innerWidth - 16),
    );
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, ownerWindow.innerWidth - width - 8),
    );
    const top = Math.min(
      Math.max(8, rect.top),
      Math.max(8, ownerWindow.innerHeight - Math.max(36, rect.height) - 8),
    );
    Object.assign(session.editor.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      minHeight: `${Math.max(36, rect.height)}px`,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      color: style.color,
    });
  };

  const closeEditor = () => {
    const session = editorSession;
    if (!session) return;
    session.editor.remove();
    editorSession = null;
  };

  const cancelEditor = () => {
    const session = editorSession;
    if (!session) return;
    setNodeText(session.node, session.initialText);
    closeEditor();
  };

  const commitEditor = () => {
    const session = editorSession;
    if (!session) return;
    const desiredText = `${session.leading}${session.editor.value}${session.trailing}`;
    if (desiredText === session.initialText) {
      setNodeText(session.node, session.initialText);
      closeEditor();
      return;
    }

    pendingCommit = {
      id: session.editId,
      createdAt: Date.now(),
      pageUrl: currentPage(ownerWindow),
      selector: session.selector,
      nodeIndex: session.nodeIndex,
      beforeText: session.beforeText,
      desiredText,
      fingerprintTag: session.fingerprint.tag,
      fingerprintId: session.fingerprint.id,
      fingerprintTestId: session.fingerprint.testId,
      fingerprintRole: session.fingerprint.role,
      fingerprintAriaLabel: session.fingerprint.ariaLabel,
      fingerprintClasses: session.fingerprint.classes,
      fingerprintText: session.fingerprint.text,
    };
    liveNodes.set(session.editId, { element: session.element, node: session.node });
    if (desiredText !== session.beforeText) {
      applied.set(session.editId, {
        element: session.element,
        node: session.node,
        beforeText: session.beforeText,
        desiredText,
      });
    }
    setNodeText(session.node, desiredText);
    closeEditor();
    void ctx.command.execute(COMMIT_COMMAND, undefined, { source: "text-inspector" }).catch(() => {
      applied.delete(session.editId);
      if (session.node.isConnected && session.node.nodeValue === desiredText) {
        setNodeText(session.node, session.beforeText);
      }
    });
  };

  const directTextTarget = (x: number, y: number) => {
    for (const candidate of ownerDocument.elementsFromPoint(x, y)) {
      if (!(candidate instanceof realm.HTMLElement)) continue;
      if (!isPageElement(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      if (candidate.matches("[contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']")) continue;
      const nodes = Array.from(candidate.childNodes)
        .map((node, index) => ({ node, index }))
        .filter(({ node }) => node.nodeType === realm.Node.TEXT_NODE && Boolean(node.nodeValue?.trim()));
      if (nodes.length !== 1) continue;
      // SAFETY: nodes contains only direct children whose nodeType is this realm's TEXT_NODE.
      return { element: candidate, node: nodes[0].node as Text, nodeIndex: nodes[0].index };
    }
    return null;
  };

  const findExisting = (element: HTMLElement, node: Text, selector: string, nodeIndex: number) => {
    const page = currentPage(ownerWindow);
    return state().edits.find((edit) => {
      if (edit.pageUrl !== page || edit.nodeIndex !== nodeIndex) return false;
      const target = resolve(edit);
      if (target?.element === element && target.node === node) return true;
      return edit.selector === selector;
    }) ?? null;
  };

  const beginEditor = (event: Event) => {
    if (!(event instanceof realm.MouseEvent)) return;
    if (currentToolMode() !== "text-inspector") return;
    const target = directTextTarget(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelEditor();

    const selector = getElementSelector(target.element);
    const fingerprint = getElementFingerprint(target.element);
    const existing = findExisting(target.element, target.node, selector, target.nodeIndex);
    const current = target.node.nodeValue ?? "";
    const owned = existing ? applied.get(existing.id)?.node === target.node : false;

    let beforeText = current;
    let initialText = current;
    let editId = existing?.id ?? randomId(ownerWindow, "text-edit");
    if (existing && owned) {
      beforeText = existing.beforeText;
      initialText = existing.desiredText;
      setNodeText(target.node, initialText);
    } else if (existing && current === existing.beforeText) {
      beforeText = existing.beforeText;
      initialText = existing.desiredText;
      setNodeText(target.node, initialText);
      applied.set(existing.id, {
        ...target,
        beforeText,
        desiredText: initialText,
      });
    } else if (existing && current === existing.desiredText) {
      // The real application now renders the previous Desired text. Treat a
      // further edit as a new baseline instead of claiming ownership of Live.
      beforeText = current;
      initialText = current;
    }

    const frameValue = splitTextFrame(initialText);
    const editor = ownerDocument.createElement("textarea");
    editor.dataset.mesurerTextEditor = "true";
    editor.dataset.mesurerInspectorUi = "true";
    editor.setAttribute("aria-label", "Edit text");
    editor.value = frameValue.value;
    Object.assign(editor.style, {
      position: "fixed",
      boxSizing: "border-box",
      zIndex: "2147483647",
      pointerEvents: "auto",
      resize: "none",
      overflow: "hidden",
      border: "1px solid #0d99ff",
      borderRadius: "6px",
      outline: "none",
      padding: "4px 6px",
      background: "white",
      boxShadow: "0 6px 20px rgba(0,0,0,.16)",
    });
    inspectorMount.element.append(editor);
    editorSession = {
      element: target.element,
      node: target.node,
      editor,
      editId,
      beforeText,
      initialText,
      leading: frameValue.leading,
      trailing: frameValue.trailing,
      nodeIndex: target.nodeIndex,
      selector,
      fingerprint,
    };
    positionEditor();
    editor.addEventListener("input", () => {
      const session = editorSession;
      if (!session || session.editor !== editor) return;
      setNodeText(session.node, `${session.leading}${editor.value}${session.trailing}`);
      editor.style.height = "auto";
      editor.style.height = `${Math.max(36, editor.scrollHeight)}px`;
    });
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(0, editor.value.length);
  };

  const syncPresentation = () => {
    frame = 0;
    if (disposed) return;
    if (currentToolMode() !== "text-inspector") {
      if (editorSession) cancelEditor();
      restoreApplied();
      return;
    }
    applyDesired();
    positionEditor();
  };

  const schedulePresentation = () => {
    if (disposed || frame) return;
    frame = ownerWindow.requestAnimationFrame(syncPresentation);
  };

  const onPointerDown = (event: PointerEvent) => {
    const session = editorSession;
    if (!session || event.composedPath().includes(session.editor)) return;
    commitEditor();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const session = editorSession;
    if (session) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelEditor();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        commitEditor();
      }
      return;
    }
    if (event.key === "Escape" && currentToolMode() === "text-inspector") {
      void ctx.command.execute(CLEAR_COMMAND, undefined, { source: "text-inspector-clear" });
    }
  };

  const observer = new realm.MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== "characterData" || !(record.target instanceof realm.Text)) continue;
      const node = record.target;
      const expected = expectedMutations.get(node) ?? 0;
      if (expected > 0) {
        if (expected === 1) expectedMutations.delete(node);
        else expectedMutations.set(node, expected - 1);
        continue;
      }
      for (const [id, value] of applied) {
        if (value.node === node) applied.delete(id);
      }
    }
    schedulePresentation();
  });
  observer.observe(pageTarget, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["id", "class", "data-testid", "role", "aria-label"],
  });

  ctx.command.register(COMMIT_COMMAND, () => {
    const value = pendingCommit;
    pendingCommit = null;
    if (!value) return;
    ctx.state.update<TextEditStateValue>(MESURER_TEXT_EDIT_STATE_ID, (current) => {
      const withoutCurrent = current.edits.filter((edit) => edit.id !== value.id);
      return {
        edits: value.desiredText === value.beforeText
          ? withoutCurrent
          : [...withoutCurrent, value].slice(-MAX_EDITS),
      };
    });
  });
  ctx.command.register(CLEAR_COMMAND, () => {
    pendingCommit = null;
    ctx.state.update<TextEditStateValue>(MESURER_TEXT_EDIT_STATE_ID, () => ({ edits: [] }));
  });
  ctx.service.provide<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID, {
    intents: () => state().edits.map(publicIntent),
    clear: () => ctx.command.execute(CLEAR_COMMAND),
  });

  const unsubscribeWorkspace = workspace.subscribe(schedulePresentation);
  ctx.state.subscribe(schedulePresentation);
  pageTarget.addEventListener("dblclick", beginEditor, true);
  ownerWindow.addEventListener("pointerdown", onPointerDown, true);
  ownerWindow.addEventListener("keydown", onKeyDown, true);
  ownerWindow.addEventListener("resize", schedulePresentation);
  ownerWindow.addEventListener("scroll", schedulePresentation, true);
  schedulePresentation();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    frame = 0;
    cancelEditor();
    restoreApplied();
    observer.disconnect();
    unsubscribeWorkspace();
    pageTarget.removeEventListener("dblclick", beginEditor, true);
    ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
    ownerWindow.removeEventListener("keydown", onKeyDown, true);
    ownerWindow.removeEventListener("resize", schedulePresentation);
    ownerWindow.removeEventListener("scroll", schedulePresentation, true);
    liveNodes.clear();
    workspace.dispose();
    inspectorMount.dispose();
  });
}
