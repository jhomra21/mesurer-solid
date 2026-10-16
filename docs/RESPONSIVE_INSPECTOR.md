# Responsive inspector

Responsive opens with one iPhone 15 preview at 393 × 852 CSS pixels. Add up to six previews from the preset and breakpoint list. Each preview has independent width and height controls, removable/reorderable headers, and same-origin live iframes. Width and height are rounded and clamped to 240–3840 CSS pixels. Duplicate sizes are not added; adding a seventh distinct size replaces the last preview. Preview order changes visually without moving iframe nodes, so reordering does not reload pages.

Fit scales every preview by the same factor, using the largest viewport and the available stage space. Manual zoom levels are available from the control bar. Preview list and zoom state remain in memory for this page while Responsive closes and reopens. They reset when the page key (origin, pathname, or query) changes, and are never persisted to storage. These controls do not include Guides or Context viewport mapping in this increment.

While the stage is open, its same-origin preview is the active inspection source. Select hover, click and marquee selection, measurements, X-ray, and Typography inspect elements in the preview, including accessible nested same-origin frames. Evidence is projected into Mesurer's root overlay at the scaled preview position. The original page and the stage chrome are not inspection sources while the stage is open. Closing the stage clears preview selection and hover state.

Context annotations are intentionally unavailable for preview selections in this increment. The Add Note trigger is hidden and its toolbar command is disabled while a preview target is selected. The `context.add-note` command and annotation runtime also reject preview selections, because annotation storage and source-linked panels are page-scoped; creating one with projected root coordinates would bind it incorrectly. `window.__MESURER__` keeps its existing API and continues inspecting/selecting the root document rather than implicitly switching to the preview.

The page must allow itself to load in same-origin iframes. Cross-origin frames, `X-Frame-Options`, CSP `frame-ancestors`, and frame-busting code can prevent that. Mesurer shows a refusal message when it cannot access the loaded document; inspection then finds nothing in that refused preview.

Previews reload the live page in same-origin iframes and run its JavaScript. Requests, analytics, and other page side effects repeat for every preview that is added. Up to six live documents can consume substantial memory and network resources. The iframe sandbox suppresses some browser actions, but it is not a security boundary. Use Responsive only on pages whose scripts you are willing to run again.

The page behind the stage is scroll-locked while Responsive is open. Wheel input over the empty stage moves only the preview row; wheel input inside a frame scrolls that preview and hands horizontal movement to the row when possible. Closing Responsive restores the page's prior inline `overflow-x` and `overflow-y` values and priorities. A page-key change while the stage is open closes it and resets the in-memory preview state.

Entering Responsive exits Edit, clears the current selection, and closes the preview when Edit, Rulers, Screenshot, or Recording is activated. B is ignored by editable controls, including open Shadow DOM inputs in the preview. Turning off global shortcuts disables B without disabling Escape.

Responsive is on by default. Turn it off in **Settings > Plugins**, or omit it with `excludeBuiltins: ["responsive"]`. Press **B** to open or close it; Escape and a click on the empty stage also close it.
