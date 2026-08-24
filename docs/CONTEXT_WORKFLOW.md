# Human-in-the-loop visual context workflow

Mesurer turns browser-visible design feedback into deterministic context that a person can copy or an ACP-capable client can deliver to a coding agent.

```text
human selection / annotation
          +
Mesurer visual evidence
          |
          v
  MesurerContextV1
          |
    format once
      /      \
clipboard    ACP
```

The clipboard and ACP paths use the same context and formatter.

## Enable the feature

The context/annotation workflow is not hard-wired into the renderer or mount lifecycle. It is provided by the removable `mesurer.context` plugin.

### Source-mounted applications

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({
  plugins: [contextPlugin()],
  agent: true,
});
```

With the default `contextPlugin()` options, the visible Copy Context, Copy Selection, Add Note, annotation marker/panel UI, and context/review APIs are all enabled.

If a host wants the service and programmatic APIs without visible context controls or annotation UI, disable only the plugin UI:

```ts
const mesurer = mountMeasurer({
  plugins: [contextPlugin({ ui: false })],
  agent: true,
});
```

The plugin still provides `context:v1`; it simply does not render Copy/Add Note controls or annotation surfaces.

### Injection and browser extension

The generic `/inject` and `/inject-script` entry points install `contextPlugin()` by default because context/annotations are the intended human/agent injection workflow. The first-party browser extension uses that same injected runtime.

A harness that deliberately wants only the low-level inspector can set this before injection:

```js
window.__MESURER_CONFIG__ = { context: false };
```

### Remove it at runtime

`contextPlugin()` owns:

- annotation state and conservative HMR rebinding;
- context/review/capture behavior;
- Copy Context, Copy Selection, and Add Note UI;
- annotation markers/popovers and their shortcuts;
- optional screenshot/send callbacks;
- all listeners and cleanup for those features.

It provides the plugin-host service `context:v1`. The mounted-instance and `window.__MESURER__` convenience methods resolve that service dynamically; they do not own a second context implementation.

Removing the plugin removes the feature:

```ts
mesurer.pluginHost?.remove("mesurer.context");
console.log(mesurer.agent.capabilities().capabilities.context); // false
```

Other Mesurer tools continue running. Reloading/replacing `mesurer.context` uses the same plugin host lifecycle as other extensions.

## Context controls

When `contextPlugin()` renders its UI, the context actions live in the existing draggable Mesurer toolbar rather than in a second floating action bar. Plugin tools are rendered by the canonical toolbar button component; there is no DOM-label discovery or animation-frame polling layer.

| Action | Shortcut | Availability | Result |
| --- | --- | --- | --- |
| Copy Context | `C` | Always | Copies the current workspace context. |
| Copy Selection | `Shift+C` | When an element or dragged region is selected | Copies context scoped to the current selection. |
| Add Note | `N` | When an element or dragged region is selected | Opens the annotation composer for that selection. |
| Send selection | `Cmd/Ctrl+Enter` | Only when the plugin was configured with `sendContext` | Sends selection-scoped context through the host callback. |

Copy actions briefly flash their toolbar icon on success instead of adding a toast over page content. The context controls are inserted before Settings so Settings remains the final regular toolbar control. Keyboard shortcuts inspect the composed event path, so typing inside Mesurer inputs/textareas does not trigger page-inspection shortcuts across the Shadow DOM boundary.

## Annotation UI workflow

### One selected element

Select an element and use the small floating annotation button, **Add Note** in the toolbar, or `N`. The compact composer opens beside the selection. Saving the note creates a numbered annotation marker anchored to that target.

Click the marker later to reopen the saved note panel. The composer and saved panel are draggable by their header, and their position is clamped to the viewport so they remain usable near edges.

### Multiple selected elements

Shift-select the elements that belong to one piece of feedback. The floating annotation button initially anchors to the first selected element. Moving the pointer over another selected element moves the button to that selected target, which keeps the affordance near the part of the selection the person is currently inspecting.

The composer labels the scope with the selected-element count, for example `2 selected elements`. Saving the note stores **all** selected targets in the annotation context, not just the element where the floating button happened to be displayed. The saved panel also shows the selected-element count.

The multi-selection itself remains intact while the composer or saved note panel is dragged.

### Arbitrary dragged region

Region-only annotations remain supported when no DOM element is the right target. Drag the area in Select mode, then use **Add Note** in the toolbar or `N`.

The small floating annotation button is intentionally element-selection focused, so a region-only selection uses the toolbar/shortcut path. The saved annotation still records the requested viewport region and can be reviewed/captured later even when it has no element targets.

## Copy Context vs Copy Selection

**Copy Context** is the broad workspace handoff. Use it when an agent should understand the current visual state around the page: selected/referenced targets, relevant guides and measurements, held distances, viewport state, rulers/X-ray state, and computed DOM inspection.

**Copy Selection** is the scoped handoff. Use it after selecting one or more elements or dragging a region when the agent should receive only evidence relevant to that selected area.

The programmatic equivalents use the same formatter and data model:

```js
await window.__MESURER__.context()
await window.__MESURER__.context({ scope: "selection" })
```

## Context scopes

### Workspace

```js
await window.__MESURER__.context()
```

Captures the meaningful current workspace: selected/referenced targets, guides, measurements, held distances, viewport state, rulers/X-ray state, and computed DOM inspection.

### Selection

```js
await window.__MESURER__.context({ scope: "selection" })
```

Captures the current selected element(s) or dragged selection region plus only relevant evidence touching that scope.

### Annotation

A user selects one or more page elements **or drags an arbitrary area** and chooses **Add Note**. The plugin stores durable target identity when elements exist, the requested region, a scoped baseline, and the user's note.

```js
await window.__MESURER__.context({ annotation: annotationId })
```

The user note is intent. Computed DOM data and visual measurements are supporting evidence.

Scoped `MesurerContextV1` values expose `regions`, the viewport rectangles that define the selected/annotated area. Region-only notes therefore retain useful geometry even when `targets` is empty.

## Programmatic context, annotations, and review

The same functionality used by the toolbar is available through the mounted instance or the injected browser bridge.

```ts
const workspace = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const annotation = await mesurer.context({ annotation: annotationId });
await mesurer.copyContext({ annotation: annotationId });
const review = await mesurer.review(annotationId);
```

For injected usage, wait for plugin initialization before reading dynamic capabilities:

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
await window.__MESURER__.stable()
await window.__MESURER__.review(annotationId)
```

## Relevance rules

Context collection is deterministic rather than model-powered.

For selection/annotation scope:

- a measurement is relevant when it references a selected target or overlaps the scoped region;
- a held distance is relevant when either endpoint references a selected target or either endpoint rect overlaps the scoped region;
- a guide is relevant when it crosses/touches the scoped rect within the same tolerance used by guide snapping;
- rulers/X-ray are recorded as visual-state metadata rather than semantic instructions.

Annotation baselines use the same rules at creation time. `review()` therefore compares like-for-like scoped evidence instead of an annotation-sized current snapshot against unrelated whole-workspace history.

## Annotation rebinding after HMR

A live annotation keeps the exact `HTMLElement` while that node remains connected. Each target also records a selector, fingerprint, last viewport rect, and immutable baseline snapshot for DOM replacement.

Observation starts lazily with the first annotation and stops when the last annotation is removed. Attribute observation is limited to identity/geometry-relevant attributes rather than every host-page attribute.

After replacement, Mesurer rebinds conservatively:

- a strong `id` or `data-testid` must still match;
- weaker fingerprints require their recorded tag/classes/accessibility/text identity;
- weak matches must be unique rather than merely occupying the old `nth-of-type` position.

Missing, incompatible, or ambiguous targets remain stale instead of silently attaching a note to another component.

## Review after an agent edit

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

The review includes the original note, target status, scoped baseline evidence, fresh scoped context, and measurable before/current geometry changes. Target comparisons use immutable annotation target IDs rather than regenerated selector strings, so adding an `id`/`data-testid` during an edit does not hide a geometry change.

Relevant baseline evidence that disappears is emitted explicitly as `kind: "missing"` for targets, guides, measurements, or distances.

```text
human marks issue
  → agent reads annotation
  → agent edits source
  → normal HMR/render
  → agent waits for stability
  → Mesurer re-resolves/re-measures
  → agent checks review
  → iterate or hand back to human
```

Mesurer can prove numeric changes. It does not claim subjective feedback such as “make this feel lighter” is objectively solved.

## Screenshot evidence

Mesurer does not render a fake DOM screenshot. The browser/harness takes real pixels.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // capture the real current viewport
  // capture the focus clip from plan.captures when available
} finally {
  await window.__MESURER__.finishCapture()
}
```

A capture plan always asks for the current viewport and may add a focused evidence crop. The focus crop unions the scoped `regions`, relevant targets, measurements, and distance endpoints with padding and clamps the result to the viewport. This means a whitespace/alignment region with no DOM target still produces a close-up plan.

Capture mode hides Mesurer chrome such as toolbars, settings, comment editors, and action popovers while preserving page content, selection/annotation markers, rulers, guides, measurements, held distances, and rendered pixel/alignment evidence.

## Configure direct delivery as plugin options

A source-mounted application that owns screenshots or an ACP session configures the plugin, not `mountMeasurer()` itself:

```ts
const mesurer = mountMeasurer({
  agent: true,
  plugins: [
    contextPlugin({
      evidenceProvider: async ({ context, plan }) => {
        // Capture with the real browser/harness.
        return [];
      },
      sendContext: async ({ context, text, images }) => {
        // Deliver through the ACP client/session already owned by the host.
      },
    }),
  ],
});
```

Without `sendContext`, no Send button is rendered.

## ACP

Mesurer does not discover or manage individual coding agents.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const prompt = toAcpContentBlocks(context, evidenceImages);
```

The ACP client that already owns the target session sends those content blocks. Each screenshot is preceded by a small text block identifying its evidence kind/id so the receiving agent can distinguish viewport from focus images. If image prompts are unsupported, send the context text block only.

There are no Mesurer-specific OpenCode/Pi/Cursor/Codex transports.

## Agent Skill

The npm package ships one portable `skills/mesurer-ui/SKILL.md` and a generic installer:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

The transient installer leaves a self-contained `.agents/skills/mesurer-ui/` directory containing both `SKILL.md` and `assets/inject-script.js`. The harness can therefore discover the workflow and inject Mesurer through its existing page-evaluation primitive without leaving the npm package installed in application source.

The repository dogfoods the same workflow through `.agents/skills/mesurer-ui/SKILL.md`.

## Browser extension

The first-party MV3 extension is the recommended zero-source-change human path for arbitrary pages. It packages the same `inject-script` runtime, which installs the same removable `mesurer.context` plugin used by source-mounted integrations.

The old DevTools Snippet path remains a no-extension fallback.
