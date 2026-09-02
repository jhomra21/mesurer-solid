import { getDeepestElementAtPoint, inspectDomElement, isElementWithinDomTarget, withPointerEventsDisabled } from "@jhomra21/mesurer-solid-dom";
import type {
  MesurerPluginDescription,
  MesurerPluginHost,
  PluginStateSnapshot,
} from "./core";

export const MESURER_TEXT_EDIT_SERVICE_ID = "text-edit";

export type MesurerTextStyleProperty =
  | "font-family"
  | "font-size"
  | "font-weight"
  | "font-style"
  | "color"
  | "text-decoration-line";

export type MesurerTextStyleChange = {
  property: MesurerTextStyleProperty;
  before: string;
  desired: string;
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
  pluginState: PluginStateSnapshot;
};

type AgentCommandArgs = Parameters<MesurerPluginHost["command"]["execute"]>[1];

export type MesurerAgentHarness = {
  ready(): Promise<void>;
  describe(): Promise<MesurerPluginDescription | undefined>;
  inspect(selector: string, index?: number): AgentElementInspection | null;
  inspectAll(selector: string, limit?: number): AgentElementInspection[];
  at(x: number, y: number): AgentElementInspection | null;
  distance(a: string, b: string): AgentDistance | null;
  viewport(): AgentViewportSnapshot;
  feedback(selectors?: string[]): Promise<AgentFeedbackSnapshot>;
  command(id: string, args?: AgentCommandArgs): Promise<void>;
  state(): Promise<PluginStateSnapshot>;
  textEdits(): Promise<MesurerTextEditIntent[]>;
  textEdit(id: string): Promise<MesurerTextEditIntent>;
  stable(frames?: number): Promise<void>;
};

export type CreateMesurerAgentHarnessOptions = {
  ownerDocument: Document;
  root?: Document | HTMLElement | ShadowRoot;
  getPluginHost: () => MesurerPluginHost | undefined;
  waitForPluginHost: () => Promise<MesurerPluginHost>;
};

const inspectElement = (element: Element): AgentElementInspection =>
  inspectDomElement(element);

export function createMesurerAgentHarness(options: CreateMesurerAgentHarnessOptions): MesurerAgentHarness {
  const root = options.root ?? options.ownerDocument;
  const ownerWindow = options.ownerDocument.defaultView ?? window;

  const query = (selector: string, index = 0) => {
    const matches = root.querySelectorAll(selector);
    return matches.item(index) || null;
  };

  const containsPointElement = (element: Element) => {
    if (root === options.ownerDocument) return true;
    return isElementWithinDomTarget(element, root);
  };

  const getTextEditService = async () => {
    const host = options.getPluginHost() ?? await options.waitForPluginHost();
    const service = host.service.get<MesurerTextEditService>(MESURER_TEXT_EDIT_SERVICE_ID);
    if (!service) throw new Error("Mesurer text editing service is unavailable.");
    return service;
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
      const inspectorHost = root.querySelector?.<HTMLElement>("[data-mesurer-island]") ?? null;
      const inspectorLayer = inspectorHost?.shadowRoot?.querySelector<HTMLElement>("[data-mesurer-root='true']") ?? inspectorHost;
      return withPointerEventsDisabled(inspectorLayer, () => {
        const nativePointElement = getDeepestElementAtPoint({ x, y }, root, options.ownerDocument);
        return nativePointElement && containsPointElement(nativePointElement) ? inspectElement(nativePointElement) : null;
      });
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
    async textEdits() {
      return (await getTextEditService()).intents();
    },
    async textEdit(id) {
      const intent = (await getTextEditService()).intent(id);
      if (!intent) throw new Error(`Text edit intent not found: ${id}`);
      return intent;
    },
    stable,
  };
}