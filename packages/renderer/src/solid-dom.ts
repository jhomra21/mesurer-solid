import { createRenderer } from "@solidjs/universal";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

const SVG_ELEMENTS = new Set([
  "svg", "animate", "animateMotion", "animateTransform", "circle", "clipPath", "defs",
  "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow",
  "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage",
  "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotLight", "feTile", "feTurbulence", "filter", "foreignObject", "g", "image", "line",
  "linearGradient", "marker", "mask", "metadata", "mpath", "path", "pattern", "polygon",
  "polyline", "radialGradient", "rect", "set", "stop", "symbol", "text", "textPath", "tspan",
  "use", "view",
]);

const BOOLEAN_PROPERTIES = new Set([
  "checked", "disabled", "hidden", "multiple", "muted", "open", "readOnly", "required",
  "selected", "autofocus",
]);

const DOM_PROPERTIES = new Set([
  ...BOOLEAN_PROPERTIES,
  "className", "htmlFor", "id", "tabIndex", "textContent", "title", "value",
]);

const SVG_ATTRIBUTE_ALIASES: Record<string, string> = {
  className: "class",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  fillRule: "fill-rule",
  fontFamily: "font-family",
  fontSize: "font-size",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
};

function cssName(name: string) {
  if (name.startsWith("--") || name.includes("-")) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setStyle(node: Element, value: unknown, previous: unknown) {
  const style = (node as HTMLElement | SVGElement).style;
  if (typeof value === "string") {
    style.cssText = value;
    return;
  }
  if (!value || typeof value !== "object") {
    style.cssText = "";
    return;
  }

  const next = value as Record<string, string | number | null | undefined>;
  const prev = previous && typeof previous === "object"
    ? previous as Record<string, unknown>
    : {};
  for (const name of Object.keys(prev)) {
    if (!(name in next) || next[name] == null) style.removeProperty(cssName(name));
  }
  for (const [name, propertyValue] of Object.entries(next)) {
    if (propertyValue == null) style.removeProperty(cssName(name));
    else style.setProperty(cssName(name), String(propertyValue));
  }
}

function setClassList(node: Element, value: unknown, previous: unknown) {
  const next = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const prev = previous && typeof previous === "object" ? previous as Record<string, unknown> : {};
  for (const name of Object.keys(prev)) {
    if (!next[name]) node.classList.remove(...name.trim().split(/\s+/));
  }
  for (const [name, enabled] of Object.entries(next)) {
    if (enabled) node.classList.add(...name.trim().split(/\s+/));
  }
}

function setEvent(node: Element, name: string, value: unknown) {
  const property = name.toLowerCase() as keyof Element;
  if (Array.isArray(value)) {
    const [handler, data] = value;
    (node as unknown as Record<string, unknown>)[property as string] =
      typeof handler === "function" ? (event: Event) => handler(data, event) : null;
  } else {
    (node as unknown as Record<string, unknown>)[property as string] =
      typeof value === "function" ? value : null;
  }
}

function setProperty(node: Node, name: string, value: unknown, previous: unknown) {
  if (!(node instanceof Element)) return;
  const isSvg = node.namespaceURI === SVG_NAMESPACE;

  if (name === "style") return setStyle(node, value, previous);
  if (name === "classList") return setClassList(node, value, previous);
  if (name === "class" || name === "className") {
    if (value == null || value === false) node.removeAttribute("class");
    else node.setAttribute("class", String(value));
    return;
  }
  if (/^on[A-Z]/.test(name) || /^on[a-z]/.test(name)) {
    setEvent(node, name, value);
    return;
  }
  if (name.startsWith("on:")) {
    const eventName = name.slice(3);
    if (typeof previous === "function") node.removeEventListener(eventName, previous as EventListener);
    if (typeof value === "function") node.addEventListener(eventName, value as EventListener);
    return;
  }
  if (name.startsWith("attr:")) name = name.slice(5);
  if (name.startsWith("bool:")) {
    name = name.slice(5);
    value ? node.setAttribute(name, "") : node.removeAttribute(name);
    return;
  }

  if (!isSvg && DOM_PROPERTIES.has(name)) {
    const propertyName = name === "htmlFor" ? "htmlFor" : name;
    const record = node as unknown as Record<string, unknown>;
    if (BOOLEAN_PROPERTIES.has(name)) record[propertyName] = Boolean(value);
    else record[propertyName] = value ?? "";
    return;
  }

  if (name === "htmlFor") name = "for";
  if (isSvg && name === "xlinkHref") {
    if (value == null || value === false) node.removeAttributeNS(XLINK_NAMESPACE, "href");
    else node.setAttributeNS(XLINK_NAMESPACE, "xlink:href", String(value));
    return;
  }
  if (isSvg) name = SVG_ATTRIBUTE_ALIASES[name] ?? name;

  if (value == null || value === false) node.removeAttribute(name);
  else node.setAttribute(name, value === true ? "" : String(value));
}

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  applyRef,
  ref,
} = createRenderer<Node>({
  createElement(tagName) {
    return SVG_ELEMENTS.has(tagName)
      ? document.createElementNS(SVG_NAMESPACE, tagName)
      : document.createElement(tagName);
  },
  createTextNode(value) {
    return document.createTextNode(String(value));
  },
  replaceText(textNode, value) {
    textNode.nodeValue = String(value);
  },
  setProperty,
  insertNode(parent, node, anchor) {
    parent.insertBefore(node, anchor ?? null);
  },
  isTextNode(node) {
    return node.nodeType === Node.TEXT_NODE;
  },
  removeNode(parent, node) {
    parent.removeChild(node);
  },
  getParentNode(node) {
    return node.parentNode ?? undefined;
  },
  getFirstChild(node) {
    return node.firstChild ?? undefined;
  },
  getNextSibling(node) {
    return node.nextSibling ?? undefined;
  },
});

export {
  Errored,
  For,
  Loading,
  Match,
  Repeat,
  Reveal,
  Show,
  Switch,
} from "solid-js";
