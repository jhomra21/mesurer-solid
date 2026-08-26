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

const SVG_ATTRIBUTE_ALIASES = new Map<string, string>([
  ["className", "class"],
  ["clipPath", "clip-path"],
  ["clipRule", "clip-rule"],
  ["fillRule", "fill-rule"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["markerEnd", "marker-end"],
  ["markerMid", "marker-mid"],
  ["markerStart", "marker-start"],
  ["stopColor", "stop-color"],
  ["stopOpacity", "stop-opacity"],
  ["strokeDasharray", "stroke-dasharray"],
  ["strokeDashoffset", "stroke-dashoffset"],
  ["strokeLinecap", "stroke-linecap"],
  ["strokeLinejoin", "stroke-linejoin"],
  ["strokeMiterlimit", "stroke-miterlimit"],
  ["strokeOpacity", "stroke-opacity"],
  ["strokeWidth", "stroke-width"],
  ["textAnchor", "text-anchor"],
]);

type UniversalPrimitive = string | number | boolean | bigint | symbol | null | undefined;
type UniversalFunction = (...args: never[]) => void;
type UniversalPropertyMap = { [key: string]: UniversalPropertyValue };
type UniversalPropertyValue = UniversalPrimitive | UniversalFunction | UniversalPropertyValue[] | UniversalPropertyMap;
type StyledElement = HTMLElement | SVGElement;

const isString = (value: UniversalPropertyValue): value is string => typeof value === "string";
const isFunction = (value: UniversalPropertyValue): value is UniversalFunction => typeof value === "function";
const isPropertyMap = (value: UniversalPropertyValue): value is UniversalPropertyMap =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasStyle = (node: Element): node is StyledElement => "style" in node;

function cssName(name: string) {
  if (name.startsWith("--") || name.includes("-")) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setStyle(node: Element, value: UniversalPropertyValue, previous: UniversalPropertyValue) {
  if (!hasStyle(node)) return;
  const { style } = node;
  if (isString(value)) {
    style.cssText = value;
    return;
  }
  if (!isPropertyMap(value)) {
    style.cssText = "";
    return;
  }

  const previousMap = isPropertyMap(previous) ? previous : null;
  if (previousMap) {
    for (const name of Object.keys(previousMap)) {
      if (!(name in value) || value[name] == null) style.removeProperty(cssName(name));
    }
  }
  for (const [name, propertyValue] of Object.entries(value)) {
    if (propertyValue == null) style.removeProperty(cssName(name));
    else style.setProperty(cssName(name), String(propertyValue));
  }
}

function setClassList(node: Element, value: UniversalPropertyValue, previous: UniversalPropertyValue) {
  const next = isPropertyMap(value) ? value : null;
  const prev = isPropertyMap(previous) ? previous : null;
  if (prev) {
    for (const name of Object.keys(prev)) {
      if (!next?.[name]) node.classList.remove(...name.trim().split(/\s+/));
    }
  }
  if (!next) return;
  for (const [name, enabled] of Object.entries(next)) {
    if (enabled) node.classList.add(...name.trim().split(/\s+/));
  }
}

function setEvent(node: Element, name: string, value: UniversalPropertyValue) {
  const property = name.toLowerCase();
  if (Array.isArray(value)) {
    const handler = value[0];
    const data = value[1];
    if (!isFunction(handler)) {
      Reflect.set(node, property, null);
      return;
    }
    // SAFETY: Solid's universal renderer encodes delegated handlers as [handler, data].
    const dataHandler = handler as (input: UniversalPropertyValue, event: Event) => void;
    Reflect.set(node, property, (event: Event) => dataHandler(data, event));
    return;
  }
  Reflect.set(node, property, isFunction(value) ? value : null);
}

function applyProperty(
  node: Node,
  propertyName: string,
  value: UniversalPropertyValue,
  previous: UniversalPropertyValue,
) {
  if (!(node instanceof Element)) return;
  const isSvg = node.namespaceURI === SVG_NAMESPACE;
  let name = propertyName;

  if (name === "style") {
    setStyle(node, value, previous);
    return;
  }
  if (name === "classList") {
    setClassList(node, value, previous);
    return;
  }
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
    if (isFunction(previous)) {
      // SAFETY: Solid supplies direct `on:` values as DOM EventListener-compatible functions.
      const listener = previous as EventListener;
      node.removeEventListener(eventName, listener);
    }
    if (isFunction(value)) {
      // SAFETY: Solid supplies direct `on:` values as DOM EventListener-compatible functions.
      const listener = value as EventListener;
      node.addEventListener(eventName, listener);
    }
    return;
  }
  if (name.startsWith("attr:")) name = name.slice(5);
  if (name.startsWith("bool:")) {
    name = name.slice(5);
    if (value) node.setAttribute(name, "");
    else node.removeAttribute(name);
    return;
  }

  if (!isSvg && DOM_PROPERTIES.has(name)) {
    const property = name === "htmlFor" ? "htmlFor" : name;
    Reflect.set(node, property, BOOLEAN_PROPERTIES.has(name) ? Boolean(value) : value ?? "");
    return;
  }

  if (name === "htmlFor") name = "for";
  if (isSvg && name === "xlinkHref") {
    if (value == null || value === false) node.removeAttributeNS(XLINK_NAMESPACE, "href");
    else node.setAttributeNS(XLINK_NAMESPACE, "xlink:href", String(value));
    return;
  }
  if (isSvg) name = SVG_ATTRIBUTE_ALIASES.get(name) ?? name;

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
  createElement(tagName, staticProps) {
    const node = SVG_ELEMENTS.has(tagName)
      ? document.createElementNS(SVG_NAMESPACE, tagName)
      : document.createElement(tagName);
    if (staticProps) {
      for (const [name, value] of Object.entries(staticProps)) {
        // SAFETY: @solidjs/universal forwards compiled JSX property values through this renderer boundary.
        applyProperty(node, name, value as UniversalPropertyValue, undefined);
      }
    }
    return node;
  },
  createTextNode(value) {
    return document.createTextNode(String(value));
  },
  replaceText(textNode, value) {
    textNode.nodeValue = String(value);
  },
  setProperty(node, name, value, previous) {
    // SAFETY: @solidjs/universal owns this callback contract and forwards compiled JSX property values here.
    const nextValue = value as UniversalPropertyValue;
    // SAFETY: @solidjs/universal owns this callback contract and forwards the previous compiled JSX value here.
    const previousValue = previous as UniversalPropertyValue;
    applyProperty(node, name, nextValue, previousValue);
  },
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
