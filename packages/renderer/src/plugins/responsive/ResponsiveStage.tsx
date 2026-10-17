import { onSettled } from "solid-js";
import { RESPONSIVE_FRAME_SANDBOX, installPreviewGuard } from "../../core/preview-guard";
import { isEditableKeyboardEvent } from "../../core/events";
import type { Guide } from "../../core/types";
import { getMesurerPageKey, subscribeMesurerPageKey } from "../../runtime/page-location";
import { mountPreviewGuides } from "./preview-guides";

type Size = { width: number; height: number };

type Preview = Size & { id: number; name: string; guides?: Guide[] };

const DEVICES: Array<Omit<Preview, "id">> = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone X", width: 375, height: 812 },
  { name: "iPhone 15", width: 393, height: 852 },
  { name: "iPhone 15 Pro Max", width: 430, height: 932 },
  { name: "Pixel 8", width: 412, height: 915 },
  { name: "Galaxy S24", width: 360, height: 780 },
  { name: "iPad mini", width: 744, height: 1133 },
  { name: "iPad", width: 820, height: 1180 },
  { name: "iPad Pro 12.9", width: 1024, height: 1366 },
  { name: "Laptop", width: 1280, height: 800 },
  { name: "MacBook Air 13", width: 1470, height: 956 },
  { name: "Full HD", width: 1920, height: 1080 },
];

const MAX_PREVIEWS = 6;

const MIN_SIZE = 240;

const MAX_SIZE = 3840;

const HEADER_HEIGHT = 40;

let nextId = 1;

let savedKey = "";

let savedPreviews: Preview[] = [{ ...DEVICES[2], id: nextId++, guides: [] }];

let savedZoom: number | null = null;

const clamp = (value: number) => Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number.isFinite(value) ? value : MIN_SIZE)));

const setStyles = (element: HTMLElement, values: Record<string, string>) => {
  for (const [property, value] of Object.entries(values)) {
    element.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value);
  }
};

function breakpoints(doc: Document): number[] {
  const found = new Set<number>();
  const length = "(\\d*\\.?\\d+)(px|r?em)";
  const past = (limit: number) => Math.floor(limit) + 1;

  const patterns: Array<[RegExp, (limit: number, op: string) => number]> = [
    [new RegExp(`min-width\\s*:\\s*${length}`, "g"), (limit) => limit],
    [new RegExp(`max-width\\s*:\\s*${length}`, "g"), past],
    [new RegExp(`(?<![-\\w])width\\s*(>=|<=|>|<)\\s*${length}`, "g"),
      (limit, op) => op === ">=" || op === "<" ? limit : past(limit)],
    [new RegExp(`${length}\\s*(>=|<=|>|<)\\s*width(?![-\\w])`, "g"),
      (limit, op) => op === "<=" || op === ">" ? limit : past(limit)],
  ];

  const collect = (condition: string) => {
    const text = condition.toLowerCase();
    patterns.forEach(([pattern, toWidth], index) => {
      for (const match of text.matchAll(pattern)) {
        const [operator, value, unit] = index === 2
          ? [match[1], match[2], match[3]]
          : index === 3 ? [match[3], match[1], match[2]] : ["", match[1], match[2]];

        const pixels = Number(value) * (unit === "px" ? 1 : 16);
        const width = Math.ceil(toWidth(pixels, operator));

        if (width > 0 && width <= MAX_SIZE) found.add(width);
      }
    });
  };

  const visit = (rules: ArrayLike<CSSRule> | undefined) => {
    for (const rule of Array.from(rules ?? [])) {
      if (rule instanceof CSSMediaRule) collect(rule.conditionText);

      try {
        if (rule instanceof CSSGroupingRule) visit(rule.cssRules);

        if (rule instanceof CSSImportRule && rule.styleSheet) visit(rule.styleSheet.cssRules);
      } catch { /* Cross-origin imported sheet. */ }
    }
  };

  for (const sheet of [...Array.from(doc.styleSheets), ...Array.from(doc.adoptedStyleSheets ?? [])]) {
    collect(sheet.media.mediaText);

    try { visit(sheet.cssRules); } catch { /* Inaccessible stylesheet. */ }
  }

  return [...found].sort((a, b) => a - b);
}

function iconButton(doc: Document, label: string, text: string, handler: () => void) {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.title = label;
  setStyles(button, {
    minWidth: "24px", height: "24px", border: "0", borderRadius: "5px",
    color: "var(--msr-content)", background: "transparent", cursor: "pointer",
    font: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center",
  });
  button.addEventListener("click", (event) => { event.stopPropagation(); handler(); });

  return button;
}

type ResponsiveStageProps = {
  ownerDocument: Document;
  ownerWindow: Window;
  host: HTMLElement;
  onClose(): void;
  onChromePointerMove(): void;
  onPreviewRemove(): void;
  shortcutsEnabled: boolean;
  guidesActive(): boolean;
  guideOrientation(): Guide["orientation"];
  altPressed(): boolean;
  guideColor(): string;
  guideStyle(): import("../../core/persistence").GuideStyle;
  snapGuidesEnabled(): boolean;
};

export function ResponsiveStage(props: ResponsiveStageProps) {
  onSettled(() => {
    const { ownerDocument: doc, ownerWindow: win } = props;
    const key = getMesurerPageKey(win);

    const unsubscribePageKey = subscribeMesurerPageKey(win, (nextKey) => {
      if (nextKey === key) return;
      savedPreviews = [{ ...DEVICES[2], id: nextId++, guides: [] }];
      savedZoom = null;
      savedKey = nextKey;
      props.onClose();
    });

    if (savedKey && savedKey !== key) {
      savedPreviews = [{ ...DEVICES[2], id: nextId++, guides: [] }];
      savedZoom = null;
    }

    savedKey = key;
    let previews = savedPreviews.map((preview) => ({ ...preview, guides: preview.guides ?? [] }));
    let zoom = savedZoom;
    const stage = doc.createElement("div");
    stage.dataset.mesurerResponsiveStage = "true";
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-label", "Responsive preview");
    setStyles(stage, {
      position: "fixed", top: "64px", left: "0", right: "0", bottom: "0", zIndex: "80", display: "flex", flexDirection: "column",
      padding: "8px 32px 40px", boxSizing: "border-box", background: "rgba(9,9,11,0.78)",
      color: "var(--msr-content, #171717)", fontFamily: "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      pointerEvents: "auto",
    });
    stage.addEventListener("pointerdown", (event) => {
      event.stopPropagation();

      if (event.target === stage) props.onClose();
    });
    stage.addEventListener("pointermove", (event) => {
      event.stopPropagation();

      if (!(event.target instanceof HTMLIFrameElement)) props.onChromePointerMove();
    });
    stage.addEventListener("click", (event) => event.stopPropagation());

    const controls = doc.createElement("div");
    setStyles(controls, {
      height: "36px", minHeight: "36px", marginBottom: "12px", alignSelf: "center",
      display: "flex", alignItems: "center", gap: "6px", padding: "0 8px",
      borderRadius: "8px", background: "var(--msr-surface, #fff)", boxShadow: "var(--msr-shadow-floating)",
    });
    const preset = doc.createElement("select");
    preset.setAttribute("aria-label", "Add a size");
    setStyles(preset, { maxWidth: "150px", height: "26px", border: "0", color: "inherit", background: "transparent", font: "inherit" });
    const presetPlaceholder = new Option("Add a size", "");
    preset.add(presetPlaceholder);
    const choices = [...DEVICES, ...breakpoints(doc).map((width) => ({ name: `${clamp(width)}px breakpoint`, width: clamp(width), height: previews[0]?.height ?? 852 }))];

    for (const size of choices) preset.add(new Option(size.name, `${size.width}x${size.height}`));
    preset.addEventListener("change", () => {
      const [rawWidth, optionHeight] = (preset.value || "0x0").split("x").map(Number);
      const width = clamp(rawWidth);
      const isBreakpoint = preset.selectedOptions[0]?.textContent?.includes("breakpoint") ?? false;
      const height = isBreakpoint ? previews[0]?.height ?? 852 : optionHeight;

      if (!width || !height) return;

      if (previews.length < MAX_PREVIEWS) {
        const device = DEVICES.find((item) => item.width === width && item.height === height);
        const next = { id: nextId++, name: device?.name ?? `${width}px breakpoint`, width, height, guides: [] };
        previews = [...previews, next];
        persist();
        renderPreviews();
        row.scrollTo({ left: row.scrollWidth, behavior: "instant" });
      }

      preset.value = "";
    });
    controls.append(preset);

    const separator = () => {
      const line = doc.createElement("span");
      setStyles(line, { width: "1px", height: "16px", background: "var(--msr-color-ink-200, #ddd)", margin: "0 3px" });
      line.setAttribute("aria-hidden", "true");
      controls.append(line);
    };

    separator();
    const zoomSelect = doc.createElement("select");
    zoomSelect.setAttribute("aria-label", "Zoom");
    setStyles(zoomSelect, { width: "90px", height: "26px", border: "0", color: "inherit", background: "transparent", font: "inherit" });
    const fitOption = new Option("Fit", "fit");
    zoomSelect.add(fitOption);

    for (const value of [0.25, 0.5, 0.75, 1]) zoomSelect.add(new Option(`${Math.round(value * 100)}%`, String(value)));
    zoomSelect.addEventListener("change", () => { zoom = zoomSelect.value === "fit" ? null : Number(zoomSelect.value); persist(); layout(); });
    controls.append(zoomSelect);
    separator();
    controls.append(iconButton(doc, "Close Responsive", "×", props.onClose));

    const row = doc.createElement("div");
    row.dataset.mesurerResponsiveRow = "";
    setStyles(row, { minHeight: "0", flex: "1", overflowX: "auto", overflowY: "auto", overscrollBehavior: "contain" });
    row.addEventListener("pointerdown", (event) => {
      event.stopPropagation();

      if (event.target === row || event.target === list) props.onClose();
    });
    const list = doc.createElement("div");
    setStyles(list, { display: "flex", alignItems: "flex-start", gap: "32px", width: "max-content", padding: "0 32px 40px", margin: "0 auto", boxSizing: "border-box" });
    row.append(list);
    stage.append(controls, row);
    props.host.append(stage);

    const frames = new Map<number, HTMLIFrameElement>();
    const sections = new Map<number, HTMLElement>();
    const guards = new Map<number, () => void>();
    const keyHandlers = new Map<number, (event: KeyboardEvent) => void>();
    const frameLoads = new Map<number, (event: Event) => void>();
    const childWheels = new Map<number, (event: WheelEvent) => void>();
    const childPresses = new Map<number, () => void>();
    const childAltKeyups = new Map<number, (event: KeyboardEvent) => void>();
    const previewGuideLayers = new Map<number, ReturnType<typeof mountPreviewGuides>>();
    const layoutGuideClones = new Map<number, HTMLElement>();
    const layoutGuideObservers = new Map<number, MutationObserver>();
    let activePreviewId: number | undefined;
    const rootLayoutGuides = props.host.querySelector<HTMLElement>("[data-mesurer-layout-guides-root]");
    const oldLayoutGuideVisibility = rootLayoutGuides?.style.visibility ?? "";

    if (rootLayoutGuides) rootLayoutGuides.style.visibility = "hidden";

    const onGuidesActive = (event: Event) => {
      // SAFETY: this listener receives only the internal preview-guide activation event with a numeric preview id.
      activePreviewId = (event as CustomEvent<number>).detail;
    };

    const onGuideDelete = () => {
      if (activePreviewId === undefined) return;
      previewGuideLayers.get(activePreviewId)?.removeSelected();
    };

    win.addEventListener("mesurer:responsive-preview-guides-active", onGuidesActive);
    win.addEventListener("mesurer:responsive-delete-selected-guides", onGuideDelete);
    let fitScale = 1;
    const persist = () => { savedPreviews = previews; savedZoom = zoom; savedKey = key; };

    const layout = () => {
      const maxWidth = Math.max(...previews.map((item) => item.width));
      const maxHeight = Math.max(...previews.map((item) => item.height));
      fitScale = Math.min(1, Math.max(0, win.innerWidth - 64) / maxWidth,
        Math.max(0, win.innerHeight - 72 - 36 - 12 - HEADER_HEIGHT - 40) / maxHeight);
      const scale = zoom ?? fitScale;
      zoomSelect.value = zoom === null ? "fit" : String(zoom);

      for (const item of previews) {
        const section = sections.get(item.id);
        const frame = frames.get(item.id);

        if (!section || !frame) continue;
        section.style.order = String(previews.findIndex((candidate) => candidate.id === item.id));
        const shell = section.querySelector<HTMLElement>("[data-mesurer-responsive-shell]");
        const header = section.querySelector<HTMLElement>("[data-mesurer-responsive-header]");
        const frameWrap = section.querySelector<HTMLElement>("[data-mesurer-responsive-frame-wrap]");

        if (shell) { shell.style.width = `${Math.max(item.width * scale, 360)}px`; }

        if (header) header.style.width = `${Math.max(item.width * scale, 360)}px`;

        if (frameWrap) { frameWrap.style.width = `${item.width * scale}px`; frameWrap.style.height = `${item.height * scale}px`; }

        frame.width = String(item.width);
        frame.height = String(item.height);
        frame.style.width = `${item.width}px`;
        frame.style.height = `${item.height}px`;
        frame.style.transform = `scale(${scale})`;
        previewGuideLayers.get(item.id)?.sync();
        const projectedLayout = layoutGuideClones.get(item.id);

        if (projectedLayout) {
          projectedLayout.style.width = `${item.width}px`;
          projectedLayout.style.height = `${item.height}px`;
          projectedLayout.style.transform = `scale(${scale})`;
        }

        const widthInput = section.querySelector<HTMLInputElement>("[data-responsive-width]");
        const heightInput = section.querySelector<HTMLInputElement>("[data-responsive-height]");

        if (widthInput && doc.activeElement !== widthInput) widthInput.value = String(item.width);

        if (heightInput && doc.activeElement !== heightInput) heightInput.value = String(item.height);
        const dims = section.querySelector<HTMLElement>("[data-responsive-dimensions]");

        if (dims) dims.textContent = `${item.width} × ${item.height}`;
        const removeButton = section.querySelector<HTMLButtonElement>('[aria-label="Remove preview"]');

        if (removeButton) removeButton.disabled = previews.length <= 1;
      }

      preset.disabled = previews.length >= MAX_PREVIEWS;
      win.dispatchEvent(new CustomEvent("mesurer:responsive-stage-change"));
    };

    const removePreview = (id: number) => {
      if (previews.length <= 1) return;
      const frame = frames.get(id);

      props.onPreviewRemove();

      let oldDoc: Document | null = null;

      try { oldDoc = frame?.contentDocument ?? null; } catch { /* A navigated frame may be cross-origin. */ }

      const keyHandler = keyHandlers.get(id);

      if (oldDoc && keyHandler) oldDoc.removeEventListener("keydown", keyHandler, true);
      const loadHandler = frameLoads.get(id);

      if (frame && loadHandler) frame.removeEventListener("load", loadHandler);

      if (oldDoc) {
        const wheelHandler = childWheels.get(id);
        const pressHandler = childPresses.get(id);
        const altKeyup = childAltKeyups.get(id);

        if (wheelHandler) oldDoc.removeEventListener("wheel", wheelHandler);

        if (pressHandler) oldDoc.removeEventListener("pointerdown", pressHandler, true);

        if (altKeyup) oldDoc.removeEventListener("keyup", altKeyup, true);
      }

      try { guards.get(id)?.(); } catch { /* A navigated cross-origin frame may reject guard restoration. */ }

      guards.delete(id);
      previewGuideLayers.get(id)?.dispose();
      previewGuideLayers.delete(id);
      layoutGuideObservers.get(id)?.disconnect();
      layoutGuideObservers.delete(id);
      layoutGuideClones.get(id)?.remove();
      layoutGuideClones.delete(id);

      if (frame) frame.remove();
      sections.get(id)?.remove();
      frames.delete(id); sections.delete(id); keyHandlers.delete(id); frameLoads.delete(id);
      childWheels.delete(id); childPresses.delete(id);
      childAltKeyups.delete(id);
      previews = previews.filter((item) => item.id !== id);
      persist(); layout();
      win.dispatchEvent(new CustomEvent("mesurer:responsive-stage-change"));
    };

    const makePreview = (item: Preview) => {
      const section = doc.createElement("section");
      section.dataset.preview = String(item.id);
      section.setAttribute("aria-label", `${item.name}, ${item.width} × ${item.height}`);
      setStyles(section, { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: "0", position: "relative" });
      const header = doc.createElement("header");
      header.dataset.mesurerResponsiveHeader = "true";
      setStyles(header, { height: "40px", minHeight: "40px", display: "flex", alignItems: "center", gap: "4px", padding: "0 5px", boxSizing: "border-box", borderRadius: "8px", background: "var(--msr-surface, #fff)", boxShadow: "var(--msr-shadow-floating)", fontSize: "11px" });
      const name = doc.createElement("span");
      name.textContent = item.name;
      setStyles(name, { flex: "1", minWidth: "0", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", paddingLeft: "4px" });
      const dimensions = doc.createElement("span");
      dimensions.dataset.responsiveDimensions = "";
      setStyles(dimensions, { flexShrink: "0", whiteSpace: "nowrap", fontSize: "9px", color: "var(--msr-color-ink-500, #737373)" });
      dimensions.textContent = `${item.width} × ${item.height}`;
      const widthInput = doc.createElement("input");
      widthInput.type = "number"; widthInput.min = String(MIN_SIZE); widthInput.max = String(MAX_SIZE); widthInput.value = String(item.width);
      widthInput.setAttribute("aria-label", "Width"); widthInput.dataset.responsiveWidth = "";
      const heightInput = doc.createElement("input");
      heightInput.type = "number"; heightInput.min = String(MIN_SIZE); heightInput.max = String(MAX_SIZE); heightInput.value = String(item.height);
      heightInput.setAttribute("aria-label", "Height"); heightInput.dataset.responsiveHeight = "";

      for (const input of [widthInput, heightInput]) setStyles(input, { width: "34px", height: "24px", boxSizing: "border-box", border: "1px solid var(--msr-color-ink-200, #ddd)", borderRadius: "4px", background: "var(--msr-surface-raised, #fff)", color: "inherit", font: "inherit", padding: "2px 2px" });

      const sizeSelect = doc.createElement("select");
      sizeSelect.setAttribute("aria-label", "Size");
      setStyles(sizeSelect, { width: "60px", minWidth: "56px", height: "24px", border: "0", borderRadius: "4px", color: "inherit", background: "transparent", font: "inherit" });
      sizeSelect.add(new Option("Custom", ""));

      for (const choice of [...DEVICES, ...breakpoints(doc).map((width) => ({ name: `${clamp(width)}px breakpoint`, width: clamp(width), height: item.height }))]) {
        sizeSelect.add(new Option(choice.name, `${choice.width}x${choice.height}`));
      }

      const syncSizeChoice = () => {
        const device = DEVICES.find((candidate) => candidate.width === item.width && candidate.height === item.height);

        const breakpoint = [...sizeSelect.options].find((option) =>
          option.textContent?.includes("breakpoint") && Number(option.value.split("x")[0]) === item.width);

        sizeSelect.value = device
          ? `${device.width}x${device.height}`
          : breakpoint?.value ?? "";
      };

      syncSizeChoice();

      sizeSelect.addEventListener("change", () => {
        const selected = sizeSelect.selectedOptions[0];

        if (!selected?.value) return;
        const [width, presetHeight] = selected.value.split("x").map(Number);
        const isBreakpoint = selected.textContent?.includes("breakpoint") ?? false;
        item.width = clamp(width);

        if (!isBreakpoint) item.height = clamp(presetHeight);
        item.name = isBreakpoint ? `${item.width}px breakpoint` :
          (DEVICES.find((device) => device.width === item.width && device.height === item.height)?.name ?? "Custom");
        name.textContent = item.name;
        section.setAttribute("aria-label", `${item.name}, ${item.width} × ${item.height}`);
        persist();
        layout();
      });

      const updateSize = () => {
        item.width = clamp(Number(widthInput.value)); item.height = clamp(Number(heightInput.value));
        item.name = DEVICES.find((device) => device.width === item.width && device.height === item.height)?.name ?? "Custom";
        widthInput.value = String(item.width); heightInput.value = String(item.height);
        name.textContent = item.name;
        section.setAttribute("aria-label", `${item.name}, ${item.width} × ${item.height}`);
        syncSizeChoice();
        persist(); layout();
      };

      widthInput.addEventListener("change", updateSize); heightInput.addEventListener("change", updateSize);
      const drag = iconButton(doc, "Drag preview to reorder", "⠿", () => undefined);
      setStyles(drag, { cursor: "grab", touchAction: "none" });
      drag.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.setPointerCapture(event.pointerId);

        const update = (moveEvent: PointerEvent) => {
          const to = [...sections.entries()]
            .filter(([id]) => id !== item.id)
            .filter(([, other]) => {
              const rect = other.getBoundingClientRect();

              return rect.left + rect.width / 2 < moveEvent.clientX;
            })
            .length;

          moveTo(item.id, to);
        };

        const finish = () => {
          drag.removeEventListener("pointermove", update);
          drag.removeEventListener("pointerup", finish);
          drag.removeEventListener("pointercancel", finish);
        };

        drag.addEventListener("pointermove", update);
        drag.addEventListener("pointerup", finish);
        drag.addEventListener("pointercancel", finish);
      });

      const moveLeft = iconButton(doc, "Move preview left", "←", () => move(item.id, -1));
      const moveRight = iconButton(doc, "Move preview right", "→", () => move(item.id, 1));
      moveLeft.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") move(item.id, -1); });
      moveRight.addEventListener("keydown", (event) => { if (event.key === "ArrowRight") move(item.id, 1); });
      const remove = iconButton(doc, "Remove preview", "×", () => removePreview(item.id));
      remove.disabled = previews.length <= 1;
      const shell = doc.createElement("div");
      shell.dataset.mesurerResponsiveShell = "";
      shell.dataset.mesurerResponsiveCard = "true";
      setStyles(shell, { position: "relative", borderRadius: "8px", overflow: "hidden", boxShadow: "var(--msr-shadow-floating)", background: "white" });
      const frameWrap = doc.createElement("div");
      frameWrap.dataset.mesurerResponsiveFrameWrap = "";
      setStyles(frameWrap, { position: "relative", overflow: "hidden" });
      const frame = doc.createElement("iframe");
      frame.dataset.mesurerResponsiveFrame = "true";
      frame.dataset.mesurerResponsivePreviewId = String(item.id);
      frame.title = `${item.name} preview`;
      frame.setAttribute("sandbox", RESPONSIVE_FRAME_SANDBOX);
      frame.src = win.location.href;
      setStyles(frame, { display: "block", border: "0", transformOrigin: "top left", background: "white" });
      const status = doc.createElement("div");
      status.setAttribute("role", "status"); status.textContent = "Loading preview…";
      setStyles(status, { position: "absolute", inset: "0", zIndex: "2", display: "grid", placeItems: "center", padding: "16px", boxSizing: "border-box", background: "var(--msr-surface-raised, white)", fontSize: "12px", textAlign: "center", pointerEvents: "none" });

      const onLoad = () => {
        try {
          const previousDocument = frame.contentDocument;
          const previousKeyHandler = keyHandlers.get(item.id);
          const previousAltKeyup = childAltKeyups.get(item.id);
          const previousWheel = childWheels.get(item.id);
          const previousPress = childPresses.get(item.id);

          if (previousDocument && previousKeyHandler) previousDocument.removeEventListener("keydown", previousKeyHandler, true);

          if (previousDocument && previousAltKeyup) previousDocument.removeEventListener("keyup", previousAltKeyup, true);

          if (previousDocument && previousWheel) previousDocument.removeEventListener("wheel", previousWheel);

          if (previousDocument && previousPress) previousDocument.removeEventListener("pointerdown", previousPress, true);
        } catch { /* A navigation can replace the old frame document before cleanup runs. */ }

        previewGuideLayers.get(item.id)?.dispose();
        previewGuideLayers.delete(item.id);
        layoutGuideObservers.get(item.id)?.disconnect();
        layoutGuideObservers.delete(item.id);
        layoutGuideClones.get(item.id)?.remove();
        layoutGuideClones.delete(item.id);

        try {
          const child = frame.contentWindow;
          const childDoc = frame.contentDocument;

          if (!child || !childDoc?.documentElement || child.location.origin !== win.location.origin || child.location.href === "about:blank") throw new Error("unavailable");
          guards.get(item.id)?.();
          guards.set(item.id, installPreviewGuard(child));

          const handler = (event: KeyboardEvent) => {
            if (event.key === "Alt") {
              win.dispatchEvent(new CustomEvent("mesurer:responsive-guide-alt", { detail: true }));

              return;
            }

            if (event.metaKey || event.ctrlKey || event.altKey) return;

            if (event.key === "Escape") {
              if (isEditableKeyboardEvent(event, child)) return;
              event.preventDefault();
              event.stopImmediatePropagation();
              doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

              return;
            }

            if ((event.key === "Delete" || event.key === "Backspace")
              && props.guidesActive()
              && !isEditableKeyboardEvent(event, child)) {
              win.dispatchEvent(new CustomEvent("mesurer:responsive-delete-selected-guides", { detail: item.id }));
              event.preventDefault();
              event.stopImmediatePropagation();

              return;
            }

            if (event.key.toLowerCase() !== "b" || !props.shortcutsEnabled || isEditableKeyboardEvent(event, child)) return;
            event.preventDefault(); event.stopImmediatePropagation();

 if (!event.repeat) props.onClose();
          };

          keyHandlers.set(item.id, handler);
          childDoc.addEventListener("keydown", handler, true);

          const altKeyup = (event: KeyboardEvent) => {
            if (event.key === "Alt") win.dispatchEvent(new CustomEvent("mesurer:responsive-guide-alt", { detail: false }));
          };

          childAltKeyups.set(item.id, altKeyup);
          childDoc.addEventListener("keyup", altKeyup, true);
          const wheelHandler = (event: WheelEvent) => routeFrameWheel(event, frame);

          const pressHandler = () => {
            activePreviewId = item.id;
            win.dispatchEvent(new CustomEvent("mesurer:responsive-frame-pointerdown"));
          };

          childWheels.set(item.id, wheelHandler);
          childPresses.set(item.id, pressHandler);
          childDoc.addEventListener("wheel", wheelHandler, { passive: false });
          childDoc.addEventListener("pointerdown", pressHandler, true);
          status.style.display = "none";

          const guideLayer = mountPreviewGuides({
            document: doc,
            frame,
            previewId: item.id,
            parent: frameWrap,
            size: () => ({ width: item.width, height: item.height }),
            scale: () => zoom ?? fitScale,
            getGuides: () => item.guides ?? [],
            setGuides: (guides) => { item.guides = guides; persist(); },
            active: props.guidesActive,
            orientation: props.guideOrientation,
            altPressed: props.altPressed,
            hostWindow: win,
            color: props.guideColor,
            style: props.guideStyle,
            snapGuidesEnabled: props.snapGuidesEnabled,
          });

          previewGuideLayers.set(item.id, guideLayer);

          const syncLayoutGuides = () => {
            const source = props.host.querySelector<HTMLElement>(
              "[data-mesurer-layout-guides-root] [data-mesurer-layout-guides]",
            );

            layoutGuideClones.get(item.id)?.remove();

            if (!source) {
              layoutGuideClones.delete(item.id);

              return;
            }

            // SAFETY: source is narrowed to HTMLElement by querySelector and cloneNode preserves its element node type.
            const clone = source.cloneNode(true) as HTMLElement;
            clone.dataset.mesurerResponsiveLayoutGuides = String(item.id);
            Object.assign(clone.style, {
              inset: "0 auto auto 0",
              width: `${item.width}px`,
              height: `${item.height}px`,
              transform: `scale(${zoom ?? fitScale})`,
              transformOrigin: "top left",
              zIndex: "3",
            });
            frameWrap.append(clone);
            layoutGuideClones.set(item.id, clone);
          };

          syncLayoutGuides();
          const sourceRoot = props.host.querySelector("[data-mesurer-layout-guides-root]");
          const observer = new MutationObserver(syncLayoutGuides);
          observer.observe(props.host, { childList: true });

          if (sourceRoot) {
            observer.observe(sourceRoot, { attributes: true, childList: true, characterData: true, subtree: true });
          }

          layoutGuideObservers.set(item.id, observer);

          win.dispatchEvent(new CustomEvent("mesurer:responsive-preview-ready"));
        } catch {
          status.textContent = "This page cannot be previewed in a same-origin frame.";
          status.dataset.mesurerResponsiveRefused = "true";
          status.style.display = "grid";
        }

        win.dispatchEvent(new CustomEvent("mesurer:responsive-stage-change"));
      };

      frameLoads.set(item.id, onLoad); frame.addEventListener("load", onLoad);
      frame.addEventListener("pointerdown", () => win.dispatchEvent(new CustomEvent("mesurer:responsive-frame-pointerdown")));
      frameWrap.append(frame, status);
      shell.append(frameWrap);
      header.append(drag, moveLeft, moveRight, name, sizeSelect, dimensions, widthInput, doc.createTextNode("×"), heightInput, remove);
      section.append(header, shell);
      section.addEventListener("pointerdown", (event) => event.stopPropagation());
      section.addEventListener("click", (event) => { event.stopPropagation(); win.dispatchEvent(new CustomEvent("mesurer:responsive-frame-pointerdown")); });

      const addResizeGrip = (axis: "width" | "height" | "both", label: string) => {
        const grip = doc.createElement("div");
        grip.setAttribute("role", "separator");
        grip.setAttribute("aria-label", label);
        grip.tabIndex = 0;
        setStyles(grip, {
          position: "absolute", zIndex: "2", touchAction: "none", cursor: axis === "width" ? "ew-resize" : axis === "height" ? "ns-resize" : "nwse-resize",
          ...(axis === "width" ? { right: "-8px", top: "48px", bottom: "8px", width: "16px" } :
            axis === "height" ? { left: "0", right: "0", bottom: "-8px", height: "16px" } :
              { right: "-8px", bottom: "-8px", width: "16px", height: "16px" }),
        });
        grip.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const startX = event.clientX;
          const startY = event.clientY;
          const startWidth = item.width;
          const startHeight = item.height;
          const scale = zoom ?? fitScale;
          grip.setPointerCapture(event.pointerId);

          const update = (moveEvent: PointerEvent) => {
            if (axis !== "height") item.width = clamp(startWidth + (moveEvent.clientX - startX) / scale);

            if (axis !== "width") item.height = clamp(startHeight + (moveEvent.clientY - startY) / scale);
            item.name = DEVICES.find((device) => device.width === item.width && device.height === item.height)?.name ?? "Custom";
            name.textContent = item.name;
            section.setAttribute("aria-label", `${item.name}, ${item.width} × ${item.height}`);
            syncSizeChoice();
            persist();
            layout();
          };

          const finish = () => {
            grip.removeEventListener("pointermove", update);
            grip.removeEventListener("pointerup", finish);
            grip.removeEventListener("pointercancel", finish);
          };

          grip.addEventListener("pointermove", update);
          grip.addEventListener("pointerup", finish);
          grip.addEventListener("pointercancel", finish);
        });
        grip.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;

          if (axis !== "height" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) item.width = clamp(item.width + (event.key === "ArrowRight" ? step : -step));

          if (axis !== "width" && (event.key === "ArrowUp" || event.key === "ArrowDown")) item.height = clamp(item.height + (event.key === "ArrowDown" ? step : -step));
          item.name = DEVICES.find((device) => device.width === item.width && device.height === item.height)?.name ?? "Custom";
          name.textContent = item.name;
          section.setAttribute("aria-label", `${item.name}, ${item.width} × ${item.height}`);
          syncSizeChoice();
          persist();
          layout();
        });
        section.append(grip);
      };

      addResizeGrip("width", "Resize width edge");
      addResizeGrip("height", "Resize height edge");
      addResizeGrip("both", "Resize width and height");

      frames.set(item.id, frame); sections.set(item.id, section);

      return section;
    };

    const move = (id: number, delta: number) => {
      const from = previews.findIndex((item) => item.id === id);
      const to = Math.max(0, Math.min(previews.length - 1, from + delta));

      if (to === from) return;
      moveTo(id, to);
    };

    const moveTo = (id: number, target: number) => {
      const from = previews.findIndex((item) => item.id === id);
      const to = Math.max(0, Math.min(previews.length - 1, target));

      if (from < 0 || to === from) return;
      const [item] = previews.splice(from, 1);
      previews.splice(to, 0, item);
      persist(); layout();
    };

    const renderPreviews = () => {
      const desired = new Set(previews.map((item) => item.id));

      for (const [id] of sections) if (!desired.has(id)) removePreview(id);

      for (const item of previews) {
        if (!sections.has(item.id)) list.append(makePreview(item));
      }

      layout();
    };

    const hasRoom = (element: Element, delta: number) => delta < 0 ? element.scrollLeft > 0 : element.scrollLeft < element.scrollWidth - element.clientWidth - 1;

    const routeFrameWheel = (event: WheelEvent, frame: HTMLIFrameElement) => {
      if (event.ctrlKey) return;
      const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
      const delta = axis === "x" ? event.deltaX : event.deltaY;

      if (!delta) return;
      event.preventDefault();

      if (axis === "x" && hasRoom(row, delta)) { row.scrollBy({ left: delta, behavior: "instant" });

 return; }

      const childDoc = frame.contentDocument;
      const scale = frame.getBoundingClientRect().width / (frame.offsetWidth || 1) || 1;

      const wheelTarget = event.target;
      const ChildElement = childDoc?.defaultView?.Element;

      let target: Element | null = ChildElement && wheelTarget instanceof ChildElement
        ? wheelTarget
        : childDoc?.scrollingElement ?? null;

      while (target && target !== childDoc?.scrollingElement) {
        const style = frame.contentWindow?.getComputedStyle(target);
        const canScroll = axis === "x" ? /auto|scroll/.test(style?.overflowX ?? "") : /auto|scroll/.test(style?.overflowY ?? "");
        const position = axis === "x" ? target.scrollLeft : target.scrollTop;
        const extent = axis === "x" ? target.scrollWidth - target.clientWidth : target.scrollHeight - target.clientHeight;

        if (canScroll && (delta < 0 ? position > 0 : position < extent - 1)) break;
        target = target.parentElement;
      }

      const body = target ?? childDoc?.scrollingElement;
      const position = axis === "x" ? body?.scrollLeft ?? 0 : body?.scrollTop ?? 0;

      const extent = axis === "x" ? (body?.scrollWidth ?? 0) - (body?.clientWidth ?? 0)
        : (body?.scrollHeight ?? 0) - (body?.clientHeight ?? 0);

      const canScroll = body && (delta < 0 ? position > 0 : position < extent - 1);

      if (canScroll) body.scrollBy({ [axis === "x" ? "left" : "top"]: delta / scale, behavior: "instant" });
      else if (hasRoom(row, delta)) row.scrollBy({ left: delta, behavior: "instant" });
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      if (frames.size && [...frames.values()].some((frame) => {
        const rect = frame.getBoundingClientRect();

        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      })) return;
      const delta = event.deltaX || event.deltaY;

      if (delta) {
        event.preventDefault();

        if (hasRoom(row, delta)) row.scrollBy({ left: delta, behavior: "instant" });
      }
    };

    stage.addEventListener("wheel", onWheel, { passive: false, capture: true });
    const onResize = () => layout();
    win.addEventListener("resize", onResize);
    renderPreviews();
    const previousOverflowX = doc.documentElement.style.getPropertyValue("overflow-x");
    const previousOverflowXPriority = doc.documentElement.style.getPropertyPriority("overflow-x");
    const previousOverflowY = doc.documentElement.style.getPropertyValue("overflow-y");
    const previousOverflowYPriority = doc.documentElement.style.getPropertyPriority("overflow-y");
    doc.documentElement.style.setProperty("overflow-x", "hidden", "important");
    doc.documentElement.style.setProperty("overflow-y", "hidden", "important");
    win.dispatchEvent(new CustomEvent("mesurer:responsive-stage-change"));

    return () => {
      unsubscribePageKey();

      try {
        win.removeEventListener("resize", onResize);
        stage.removeEventListener("wheel", onWheel);

        for (const [id, frame] of frames) {
          previewGuideLayers.get(id)?.dispose();
          layoutGuideObservers.get(id)?.disconnect();
          layoutGuideClones.get(id)?.remove();

          try {
            const childDoc = frame.contentDocument;
            const handler = keyHandlers.get(id);

            if (childDoc && handler) childDoc.removeEventListener("keydown", handler, true);

            if (childDoc) {
              const wheelHandler = childWheels.get(id);
              const pressHandler = childPresses.get(id);
              const altKeyup = childAltKeyups.get(id);

              if (wheelHandler) childDoc.removeEventListener("wheel", wheelHandler);

              if (pressHandler) childDoc.removeEventListener("pointerdown", pressHandler, true);

              if (altKeyup) childDoc.removeEventListener("keyup", altKeyup, true);
            }
          } catch { /* A navigated cross-origin frame no longer exposes its document. */ }

          try {
            const loadHandler = frameLoads.get(id);

            if (loadHandler) frame.removeEventListener("load", loadHandler);
          } catch { /* Frame teardown must continue even if it became inaccessible. */ }

          try { guards.get(id)?.(); } catch { /* Guard restoration may lose same-origin access after navigation. */ }
        }

        guards.clear();
        win.removeEventListener("mesurer:responsive-preview-guides-active", onGuidesActive);
        win.removeEventListener("mesurer:responsive-delete-selected-guides", onGuideDelete);
        previewGuideLayers.clear();
        layoutGuideObservers.clear();
        layoutGuideClones.clear();
        frameLoads.clear();
        keyHandlers.clear();
        childWheels.clear();
        childPresses.clear();
        childAltKeyups.clear();
        frames.clear();
        sections.clear();
      } finally {
        stage.remove();

        try {
          win.dispatchEvent(new CustomEvent("mesurer:responsive-stage-change"));
        } finally {
          if (rootLayoutGuides) rootLayoutGuides.style.visibility = oldLayoutGuideVisibility;
          const style = doc.documentElement.style;

          if (style.getPropertyValue("overflow-x") === "hidden" && style.getPropertyPriority("overflow-x") === "important") {
            if (previousOverflowX) style.setProperty("overflow-x", previousOverflowX, previousOverflowXPriority);
            else style.removeProperty("overflow-x");
          }

          if (style.getPropertyValue("overflow-y") === "hidden" && style.getPropertyPriority("overflow-y") === "important") {
            if (previousOverflowY) style.setProperty("overflow-y", previousOverflowY, previousOverflowYPriority);
            else style.removeProperty("overflow-y");
          }
        }
      }
    };
  });

  return null;
}
