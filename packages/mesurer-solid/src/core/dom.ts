// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.

import type { InspectMeasurement, Rect } from "./types";
import { createId } from "./utils";

const getElementLabel = (element: HTMLElement) => {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const className = element.className
    ? `.${element.className.toString().split(" ")[0]}`
    : "";
  return `${tag}${id}${className}`;
};

const parseEdge = (value: string) => Number.parseFloat(value) || 0;

export const getRectFromDom = (element: Element): Rect => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

export const getInspectMeasurement = (
  element: HTMLElement,
  ownerWindow: Window = window,
): InspectMeasurement => {
  const rect = element.getBoundingClientRect();
  const style = ownerWindow.getComputedStyle(element);
  const padding = {
    top: parseEdge(style.paddingTop),
    right: parseEdge(style.paddingRight),
    bottom: parseEdge(style.paddingBottom),
    left: parseEdge(style.paddingLeft),
  };
  const margin = {
    top: parseEdge(style.marginTop),
    right: parseEdge(style.marginRight),
    bottom: parseEdge(style.marginBottom),
    left: parseEdge(style.marginLeft),
  };
  const paddingRect = {
    left: rect.left + padding.left,
    top: rect.top + padding.top,
    width: Math.max(0, rect.width - padding.left - padding.right),
    height: Math.max(0, rect.height - padding.top - padding.bottom),
  };
  const marginRect = {
    left: rect.left - margin.left,
    top: rect.top - margin.top,
    width: rect.width + margin.left + margin.right,
    height: rect.height + margin.top + margin.bottom,
  };

  return {
    id: createId(),
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    paddingRect,
    marginRect,
    padding,
    margin,
    label: getElementLabel(element),
    elementRef: element,
  };
};
