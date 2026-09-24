# Layout Guides

Layout Guides are optional page-layout evidence: columns, rows, or a pixel grid that a person can place over the rendered page without changing application source.

Mount the first-party plugin from the unified plugins entry:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, layoutGuides } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  plugins: [context(), layoutGuides()],
})
```

The toolbar shows **Layout guides** with the `L` shortcut while the plugin is enabled. Opening it on a page with no saved guides creates the default five-column guide. Dismissing the editor panel leaves the active guides visible. Pressing the active toolbar control turns Layout Guides off without deleting the saved guide set.

## Guide types

- **Columns** divide the viewport into repeated vertical bands.
- **Rows** divide it into repeated horizontal bands.
- **Grid** draws a repeating pixel grid.

Columns and rows support count, gutter, offset, alignment, color, and opacity. Fixed alignment also exposes the band width or height. Grid exposes cell size, color, and opacity.

Layout Guides are inspection evidence only. They do not write CSS, resize page elements, or imply how application source should implement a layout.

## Page ownership

Layout Guides are page-scoped. The default page key is the pathname plus sorted query parameters. Hash routes beginning with `#/` are included as well.

Navigating from one route to another swaps the active Layout Guide set instead of carrying one page's overlay into another page. Returning to the original route restores its saved set when persistence is enabled.

Toolbar placement is different: it is tab-session UI and remains where the user dragged it across route changes and reloads. Do not store toolbar placement inside a page workspace.

## Typed service

Resolve plugin-owned operations through the mounted service seam:

```ts
import {
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
  type MesurerLayoutGuidesService,
} from "mesurer-solid/plugins"

const guides = await mesurer.service<MesurerLayoutGuidesService>(
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
)

const columns = await guides.add({
  kind: "columns",
  count: 12,
  gutter: 24,
  color: "#ff0000",
  opacity: 0.1,
})

await guides.update(columns.id, { visible: false })
await guides.remove(columns.id)
```

The service exposes `list()`, `add()`, `update()`, `remove()`, `clear()`, and `subscribe()`.

Mutating service methods use the same JSON-safe plugin commands as generic automation. That keeps one mutation path and makes Layout Guide edits participate in plugin undo/redo rather than creating a second history model.

## Context

When Context and Layout Guides are both enabled, Context reads the service at capture time and includes the current page's saved guides, including each guide's `visible` flag, in:

```ts
context.visualContext.layoutGuides
```

Context does not require Layout Guides to load first. If the plugin is absent, the array is empty.

This keeps the two plugins independently removable while still making visible layout intent available to coding agents.

## Architecture

Layout Guides are a plugin because their state, toolbar action, editor panel, persistence, and overlay are optional feature behavior. Framework-neutral normalization and geometry live in renderer core; plugin lifecycle and presentation remain outside the base renderer model.

The public mount does not grow separate `addLayoutGuide()`, `updateLayoutGuide()`, and similar methods. Optional runtime capabilities stay behind `service<T>()`, matching the same interface used by other first-party plugins.
