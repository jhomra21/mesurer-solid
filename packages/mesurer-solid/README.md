# @jhomra21/mesurer-solid

Mesurer for Solid 2: an in-page measurement/devtools overlay with selection bounds, guides, rulers, typography inspection, X-ray, EyeDropper color picking, distance overlays, undo/redo, settings and persistence.

## Install

```bash
bun add @jhomra21/mesurer-solid
```

Solid 2 RC is currently a peer dependency:

```text
solid-js >= 2.0.0-rc.0
@solidjs/web >= 2.0.0-rc.0
```

## Use

```tsx
import { Measurer } from "@jhomra21/mesurer-solid";

export function App() {
  return (
    <>
      <YourApp />
      <Measurer />
    </>
  );
}
```

Styles are injected automatically. `@jhomra21/mesurer-solid/styles.css` is also exported if you prefer to include the stylesheet explicitly.

## Features

- **Select** — click, Shift-click, or drag over elements; visualizes bounds, padding and margin.
- **Guides** — horizontal/vertical guides, snapping, multi-select, drag and delete.
- **Rulers** — pixel rulers with drag-to-create guides.
- **Text Inspector** — computed typography, CSS variable discovery, pinned/dragged inspector cards, own undo/redo history.
- **X-ray** — outline page structure without outlining Mesurer itself.
- **Color picker** — native `EyeDropper` with HEX/RGB/HSL/OKLCH output and clipboard copy.
- **Distances** — hold Alt between a selected target/guide and the hovered target; click to keep a distance.
- **History** — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
- **Settings** — selection, guides, rulers, color formats and persistence.
- **Persistence** — localStorage by default, custom adapter supported, cross-tab subscription supported.
- **Shadow DOM** — `portalTarget` accepts `HTMLElement | ShadowRoot`.

## Shortcuts

| Key | Action |
| --- | --- |
| `M` | Toggle Mesurer |
| `S` | Select |
| `A` | Text Inspector |
| `P` | Color picker |
| `G` | Guides |
| `X` | X-ray |
| `R` | Rulers |
| `H` / `V` | Guide orientation |
| `Alt` | Distance overlays |
| `Escape` | Clear guides/measurements |
| `Backspace` / `Delete` | Remove selected guides |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+,` | Settings |

## Props

```ts
type MeasurerProps = {
  highlightColor?: string;
  guideColor?: string;
  hoverHighlightEnabled?: boolean;
  persistOnReload?: boolean;
  persistKey?: string;
  portalTarget?: HTMLElement | ShadowRoot;
  persistence?: MesurerPersistence;
  onPersistenceError?: (error: unknown) => void;
  colorPickerFormats?: Array<"hex" | "rgb" | "hsl" | "oklch">;
  colorPickerClickFormat?: "hex" | "rgb" | "hsl" | "oklch";
  snapEnabled?: boolean;
  snapGuidesEnabled?: boolean;
  selectNewGuideEnabled?: boolean;
  multiMeasureEnabled?: boolean;
  guideStyle?: Partial<GuideStyle>;
  rulerSettings?: Partial<RulerSettings>;
};
```

## Solid 2 notes

This implementation does not depend on Solid 1 synchronous setter behavior. User actions compute against a synchronous command-side state and publish into a Solid 2 store, whose writes settle on Solid's normal schedule. The UI uses `@solidjs/web`, `onSettled`, split effects, draft stores and Solid 2 JSX conventions.

Mesurer's framework-neutral algorithms/runtime are adapted under its MIT license; see the repository's third-party notice.
