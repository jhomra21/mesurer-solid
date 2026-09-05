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
import {
  makeCard,
  populateCard,
  type InspectorCard,
} from "./text-inspector-dom";
import {
  TypographyInspector,
  type TypographyInfo,
} from "./text-inspector-typography";

export const MESURER_TEXT_EDIT_STATE_ID = "mesurer.text-edit.intents";
export const MESURER_TEXT_EDIT_SERVICE_ID = "text-edit";

const COMMIT_COMMAND = "text-edit.commit";
const CLEAR_COMMAND = "text-edit.clear";
const MAX_EDITS = 100;
const MAX_STYLE_CANDIDATES = 600;
const DOUBLE_TAP_MS = 360;
const DOUBLE_TAP_DISTANCE = 24;
const TOOLBAR_BLUE = "#0d99ff";
const TOOLBAR_INK = "#0f172a";
const TOOLBAR_MUTED = "#8a8a8a";
const STYLE_MENU_WIDTH = 288;
const TOOLBAR_SHADOW =
  "0 0 0.5px rgba(0, 0, 0, 0.18), 0 3px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.1)";
const SKIP_TAGS = new Set([
  "HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT",
  "IMG", "VIDEO", "AUDIO", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OPTION",
]);

export type MesurerTextStyleProperty =
  | "font-family"
  | "font-size"
  | "font-weight"
  | "font-style"
  | "line-height"
  | "letter-spacing"
  | "text-transform"
  | "color"
  | "text-decoration-line";

const TEXT_PRESET_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "color",
] as const satisfies readonly MesurerTextStyleProperty[];

export type MesurerTextStyleChange = {
  property: MesurerTextStyleProperty;
  before: string;
  desired: string;
};

type TextStyleChangeValue = {
  [key: string]: PluginValue;
  property: MesurerTextStyleProperty;
  before: string;
  desired: string;
  beforeInline: string;
  beforePriority: string;
};

type TextEditValue = {
  [key: string]: PluginValue;
  id: string;
  createdAt: number;
  pageUrl: string;
  selector: string;
  nodeIndex: number;
  beforeText: string;
  desiredText: string;
  styleChanges: TextStyleChangeValue[];
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
  styles: MesurerTextStyleChange[];
};

export type MesurerTextEditService = {
  intents(): MesurerTextEditIntent[];
  intent(id: string): MesurerTextEditIntent | null;
  clear(): Promise<void>;
};

type ResolvedEdit = {
  element: HTMLElement;
  node: Text;
};

type AppliedEdit = ResolvedEdit & {
  beforeText: string;
  desiredText: string;
  styleChanges: TextStyleChangeValue[];
};

type TextStylePresetId = "text" | "heading-1" | "heading-2" | "heading-3";
type HeadingTag = "H1" | "H2" | "H3";

type TextStylePreset = {
  id: TextStylePresetId;
  label: string;
  shortcut: "0" | "1" | "2" | "3";
  styles: Partial<Record<MesurerTextStyleProperty, string>>;
};

type TextStyleVariant = {
  styles: TextStylePreset["styles"];
  count: number;
};

type TextStyleCatalog = {
  fontFamilies: string[];
  fontSizes: string[];
  fontWeights: string[];
  colors: string[];
  presets: TextStylePreset[];
};

type EditorSession = {
  element: HTMLElement;
  node: Text;
  editor: HTMLTextAreaElement;
  toolbar: HTMLDivElement;
  menu: HTMLDivElement;
  menuOpen: boolean;
  inspectorCard: InspectorCard;
  inspectorInfo: TypographyInfo;
  editId: string;
  beforeText: string;
  initialText: string;
  leading: string;
  trailing: string;
  nodeIndex: number;
  selector: string;
  fingerprint: MesurerElementFingerprint;
  initialStyleChanges: TextStyleChangeValue[];
  styleChanges: TextStyleChangeValue[];
  catalog: TextStyleCatalog;
};

type TapState = {
  time: number;
  x: number;
  y: number;
  element: HTMLElement;
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

const publicStyleChange = (value: TextStyleChangeValue): MesurerTextStyleChange => ({
  property: value.property,
  before: value.before,
  desired: value.desired,
});

const publicIntent = (value: TextEditValue): MesurerTextEditIntent => ({
  id: value.id,
  createdAt: value.createdAt,
  pageUrl: value.pageUrl,
  selector: value.selector,
  nodeIndex: value.nodeIndex,
  before: value.beforeText,
  desired: value.desiredText,
  styles: value.styleChanges.map(publicStyleChange),
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

const cloneStyleChanges = (values: TextStyleChangeValue[]) => values.map((value) => ({ ...value }));

const firstFontFamily = (value: string) => (value.split(",")[0] ?? value)
  .trim()
  .replace(/^['"]|['"]$/g, "");

const numericWeight = (value: string) => {
  if (value === "bold") return 700;
  if (value === "normal") return 400;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 400;
};

const isTransparentColor = (value: string) =>
  value === "transparent"
  || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)
  || /^rgba\(0\s+0\s+0\s*\/\s*0(?:\.0+)?\)$/.test(value);

const rgbToHex = (value: string) => {
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/.exec(value);
  if (!match) return "#000000";
  const channel = (raw: string) => Math.max(0, Math.min(255, Math.round(Number(raw))))
    .toString(16)
    .padStart(2, "0");
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`;
};

const mostCommon = (values: Map<string, number>, limit: number) => [...values.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, limit)
  .map(([value]) => value);

const prependUnique = (values: string[], current: string) => current
  ? [current, ...values.filter((value) => value !== current)]
  : values;

export function installTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument, so it carries that realm's DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const workspace = runtime.createWorkspaceRuntime();
  const typography = new TypographyInspector(ownerDocument, ownerWindow);
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
  let lastTap: TapState | null = null;
  let disposed = false;
  let frame = 0;
  const currentToolMode = () => runtime.currentToolMode?.() ?? "none";
  const directEditingMode = () => {
    const mode = currentToolMode();
    return mode === "text-inspector" || mode === "select";
  };

  const isPageElement = (element: HTMLElement) =>
    isElementWithinDomTarget(element, pageTarget)
    && !element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']");

  const hasDirectText = (element: HTMLElement) => Array.from(element.childNodes).some(
    (node) => node.nodeType === realm.Node.TEXT_NODE && Boolean(node.nodeValue?.trim()),
  );

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

  const normalizeStyleValue = (property: MesurerTextStyleProperty, value: string) => {
    const probe = ownerDocument.createElement("span");
    probe.style.setProperty(property, value);
    return probe.style.getPropertyValue(property) || value;
  };

  const restoreStyleChange = (element: HTMLElement, change: TextStyleChangeValue) => {
    if (element.style.getPropertyValue(change.property) !== change.desired) return;
    if (element.style.getPropertyPriority(change.property)) return;
    if (change.beforeInline) {
      element.style.setProperty(change.property, change.beforeInline, change.beforePriority);
      return;
    }
    element.style.removeProperty(change.property);
  };

  const restoreStyleChanges = (element: HTMLElement, changes: TextStyleChangeValue[]) => {
    for (const change of changes) restoreStyleChange(element, change);
  };

  const applyStyleChanges = (
    element: HTMLElement,
    changes: TextStyleChangeValue[],
    ownedProperties: Set<MesurerTextStyleProperty>,
  ) => changes.filter((change) => {
    const current = element.style.getPropertyValue(change.property);
    const priority = element.style.getPropertyPriority(change.property);
    if (current === change.desired && !priority) return ownedProperties.has(change.property);
    if (current !== change.beforeInline || priority !== change.beforePriority) return false;
    element.style.setProperty(change.property, change.desired);
    return true;
  });

  const restoreApplied = () => {
    for (const value of applied.values()) {
      if (value.node.isConnected && value.node.nodeValue === value.desiredText) {
        setNodeText(value.node, value.beforeText);
      }
      if (value.element.isConnected) restoreStyleChanges(value.element, value.styleChanges);
    }
    applied.clear();
  };

  const applyDesired = () => {
    const edits = state().edits.filter((edit) => edit.pageUrl === currentPage(ownerWindow));
    const nextIds = new Set(edits.map((edit) => edit.id));

    for (const [id, value] of applied) {
      if (nextIds.has(id) && value.node.isConnected && value.element.isConnected) continue;
      if (value.node.isConnected && value.node.nodeValue === value.desiredText) {
        setNodeText(value.node, value.beforeText);
      }
      if (value.element.isConnected) restoreStyleChanges(value.element, value.styleChanges);
      applied.delete(id);
    }

    for (const edit of edits) {
      const target = resolve(edit);
      if (!target) continue;
      const current = target.node.nodeValue ?? "";
      const owned = applied.get(edit.id);
      let ownsText = false;
      if (owned?.node === target.node && current === owned.desiredText) {
        if (current !== edit.desiredText) setNodeText(target.node, edit.desiredText);
        ownsText = true;
      } else if (current === edit.beforeText) {
        setNodeText(target.node, edit.desiredText);
        ownsText = true;
      }

      const ownedProperties = new Set(
        owned?.element === target.element
          ? owned.styleChanges.map((change) => change.property)
          : [],
      );
      const ownedStyleChanges = applyStyleChanges(target.element, edit.styleChanges, ownedProperties);
      if (!ownsText && ownedStyleChanges.length === 0) {
        applied.delete(edit.id);
        continue;
      }
      applied.set(edit.id, {
        ...target,
        beforeText: edit.beforeText,
        desiredText: edit.desiredText,
        styleChanges: ownedStyleChanges,
      });
    }
  };

  const presetStyles = (style: CSSStyleDeclaration): TextStylePreset["styles"] => ({
    "font-family": style.fontFamily,
    "font-size": style.fontSize,
    "font-weight": style.fontWeight,
    "font-style": style.fontStyle,
    "line-height": style.lineHeight,
    "letter-spacing": style.letterSpacing,
    "text-transform": style.textTransform,
    color: style.color,
  });

  const addStyleVariant = (
    variants: Map<string, TextStyleVariant>,
    style: CSSStyleDeclaration,
  ) => {
    const styles = presetStyles(style);
    const signature = JSON.stringify(styles);
    const existing = variants.get(signature);
    if (existing) {
      existing.count += 1;
      return;
    }
    variants.set(signature, { styles, count: 1 });
  };

  const dominantVariant = (variants: Map<string, TextStyleVariant>) =>
    [...variants.values()].sort((left, right) => right.count - left.count)[0] ?? null;

  const collectStyleCatalog = (element: HTMLElement): TextStyleCatalog => {
    const fontFamilies = new Map<string, number>();
    const fontSizes = new Map<string, number>();
    const fontWeights = new Map<string, number>();
    const colors = new Map<string, number>();
    const candidates: HTMLElement[] = [];
    const textVariants = new Map<string, TextStyleVariant>();
    const headingVariants = new Map<HeadingTag, Map<string, TextStyleVariant>>();
    let fallbackTextElement: HTMLElement | null = null;
    if (pageTarget instanceof realm.HTMLElement) candidates.push(pageTarget);
    for (const candidate of pageTarget.querySelectorAll("*")) {
      if (candidate instanceof realm.HTMLElement) candidates.push(candidate);
      if (candidates.length >= MAX_STYLE_CANDIDATES) break;
    }

    for (const candidate of candidates) {
      if (!isPageElement(candidate) || !hasDirectText(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      const style = ownerWindow.getComputedStyle(candidate);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const add = (map: Map<string, number>, value: string) => {
        const normalized = value.trim();
        if (!normalized) return;
        map.set(normalized, (map.get(normalized) ?? 0) + 1);
      };
      add(fontFamilies, style.fontFamily);
      add(fontSizes, style.fontSize);
      add(fontWeights, style.fontWeight);
      add(colors, style.color);

      fallbackTextElement ??= candidate;
      if (candidate.tagName === "P" || candidate.tagName === "SPAN") {
        addStyleVariant(textVariants, style);
      }
      if (candidate.tagName === "H1" || candidate.tagName === "H2" || candidate.tagName === "H3") {
        const tag = candidate.tagName;
        const variants = headingVariants.get(tag) ?? new Map<string, TextStyleVariant>();
        addStyleVariant(variants, style);
        headingVariants.set(tag, variants);
      }
    }

    const current = ownerWindow.getComputedStyle(element);
    const textVariant = dominantVariant(textVariants);
    const presets: TextStylePreset[] = [{
      id: "text",
      label: "Text",
      shortcut: "0",
      styles: textVariant?.styles
        ?? presetStyles(ownerWindow.getComputedStyle(fallbackTextElement ?? element)),
    }];
    const headingDefinitions = [
      ["H1", "heading-1", "Heading 1", "1"],
      ["H2", "heading-2", "Heading 2", "2"],
      ["H3", "heading-3", "Heading 3", "3"],
    ] as const;
    for (const [tag, id, label, shortcut] of headingDefinitions) {
      const dominant = dominantVariant(headingVariants.get(tag) ?? new Map());
      if (!dominant) continue;
      presets.push({
        id,
        label,
        shortcut,
        styles: dominant.styles,
      });
    }

    return {
      fontFamilies: prependUnique(mostCommon(fontFamilies, 12), current.fontFamily),
      fontSizes: prependUnique(mostCommon(fontSizes, 12), current.fontSize),
      fontWeights: prependUnique(
        mostCommon(fontWeights, 9).sort((left, right) => numericWeight(left) - numericWeight(right)),
        current.fontWeight,
      ),
      colors: prependUnique(mostCommon(colors, 10), current.color),
      presets,
    };
  };

  const effectiveBackgroundColor = (element: HTMLElement) => {
    let current: HTMLElement | null = element;
    while (current) {
      const color = ownerWindow.getComputedStyle(current).backgroundColor;
      if (color && !isTransparentColor(color)) return color;
      current = current.parentElement;
    }
    return "Canvas";
  };

  const sessionChange = (session: EditorSession, property: MesurerTextStyleProperty) =>
    session.styleChanges.find((change) => change.property === property) ?? null;

  const renderInspectorCard = (session: EditorSession, refreshVariables: boolean) => {
    const fast = typography.getFast(session.element);
    if (refreshVariables) {
      session.inspectorInfo = typography.getFull(session.element, fast);
    } else {
      const variables = new Map(session.inspectorInfo.rows.map((row) => [row.label, row.varName] as const));
      session.inspectorInfo = {
        ...fast,
        rows: fast.rows.map((row) => ({ ...row, varName: variables.get(row.label) ?? null })),
      };
    }
    populateCard(ownerDocument, session.inspectorCard, session.inspectorInfo, false);
    session.inspectorCard.dataset.mesurerTextInspectorInfo = "true";
    session.inspectorCard.dataset.state = "visible";
    session.inspectorCard.setAttribute("aria-label", "Text inspector");
  };

  const currentSessionStyle = (session: EditorSession, property: MesurerTextStyleProperty) =>
    ownerWindow.getComputedStyle(session.element).getPropertyValue(property).trim();

  const updateSessionStyle = (
    session: EditorSession,
    property: MesurerTextStyleProperty,
    rawDesired: string,
  ) => {
    const desired = normalizeStyleValue(property, rawDesired);
    const existing = sessionChange(session, property);
    const before = existing?.before
      ?? ownerWindow.getComputedStyle(session.element).getPropertyValue(property).trim();
    const beforeInline = existing?.beforeInline
      ?? session.element.style.getPropertyValue(property);
    const beforePriority = existing?.beforePriority
      ?? session.element.style.getPropertyPriority(property);

    if (desired === before) {
      if (existing) restoreStyleChange(session.element, existing);
      session.styleChanges = session.styleChanges.filter((change) => change.property !== property);
    } else {
      session.element.style.setProperty(property, desired);
      const next = {
        property,
        before,
        desired,
        beforeInline,
        beforePriority,
      } satisfies TextStyleChangeValue;
      session.styleChanges = [
        ...session.styleChanges.filter((change) => change.property !== property),
        next,
      ];
    }
  };

  const setSessionStyles = (
    session: EditorSession,
    values: Array<readonly [MesurerTextStyleProperty, string]>,
  ) => {
    for (const [property, desired] of values) updateSessionStyle(session, property, desired);
    renderToolbar(session);
    renderInspectorCard(session, true);
    positionEditor();
  };

  const setSessionStyle = (
    session: EditorSession,
    property: MesurerTextStyleProperty,
    rawDesired: string,
  ) => setSessionStyles(session, [[property, rawDesired]]);

  const presetMatches = (session: EditorSession, preset: TextStylePreset) =>
    TEXT_PRESET_PROPERTIES.every((property) => {
      const expected = preset.styles[property];
      return expected === undefined || currentSessionStyle(session, property) === normalizeStyleValue(property, expected);
    });

  const currentPreset = (session: EditorSession) =>
    session.catalog.presets.find((preset) => presetMatches(session, preset)) ?? null;

  const applyPreset = (session: EditorSession, preset: TextStylePreset) => {
    session.menuOpen = false;
    const values = TEXT_PRESET_PROPERTIES.flatMap((property) => {
      const value = preset.styles[property];
      return value === undefined ? [] : [[property, value] as const];
    });
    setSessionStyles(session, values);
    session.editor.focus({ preventScroll: true });
  };

  const toggleBold = (session: EditorSession) => {
    const weight = currentSessionStyle(session, "font-weight");
    const existing = sessionChange(session, "font-weight");
    if (existing && numericWeight(existing.desired) >= 600 && numericWeight(existing.before) < 600) {
      setSessionStyle(session, "font-weight", existing.before);
      return;
    }
    setSessionStyle(session, "font-weight", numericWeight(weight) >= 600 ? "400" : "700");
  };

  const toggleItalic = (session: EditorSession) => {
    const fontStyle = currentSessionStyle(session, "font-style");
    const existing = sessionChange(session, "font-style");
    if (existing && existing.desired !== "normal" && existing.before === "normal") {
      setSessionStyle(session, "font-style", existing.before);
      return;
    }
    setSessionStyle(session, "font-style", fontStyle === "normal" ? "italic" : "normal");
  };

  const toggleUnderline = (session: EditorSession) => {
    const decoration = currentSessionStyle(session, "text-decoration-line");
    const existing = sessionChange(session, "text-decoration-line");
    if (existing && existing.desired.includes("underline") && !existing.before.includes("underline")) {
      setSessionStyle(session, "text-decoration-line", existing.before);
      return;
    }
    setSessionStyle(session, "text-decoration-line", decoration.includes("underline") ? "none" : "underline");
  };

  const makeToolbarButton = (
    session: EditorSession,
    label: string,
    title: string,
    active: boolean,
    onClick: () => void,
  ) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.dataset.mesurerTextStyleButton = title.toLowerCase();
    Object.assign(button.style, {
      width: "32px",
      height: "32px",
      border: "0",
      borderRadius: "8px",
      background: active ? TOOLBAR_BLUE : "transparent",
      color: active ? "#ffffff" : "#000000",
      font: "600 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      textDecoration: title === "Underline" ? "underline" : "none",
      fontStyle: title === "Italic" ? "italic" : "normal",
      cursor: "pointer",
      outline: "none",
    });
    button.addEventListener("mouseenter", () => {
      if (!active) button.style.background = "rgba(0, 0, 0, 0.04)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = active ? TOOLBAR_BLUE : "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (editorSession !== session) return;
      onClick();
      session.editor.focus({ preventScroll: true });
    });
    return button;
  };

  const makeMenuSelect = (
    session: EditorSession,
    label: string,
    values: string[],
    current: string,
    format: (value: string) => string,
    onChange: (value: string) => void,
  ) => {
    const wrapper = ownerDocument.createElement("label");
    Object.assign(wrapper.style, {
      display: "grid",
      gridTemplateColumns: "72px minmax(0, 1fr)",
      alignItems: "center",
      gap: "8px",
      minHeight: "38px",
      padding: "0 8px",
      color: TOOLBAR_INK,
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    });
    const caption = ownerDocument.createElement("span");
    caption.textContent = label;
    caption.style.color = TOOLBAR_MUTED;

    const select = ownerDocument.createElement("select");
    select.setAttribute("aria-label", label);
    select.dataset.mesurerTextStyleSelect = label.toLowerCase().replace(/\s+/g, "-");
    Object.assign(select.style, {
      width: "100%",
      height: "32px",
      border: "0",
      borderRadius: "8px",
      background: "rgba(0, 0, 0, 0.035)",
      color: TOOLBAR_INK,
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      padding: "0 8px",
      cursor: "pointer",
      outline: "none",
    });
    for (const value of prependUnique(values, current)) {
      const option = ownerDocument.createElement("option");
      option.value = value;
      option.textContent = format(value);
      option.selected = value === current;
      select.append(option);
    }
    select.addEventListener("change", () => {
      if (editorSession !== session) return;
      onChange(select.value);
    });
    wrapper.append(caption, select);
    return wrapper;
  };

  const shortcutLabel = (shortcut: TextStylePreset["shortcut"]) => {
    const apple = /Mac|iPhone|iPad|iPod/i.test(ownerWindow.navigator.platform || ownerWindow.navigator.userAgent);
    return apple ? `⌥⌘${shortcut}` : `Alt+Ctrl+${shortcut}`;
  };

  const makePresetButton = (session: EditorSession, preset: TextStylePreset, active: boolean) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.mesurerTextStylePreset = preset.id;
    button.setAttribute("aria-label", preset.label);
    button.setAttribute("aria-current", active ? "true" : "false");
    Object.assign(button.style, {
      width: "100%",
      minHeight: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
      border: "0",
      borderRadius: "8px",
      padding: "0 10px",
      background: active ? "rgba(0, 0, 0, 0.05)" : "transparent",
      color: "#111111",
      cursor: "pointer",
      outline: "none",
      textAlign: "left",
      font: preset.id === "text"
        ? "500 14px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        : "650 14px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    });
    const label = ownerDocument.createElement("span");
    label.textContent = preset.label;
    const shortcut = ownerDocument.createElement("span");
    shortcut.textContent = shortcutLabel(preset.shortcut);
    Object.assign(shortcut.style, {
      color: TOOLBAR_MUTED,
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      whiteSpace: "nowrap",
    });
    button.append(label, shortcut);
    button.addEventListener("mouseenter", () => {
      button.style.background = "rgba(0, 0, 0, 0.05)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = active ? "rgba(0, 0, 0, 0.05)" : "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (editorSession !== session) return;
      applyPreset(session, preset);
    });
    return button;
  };

  const makeDivider = () => {
    const divider = ownerDocument.createElement("div");
    divider.setAttribute("role", "separator");
    Object.assign(divider.style, {
      height: "1px",
      margin: "5px 8px",
      background: "rgba(0, 0, 0, 0.09)",
    });
    return divider;
  };

  const renderStyleMenu = (session: EditorSession) => {
    const menu = session.menu;
    menu.replaceChildren();
    const activePreset = currentPreset(session);
    for (const preset of session.catalog.presets) {
      menu.append(makePresetButton(session, preset, activePreset?.id === preset.id));
    }

    menu.append(makeDivider());
    const family = currentSessionStyle(session, "font-family");
    const size = currentSessionStyle(session, "font-size");
    const weight = currentSessionStyle(session, "font-weight");
    const color = currentSessionStyle(session, "color");
    menu.append(
      makeMenuSelect(
        session,
        "Font",
        session.catalog.fontFamilies,
        family,
        firstFontFamily,
        (value) => setSessionStyle(session, "font-family", value),
      ),
      makeMenuSelect(
        session,
        "Size",
        session.catalog.fontSizes,
        size,
        (value) => value,
        (value) => setSessionStyle(session, "font-size", value),
      ),
      makeMenuSelect(
        session,
        "Weight",
        session.catalog.fontWeights,
        weight,
        (value) => value,
        (value) => setSessionStyle(session, "font-weight", value),
      ),
    );

    menu.append(makeDivider());
    const colorSection = ownerDocument.createElement("div");
    Object.assign(colorSection.style, {
      display: "grid",
      gap: "7px",
      padding: "5px 8px 8px",
    });
    const colorLabel = ownerDocument.createElement("div");
    colorLabel.textContent = "Text color";
    Object.assign(colorLabel.style, {
      color: TOOLBAR_MUTED,
      font: "500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    });
    const swatches = ownerDocument.createElement("div");
    swatches.setAttribute("aria-label", "Page text colors");
    swatches.dataset.mesurerTextColorSwatches = "true";
    Object.assign(swatches.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "7px",
    });
    for (const value of session.catalog.colors.slice(0, 10)) {
      const swatch = ownerDocument.createElement("button");
      swatch.type = "button";
      swatch.title = `Use ${value}`;
      swatch.setAttribute("aria-label", `Use text color ${value}`);
      swatch.dataset.mesurerTextColor = value;
      Object.assign(swatch.style, {
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        border: value === color ? `2px solid ${TOOLBAR_BLUE}` : "1px solid rgba(0, 0, 0, 0.18)",
        boxShadow: value === color ? "0 0 0 2px #ffffff inset" : "none",
        background: value,
        cursor: "pointer",
        padding: "0",
      });
      swatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (editorSession !== session) return;
        setSessionStyle(session, "color", value);
      });
      swatches.append(swatch);
    }

    const customColor = ownerDocument.createElement("input");
    customColor.type = "color";
    customColor.value = rgbToHex(color);
    customColor.title = "Custom text color";
    customColor.setAttribute("aria-label", "Custom text color");
    customColor.dataset.mesurerTextCustomColor = "true";
    Object.assign(customColor.style, {
      width: "28px",
      height: "28px",
      border: "0",
      borderRadius: "8px",
      background: "rgba(0, 0, 0, 0.035)",
      padding: "4px",
      cursor: "pointer",
    });
    customColor.addEventListener("change", () => {
      if (editorSession !== session) return;
      setSessionStyle(session, "color", customColor.value);
    });
    swatches.append(customColor);
    colorSection.append(colorLabel, swatches);
    menu.append(colorSection);

    menu.hidden = !session.menuOpen;
    menu.style.display = session.menuOpen ? "block" : "none";
  };

  const makeStyleMenuButton = (session: EditorSession) => {
    const preset = currentPreset(session);
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.mesurerTextStyleMenuButton = "true";
    button.setAttribute("aria-label", "Text style");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", session.menuOpen ? "true" : "false");
    Object.assign(button.style, {
      minWidth: "96px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
      border: "0",
      borderRadius: "8px",
      background: session.menuOpen ? "rgba(0, 0, 0, 0.05)" : "transparent",
      color: "#111111",
      padding: "0 10px",
      cursor: "pointer",
      outline: "none",
      font: "500 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    });
    const label = ownerDocument.createElement("span");
    label.textContent = preset?.label ?? "Text";
    const chevron = ownerDocument.createElement("span");
    chevron.textContent = "⌄";
    chevron.setAttribute("aria-hidden", "true");
    Object.assign(chevron.style, {
      color: TOOLBAR_MUTED,
      fontSize: "15px",
      transform: session.menuOpen ? "rotate(180deg)" : "none",
      transformOrigin: "center",
    });
    button.append(label, chevron);
    button.addEventListener("mouseenter", () => { button.style.background = "rgba(0, 0, 0, 0.05)"; });
    button.addEventListener("mouseleave", () => {
      button.style.background = session.menuOpen ? "rgba(0, 0, 0, 0.05)" : "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (editorSession !== session) return;
      session.menuOpen = !session.menuOpen;
      renderToolbar(session);
      positionEditor();
    });
    return button;
  };

  const renderToolbar = (session: EditorSession) => {
    const toolbar = session.toolbar;
    toolbar.replaceChildren();
    const weight = currentSessionStyle(session, "font-weight");
    const fontStyle = currentSessionStyle(session, "font-style");
    const decoration = currentSessionStyle(session, "text-decoration-line");

    toolbar.append(
      makeToolbarButton(session, "B", "Bold", numericWeight(weight) >= 600, () => toggleBold(session)),
      makeToolbarButton(session, "I", "Italic", fontStyle === "italic" || fontStyle === "oblique", () => toggleItalic(session)),
      makeToolbarButton(session, "U", "Underline", decoration.includes("underline"), () => toggleUnderline(session)),
      makeStyleMenuButton(session),
    );
    renderStyleMenu(session);
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
    const minHeight = Math.max(30, rect.height);
    const top = Math.min(
      Math.max(8, rect.top),
      Math.max(8, ownerWindow.innerHeight - minHeight - 8),
    );
    Object.assign(session.editor.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      minHeight: `${minHeight}px`,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      textTransform: style.textTransform,
      textDecorationLine: style.textDecorationLine,
      color: style.color,
      padding: style.padding,
      borderRadius: style.borderRadius,
      background: effectiveBackgroundColor(session.element),
    });
    session.editor.style.height = "auto";
    session.editor.style.height = `${Math.max(minHeight, session.editor.scrollHeight)}px`;

    const toolbarRect = session.toolbar.getBoundingClientRect();
    const toolbarHeight = Math.max(40, toolbarRect.height);
    const editorHeight = Math.max(minHeight, session.editor.getBoundingClientRect().height);
    const below = top + editorHeight + 8;
    const toolbarTop = below + toolbarHeight <= ownerWindow.innerHeight - 8
      ? below
      : Math.max(8, top - toolbarHeight - 8);
    const toolbarWidth = Math.max(0, toolbarRect.width);
    const toolbarLeft = Math.min(
      Math.max(8, left),
      Math.max(8, ownerWindow.innerWidth - toolbarWidth - 8),
    );
    session.toolbar.style.left = `${toolbarLeft}px`;
    session.toolbar.style.top = `${toolbarTop}px`;

    let menuTop = toolbarTop;
    let menuBottom = toolbarTop;
    let menuAboveToolbar = false;
    if (session.menuOpen) {
      const menuRect = session.menu.getBoundingClientRect();
      const menuHeight = Math.max(0, menuRect.height);
      const menuWidth = Math.max(STYLE_MENU_WIDTH, menuRect.width);
      const above = toolbarTop - menuHeight - 8;
      menuAboveToolbar = above >= 8;
      menuTop = menuAboveToolbar
        ? above
        : Math.min(ownerWindow.innerHeight - menuHeight - 8, toolbarTop + toolbarHeight + 8);
      const menuLeft = Math.min(
        Math.max(8, toolbarLeft + toolbarWidth - menuWidth),
        Math.max(8, ownerWindow.innerWidth - menuWidth - 8),
      );
      session.menu.style.left = `${menuLeft}px`;
      session.menu.style.top = `${Math.max(8, menuTop)}px`;
      menuBottom = Math.max(8, menuTop) + menuHeight;
    }

    const cardRect = session.inspectorCard.getBoundingClientRect();
    const cardHeight = Math.max(0, cardRect.height);
    const cardWidth = Math.max(320, cardRect.width);
    const halfCard = cardWidth / 2;
    let cardTop: number;
    if (session.menuOpen) {
      const oppositeBelow = toolbarTop + toolbarHeight + 8;
      const oppositeAbove = toolbarTop - cardHeight - 8;
      if (menuAboveToolbar && oppositeBelow + cardHeight <= ownerWindow.innerHeight - 8) {
        cardTop = oppositeBelow;
      } else if (!menuAboveToolbar && oppositeAbove >= 8) {
        cardTop = oppositeAbove;
      } else if (menuAboveToolbar) {
        cardTop = Math.max(8, menuTop - cardHeight - 8);
      } else {
        cardTop = Math.min(ownerWindow.innerHeight - cardHeight - 8, menuBottom + 8);
      }
    } else {
      const toolbarBelowEditor = toolbarTop >= top + editorHeight;
      const belowToolbar = toolbarTop + toolbarHeight + 8;
      cardTop = toolbarBelowEditor && belowToolbar + cardHeight <= ownerWindow.innerHeight - 8
        ? belowToolbar
        : Math.max(8, toolbarTop - cardHeight - 8);
    }
    const cardCenter = Math.min(
      Math.max(toolbarLeft + toolbarWidth / 2, 8 + halfCard),
      ownerWindow.innerWidth - 8 - halfCard,
    );
    session.inspectorCard.style.left = `${cardCenter}px`;
    session.inspectorCard.style.top = `${Math.max(8, cardTop)}px`;
  };

  const closeEditor = () => {
    const session = editorSession;
    if (!session) return;
    session.editor.remove();
    session.toolbar.remove();
    session.menu.remove();
    session.inspectorCard.remove();
    editorSession = null;
  };

  const cancelEditor = () => {
    const session = editorSession;
    if (!session) return;
    setNodeText(session.node, session.initialText);
    restoreStyleChanges(session.element, session.styleChanges);
    const initialOwned = new Set<MesurerTextStyleProperty>();
    for (const change of session.initialStyleChanges) {
      const current = session.element.style.getPropertyValue(change.property);
      const priority = session.element.style.getPropertyPriority(change.property);
      if (current === change.beforeInline && priority === change.beforePriority) {
        session.element.style.setProperty(change.property, change.desired);
        initialOwned.add(change.property);
      }
    }
    const owned = applied.get(session.editId);
    if (owned?.element === session.element) {
      applied.set(session.editId, {
        ...owned,
        styleChanges: session.initialStyleChanges.filter((change) => initialOwned.has(change.property)),
      });
    }
    closeEditor();
  };

  const commitEditor = () => {
    const session = editorSession;
    if (!session) return;
    const desiredText = `${session.leading}${session.editor.value}${session.trailing}`;
    const styleChanges = cloneStyleChanges(session.styleChanges);
    if (desiredText === session.initialText
      && JSON.stringify(styleChanges) === JSON.stringify(session.initialStyleChanges)) {
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
      styleChanges,
      fingerprintTag: session.fingerprint.tag,
      fingerprintId: session.fingerprint.id,
      fingerprintTestId: session.fingerprint.testId,
      fingerprintRole: session.fingerprint.role,
      fingerprintAriaLabel: session.fingerprint.ariaLabel,
      fingerprintClasses: session.fingerprint.classes,
      fingerprintText: session.fingerprint.text,
    };
    liveNodes.set(session.editId, { element: session.element, node: session.node });
    applied.set(session.editId, {
      element: session.element,
      node: session.node,
      beforeText: session.beforeText,
      desiredText,
      styleChanges,
    });
    setNodeText(session.node, desiredText);
    closeEditor();
    void ctx.command.execute(COMMIT_COMMAND, undefined, { source: "text-inspector" }).catch(() => {
      const owned = applied.get(session.editId);
      if (owned) {
        if (owned.node.isConnected && owned.node.nodeValue === desiredText) {
          setNodeText(owned.node, session.beforeText);
        }
        if (owned.element.isConnected) restoreStyleChanges(owned.element, owned.styleChanges);
      }
      applied.delete(session.editId);
    });
  };

  const directTextTarget = (x: number, y: number) => {
    for (const candidate of ownerDocument.elementsFromPoint(x, y)) {
      if (!(candidate instanceof realm.HTMLElement)) continue;
      if (!isPageElement(candidate) || SKIP_TAGS.has(candidate.tagName)) continue;
      if (candidate.isContentEditable) continue;
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

  const beginEditorAt = (x: number, y: number, event?: Event) => {
    if (!directEditingMode()) return;
    const target = directTextTarget(x, y);
    if (!target) return;
    event?.preventDefault();
    event?.stopImmediatePropagation();
    cancelEditor();

    const selector = getElementSelector(target.element);
    const fingerprint = getElementFingerprint(target.element);
    const existing = findExisting(target.element, target.node, selector, target.nodeIndex);
    const current = target.node.nodeValue ?? "";
    const owned = existing ? applied.get(existing.id) : undefined;
    const ownsExisting = Boolean(
      existing
      && owned?.node === target.node
      && (current === owned.desiredText || owned.styleChanges.length > 0),
    );

    let beforeText = current;
    let initialText = current;
    let styleChanges: TextStyleChangeValue[] = [];
    const editId = existing?.id ?? randomId(ownerWindow, "text-edit");
    if (existing && ownsExisting) {
      beforeText = existing.beforeText;
      initialText = existing.desiredText;
      styleChanges = cloneStyleChanges(existing.styleChanges);
      setNodeText(target.node, initialText);
    } else if (existing && current === existing.beforeText) {
      beforeText = existing.beforeText;
      initialText = existing.desiredText;
      styleChanges = cloneStyleChanges(existing.styleChanges);
      setNodeText(target.node, initialText);
      const ownedStyleChanges = applyStyleChanges(target.element, styleChanges, new Set());
      applied.set(existing.id, {
        ...target,
        beforeText,
        desiredText: initialText,
        styleChanges: ownedStyleChanges,
      });
    } else if (existing && current === existing.desiredText) {
      // The real application now renders the previous Desired text. Treat a
      // further edit as a new baseline instead of claiming ownership of Live.
      beforeText = current;
      initialText = current;
      styleChanges = [];
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
      border: "0",
      outline: "none",
      boxShadow: "0 0 0 2px #0d99ff, 0 8px 24px rgba(15,23,42,.18)",
    });

    const toolbar = ownerDocument.createElement("div");
    toolbar.className = "mesurer-toolbar-surface";
    toolbar.dataset.mesurerTextStyleToolbar = "true";
    toolbar.dataset.mesurerTextStyleSurface = "toolbar";
    toolbar.dataset.mesurerInspectorUi = "true";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text styles");
    Object.assign(toolbar.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      gap: "4px",
      maxWidth: "calc(100vw - 16px)",
      padding: "4px",
      borderRadius: "12px",
      background: "#ffffff",
      color: TOOLBAR_INK,
      boxShadow: TOOLBAR_SHADOW,
    });

    const menu = ownerDocument.createElement("div");
    menu.className = "mesurer-toolbar-surface";
    menu.dataset.mesurerTextStyleMenu = "true";
    menu.dataset.mesurerInspectorUi = "true";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Text style menu");
    Object.assign(menu.style, {
      position: "fixed",
      zIndex: "2147483647",
      width: `${STYLE_MENU_WIDTH}px`,
      maxWidth: "calc(100vw - 16px)",
      maxHeight: "min(520px, calc(100vh - 16px))",
      overflowY: "auto",
      pointerEvents: "auto",
      boxSizing: "border-box",
      padding: "6px",
      borderRadius: "12px",
      background: "#ffffff",
      color: TOOLBAR_INK,
      boxShadow: TOOLBAR_SHADOW,
    });

    const inspectorCard = makeCard(ownerDocument, false);
    inspectorCard.dataset.mesurerTextInspectorInfo = "true";
    inspectorCard.dataset.mesurerInspectorUi = "true";
    inspectorCard.setAttribute("aria-label", "Text inspector");
    Object.assign(inspectorCard.style, {
      zIndex: "2147483647",
      pointerEvents: "none",
      transform: "translateX(-50%)",
      opacity: "1",
    });

    inspectorMount.element.append(editor, toolbar, menu, inspectorCard);
    const inspectorInfo = typography.getFull(target.element);
    editorSession = {
      element: target.element,
      node: target.node,
      editor,
      toolbar,
      menu,
      menuOpen: false,
      inspectorCard,
      inspectorInfo,
      editId,
      beforeText,
      initialText,
      leading: frameValue.leading,
      trailing: frameValue.trailing,
      nodeIndex: target.nodeIndex,
      selector,
      fingerprint,
      initialStyleChanges: cloneStyleChanges(styleChanges),
      styleChanges,
      catalog: collectStyleCatalog(target.element),
    };
    renderToolbar(editorSession);
    renderInspectorCard(editorSession, false);
    positionEditor();
    editor.addEventListener("input", () => {
      const session = editorSession;
      if (!session || session.editor !== editor) return;
      setNodeText(session.node, `${session.leading}${editor.value}${session.trailing}`);
      renderInspectorCard(session, false);
      positionEditor();
    });
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(0, editor.value.length);
  };

  const beginEditor = (event: Event) => {
    if (!(event instanceof realm.MouseEvent)) return;
    beginEditorAt(event.clientX, event.clientY, event);
  };

  const onTouchPointerUp = (event: PointerEvent) => {
    if (!event.pointerType || event.pointerType === "mouse" || !directEditingMode()) return;
    const target = directTextTarget(event.clientX, event.clientY);
    if (!target) {
      lastTap = null;
      return;
    }
    const now = ownerWindow.performance.now();
    const previous = lastTap;
    const isDoubleTap = Boolean(
      previous
      && previous.element === target.element
      && now - previous.time <= DOUBLE_TAP_MS
      && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_DISTANCE,
    );
    if (isDoubleTap) {
      lastTap = null;
      beginEditorAt(event.clientX, event.clientY, event);
      return;
    }
    lastTap = {
      time: now,
      x: event.clientX,
      y: event.clientY,
      element: target.element,
    };
  };

  const syncPresentation = () => {
    frame = 0;
    if (disposed) return;
    if (!directEditingMode()) {
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
    if (!session) return;
    const path = event.composedPath();
    if (path.includes(session.editor) || path.includes(session.toolbar) || path.includes(session.menu)) return;
    commitEditor();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const session = editorSession;
    if (session) {
      const inEditor = event.composedPath().includes(session.editor);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (session.menuOpen) {
          session.menuOpen = false;
          renderToolbar(session);
          positionEditor();
          session.editor.focus({ preventScroll: true });
          return;
        }
        cancelEditor();
        return;
      }
      if (inEditor && event.altKey && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        const presetId = event.key === "0"
          ? "text"
          : event.key === "1"
            ? "heading-1"
            : event.key === "2"
              ? "heading-2"
              : event.key === "3"
                ? "heading-3"
                : null;
        const preset = presetId
          ? session.catalog.presets.find((candidate) => candidate.id === presetId)
          : null;
        if (preset) {
          event.preventDefault();
          event.stopImmediatePropagation();
          applyPreset(session, preset);
          return;
        }
      }
      if (inEditor && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "b" || key === "i" || key === "u") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (key === "b") toggleBold(session);
          else if (key === "i") toggleItalic(session);
          else toggleUnderline(session);
          session.editor.focus({ preventScroll: true });
          return;
        }
      }
      if (inEditor && event.key === "Enter" && !event.shiftKey) {
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
      const changed = value.desiredText !== value.beforeText || value.styleChanges.length > 0;
      return {
        edits: changed
          ? [...withoutCurrent, value].slice(-MAX_EDITS)
          : withoutCurrent,
      };
    });
  });
  ctx.command.register(CLEAR_COMMAND, () => {
    pendingCommit = null;
    ctx.state.update<TextEditStateValue>(MESURER_TEXT_EDIT_STATE_ID, () => ({ edits: [] }));
  });
  ctx.service.provide<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID, {
    intents: () => state().edits.map(publicIntent),
    intent: (id) => {
      const value = state().edits.find((edit) => edit.id === id);
      return value ? publicIntent(value) : null;
    },
    clear: () => ctx.command.execute(CLEAR_COMMAND),
  });

  const unsubscribeWorkspace = workspace.subscribe(schedulePresentation);
  ctx.state.subscribe(schedulePresentation);
  ownerWindow.addEventListener("dblclick", beginEditor, true);
  ownerWindow.addEventListener("pointerup", onTouchPointerUp, true);
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
    ownerWindow.removeEventListener("dblclick", beginEditor, true);
    ownerWindow.removeEventListener("pointerup", onTouchPointerUp, true);
    ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
    ownerWindow.removeEventListener("keydown", onKeyDown, true);
    ownerWindow.removeEventListener("resize", schedulePresentation);
    ownerWindow.removeEventListener("scroll", schedulePresentation, true);
    liveNodes.clear();
    workspace.dispose();
    inspectorMount.dispose();
  });
}
