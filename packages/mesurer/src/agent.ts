import { getInspectMeasurement as getDomInspectMeasurement } from "@jhomra21/mesurer-dom";
import type {
  MesurerPluginDescription,
  MesurerPluginHost,
} from "@jhomra21/mesurer-solid";

export type AgentRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type AgentEdges = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AgentElementInspection = {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  role: string | null;
  ariaLabel: string | null;
  rect: AgentRect;
  margin: AgentEdges;
  padding: AgentEdges;
  border: AgentEdges;
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    color: string;
  };
  appearance: {
    backgroundColor: string;
    borderColor: string;
    borderRadius: string;
    boxShadow: string;
    opacity: string;
  };
  layout: {
    display: string;
    position: string;
    zIndex: string;
    overflowX: string;
    overflowY: string;
    flexDirection: string;
    alignItems: string;
    justifyContent: string;
    gap: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
    transform: string;
  };
  scroll: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    overflowsX: boolean;
    overflowsY: boolean;
  };
};

export type AgentDistance = {
  a: AgentElementInspection;
  b: AgentElementInspection;
  horizontalGap: number;
  verticalGap: number;
  centerDeltaX: number;
  centerDeltaY: number;
};

export type AgentViewportSnapshot = {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  documentWidth: number;
  documentHeight: number;
  horizontalOverflow: boolean;
  verticalOverflow: boolean;
};

export type AgentFeedbackSnapshot = {
  viewport: AgentViewportSnapshot;
  elements: AgentElementInspection[];
  plugins: MesurerPluginDescription | undefined;
  pluginState: Record<string, unknown>;
};

export type MesurerAgentHarness = {
  /** Wait until Mesurer's plugin/runtime bridge is available. */
  ready(): Promise<void>;
  /** Machine-readable Mesurer capabilities, tools, commands, plugins and state slices. */
  describe(): Promise<MesurerPluginDescription | undefined>;
  /** Inspect one application element using a selector. */
  inspect(selector: string, index?: number): AgentElementInspection | null;
  /** Inspect multiple matching application elements. */
  inspectAll(selector: string, limit?: number): AgentElementInspection[];
  /** Inspect the application element under a viewport coordinate. */
  at(x: number, y: number): AgentElementInspection | null;
  /** Measure the gap and center delta between two application elements. */
  distance(a: string, b: string): AgentDistance | null;
  /** Current viewport/document dimensions and overflow signals. */
  viewport(): AgentViewportSnapshot;
  /** One JSON-safe feedback payload for an agent iteration. */
  feedback(selectors?: string[]): Promise<AgentFeedbackSnapshot>;
  /** Execute any registered Mesurer/plugin command. */
  command(id: string, args?: unknown): Promise<void>;
  /** Read all currently registered plugin-owned state. */
  state(): Promise<Record<string, unknown>>;
  /** Wait for fonts and a configurable number of animation frames to settle. */
  stable(frames?: number): Promise<void>;
};

export type CreateMesurerAgentHarnessOptions = {
  ownerDocument: Document;
  root?: ParentNode;
  getPluginHost: () => MesurerPluginHost | undefined;
  waitForPluginHost: () => Promise<MesurerPluginHost>;
};

const number = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const edges = (style: CSSStyleDeclaration, prefix: "margin" | "padding" | "border") => ({
  top: number(style.getPropertyValue(`${prefix}-top${prefix === "border" ? "-width" : ""}`)),
  right: number(style.getPropertyValue(`${prefix}-right${prefix === "border" ? "-width" : ""}`)),
  bottom: number(style.getPropertyValue(`${prefix}-bottom${prefix === "border" ? "-width" : ""}`)),
  left: number(style.getPropertyValue(`${prefix}-left${prefix === "border" ? "-width" : ""}`)),
});

const rect = (value: DOMRect): AgentRect => ({
  left: value.left,
  top: value.top,
  right: value.right,
  bottom: value.bottom,
  width: value.width,
  height: value.height,
  x: value.x,
  y: value.y,
});

const elementSelector = (element: Element) => {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const testId = element.getAttribute("data-testid");
  if (testId) return `[data-testid=${JSON.stringify(testId)}]`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < 5) {
    let part = current.localName;
    const parentElement: Element | null = current.parentElement;
    if (parentElement) {
      const currentName = current.localName;
      const siblings = [...parentElement.children].filter((candidate) => candidate.localName === currentName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parentElement;
  }
  return parts.join(" > ");
};

const inspectElement = (element: Element): AgentElementInspection => {
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  const style = ownerWindow.getComputedStyle(element);
  const html = element as HTMLElement;
  const bounding = element.getBoundingClientRect();
  const canonical = element instanceof ownerWindow.HTMLElement
    ? getDomInspectMeasurement(element as HTMLElement, ownerWindow)
    : null;
  return {
    selector: elementSelector(element),
    tag: element.localName,
    id: element.id || null,
    classes: [...element.classList],
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    role: element.getAttribute("role"),
    ariaLabel: element.getAttribute("aria-label"),
    rect: rect(bounding),
    margin: canonical?.margin ?? edges(style, "margin"),
    padding: canonical?.padding ?? edges(style, "padding"),
    border: edges(style, "border"),
    typography: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      color: style.color,
    },
    appearance: {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
    },
    layout: {
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      flexDirection: style.flexDirection,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      gap: style.gap,
      gridTemplateColumns: style.gridTemplateColumns,
      gridTemplateRows: style.gridTemplateRows,
      transform: style.transform,
    },
    scroll: {
      clientWidth: html.clientWidth ?? 0,
      clientHeight: html.clientHeight ?? 0,
      scrollWidth: html.scrollWidth ?? 0,
      scrollHeight: html.scrollHeight ?? 0,
      overflowsX: (html.scrollWidth ?? 0) > (html.clientWidth ?? 0) + 1,
      overflowsY: (html.scrollHeight ?? 0) > (html.clientHeight ?? 0) + 1,
    },
  };
};

export function createMesurerAgentHarness(options: CreateMesurerAgentHarnessOptions): MesurerAgentHarness {
  const root = options.root ?? options.ownerDocument;
  const ownerWindow = options.ownerDocument.defaultView ?? window;

  const query = (selector: string, index = 0) => {
    const matches = root.querySelectorAll(selector);
    return matches.item(index) || null;
  };

  const viewport = (): AgentViewportSnapshot => {
    const documentElement = options.ownerDocument.documentElement;
    const body = options.ownerDocument.body;
    const documentWidth = Math.max(documentElement.scrollWidth, body?.scrollWidth ?? 0);
    const documentHeight = Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0);
    return {
      width: ownerWindow.innerWidth,
      height: ownerWindow.innerHeight,
      devicePixelRatio: ownerWindow.devicePixelRatio,
      scrollX: ownerWindow.scrollX,
      scrollY: ownerWindow.scrollY,
      documentWidth,
      documentHeight,
      horizontalOverflow: documentWidth > ownerWindow.innerWidth + 1,
      verticalOverflow: documentHeight > ownerWindow.innerHeight + 1,
    };
  };

  const stable = async (frames = 2) => {
    await options.ownerDocument.fonts?.ready;
    for (let index = 0; index < Math.max(1, frames); index += 1) {
      await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
    }
  };

  return {
    async ready() {
      await options.waitForPluginHost();
      await stable();
    },
    async describe() {
      const host = await options.waitForPluginHost();
      return host.describe();
    },
    inspect(selector, index = 0) {
      const element = query(selector, index);
      return element ? inspectElement(element) : null;
    },
    inspectAll(selector, limit = 50) {
      return [...root.querySelectorAll(selector)].slice(0, Math.max(0, limit)).map(inspectElement);
    },
    at(x, y) {
      const pointRoot = root as ParentNode & { elementFromPoint?: (x: number, y: number) => Element | null };
      const element = pointRoot.elementFromPoint?.(x, y) ?? options.ownerDocument.elementFromPoint(x, y);
      return element ? inspectElement(element) : null;
    },
    distance(a, b) {
      const left = query(a);
      const right = query(b);
      if (!left || !right) return null;
      const inspectedA = inspectElement(left);
      const inspectedB = inspectElement(right);
      const aRect = inspectedA.rect;
      const bRect = inspectedB.rect;
      const horizontalGap = bRect.left >= aRect.right
        ? bRect.left - aRect.right
        : aRect.left >= bRect.right
          ? aRect.left - bRect.right
          : 0;
      const verticalGap = bRect.top >= aRect.bottom
        ? bRect.top - aRect.bottom
        : aRect.top >= bRect.bottom
          ? aRect.top - bRect.bottom
          : 0;
      return {
        a: inspectedA,
        b: inspectedB,
        horizontalGap,
        verticalGap,
        centerDeltaX: (bRect.left + bRect.width / 2) - (aRect.left + aRect.width / 2),
        centerDeltaY: (bRect.top + bRect.height / 2) - (aRect.top + aRect.height / 2),
      };
    },
    viewport,
    async feedback(selectors = []) {
      await stable();
      const host = options.getPluginHost() ?? await options.waitForPluginHost();
      return {
        viewport: viewport(),
        elements: selectors.flatMap((selector) => [...root.querySelectorAll(selector)].slice(0, 50).map(inspectElement)),
        plugins: host.describe(),
        pluginState: host.state.serialize("all"),
      };
    },
    async command(id, args) {
      const host = options.getPluginHost() ?? await options.waitForPluginHost();
      await host.command.execute(id, args, { source: "agent-harness" });
      await stable(1);
    },
    async state() {
      const host = options.getPluginHost() ?? await options.waitForPluginHost();
      return host.state.serialize("all");
    },
    stable,
  };
}
