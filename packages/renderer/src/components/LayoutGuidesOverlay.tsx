import { For, Show } from "solid-js";
import type { LayoutGuide } from "../core/layout-guides";

type LayoutGuidesOverlayProps = {
  guides: LayoutGuide[];
};

const fillFor = (guide: LayoutGuide) =>
  `color-mix(in srgb, ${guide.color} ${guide.opacity * 100}%, transparent)`;

const pack = (align: LayoutGuide["align"]) =>
  align === "max" ? "end" : align === "center" ? "center" : "start";

const axisStyle = (guide: LayoutGuide) => {
  const columns = guide.kind === "columns";
  const stretch = guide.align === "stretch";

  const template = stretch
    ? `repeat(${guide.count}, minmax(0, 1fr))`
    : `repeat(${guide.count}, ${guide.size}px)`;

  const packed = pack(guide.align);

  const base = {
    position: "absolute",
    inset: "0",
    display: "grid",
  } as const;

  return {
    ...base,
    ...(columns
      ? {
          "grid-template-columns": template,
          "column-gap": `${guide.gutter}px`,
          "justify-content": stretch ? undefined : packed,
          "padding-left": stretch || guide.align === "min" ? `${guide.offset}px` : "0",
          "padding-right": stretch || guide.align === "max" ? `${guide.offset}px` : "0",
        }
      : {
          "grid-template-rows": template,
          "row-gap": `${guide.gutter}px`,
          "align-content": stretch ? undefined : packed,
          "padding-top": stretch || guide.align === "min" ? `${guide.offset}px` : "0",
          "padding-bottom": stretch || guide.align === "max" ? `${guide.offset}px` : "0",
        }),
    transform: guide.align === "center"
      ? columns
        ? `translateX(${guide.offset}px)`
        : `translateY(${guide.offset}px)`
      : undefined,
  };
};

export function LayoutGuidesOverlay(props: LayoutGuidesOverlayProps) {
  const visible = () => props.guides.filter((guide) => guide.visible);

  return (
    <Show when={visible().length > 0}>
      <div
        data-mesurer-layout-guides="true"
        data-mesurer-layer="evidence"
        class="msr:pointer-events-none msr:absolute msr:inset-0 msr:overflow-hidden"
        style={{ "z-index": "2" }}
        aria-hidden="true"
      >
        <For each={visible()}>{(guide) => (
          <Show
            when={guide.kind === "grid"}
            fallback={
              <div
                data-mesurer-layout-guide={guide.id}
                data-mesurer-layout-guide-kind={guide.kind}
                class="msr:pointer-events-none msr:absolute msr:inset-0"
                style={axisStyle(guide)}
              >
                <For each={Array.from({ length: guide.count })}>{() => (
                  <div
                    data-mesurer-layout-band="true"
                    style={{
                      "min-width": "0",
                      "min-height": "0",
                      width: "100%",
                      height: "100%",
                      "background-color": fillFor(guide),
                    }}
                  />
                )}</For>
              </div>
            }
          >
            <div
              data-mesurer-layout-guide={guide.id}
              data-mesurer-layout-guide-kind="grid"
              class="msr:pointer-events-none msr:absolute msr:inset-0"
              style={{
                "background-image": `linear-gradient(to right, ${fillFor(guide)} 1px, transparent 1px), linear-gradient(to bottom, ${fillFor(guide)} 1px, transparent 1px)`,
                "background-size": `${guide.size}px ${guide.size}px`,
              }}
            />
          </Show>
        )}</For>
      </div>
    </Show>
  );
}
