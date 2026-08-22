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

## The feature is a plugin

The context/annotation workflow is not hard-wired into the renderer or mount lifecycle. It is provided by the removable `mesurer.context` plugin.

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

The generic `/inject` and `/inject-script` entry points install `contextPlugin()` by default because context/annotations are the intended human/agent injection workflow. Set `window.__MESURER_CONFIG__.context = false` before injection when a harness deliberately wants the lower-level inspector without the context plugin.

## Context controls

When `contextPlugin()` renders its UI, the context actions live in the existing draggable Mesurer toolbar rather than in a second floating action bar. Plugin tools are rendered by the canonical toolbar button component; there is no DOM-label discovery or animation-frame polling layer.

| Action | Shortcut | Availability |
| --- | --- | --- |
| Copy context | `C` | Always |
| Copy selection | `Shift+C` | When an element or dragged region is selected |
| Add note | `N` | When an element or dragged region is selected |
| Send selection | `Cmd/Ctrl+Enter` | Only when the plugin was configured with `sendContext` |

Copy actions briefly flash their toolbar icon on success instead of adding a toast over page content. **Add note** opens a compact toolbar popover. Annotation-specific Copy/Send/Delete/Close actions open beside the numbered annotation marker.

The context controls are inserted before Settings so Settings remains the final regular toolbar control. Annotation markers and their popovers are clamped to viewport edges. Keyboard shortcuts inspect the composed event path, so typing inside Mesurer inputs/textareas does not trigger page-inspection shortcuts across the Shadow DOM boundary.

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

A user selects one or more page elements **or drags an arbitrary area** and chooses **Add note**. The plugin stores durable target identity when elements exist, the requested region, a scoped baseline, and the user's note.

```js
await window.__MESURER__.context({ annotation: annotationId })
```

The user note is intent. Computed DOM data and visual measurements are supporting evidence.

Scoped `MesurerContextV1` values expose `regions`, the viewport rectangles that define the selected/annotated area. Region-only notes therefore retain useful geometry even when `targets` is empty.

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
