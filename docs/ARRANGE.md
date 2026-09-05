# Arrange

Arrange lets a person move selected rendered UI into the position they want without pretending to edit application source.

It is an optional first-party plugin:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  agent: true,
  plugins: [arrangePlugin()],
})
```

Mount it from the same browser-only Mesurer setup described in [Getting started](./GETTING_STARTED.md).

## Human workflow

1. Click Arrange or press `Shift+A`.
2. Select one or more elements.
3. Drag the selection to the desired position.
4. Release the pointer to keep that placement as Desired intent.

Arrange can be activated before a selection exists. Activating it automatically enables Select; an existing selection is preserved.

Arrange and Select have a one-way dependency:

- turning Arrange off leaves Select active;
- turning Select off while Arrange is active also exits Arrange, because Arrange requires selection interaction.

Arrange is a normal tool in one stable toolbar, not a toolbar mode.

Hold Shift while dragging to lock movement to the dominant axis. One completed drag creates one history entry; pointer movement during the drag is transient.

Repeated drags start from the current Desired placement, so a layout can be refined in several small moves.

## Snapping

The chevron beside Arrange exposes the same persisted preferences as its Settings section:

- Snapping;
- Element edges;
- Element centers;
- Guides;
- Prefer X-ray edges;
- Alignment rulers.

Element edges snap to edges, centers snap center-to-center, and Mesurer guides can align compatible edges or centers. X and Y are evaluated independently. With Shift axis locking, only the active movement axis can snap.

When X-ray is visible and Prefer X-ray edges is enabled, Arrange uses the visible X-ray box edges as element snap targets. Multi-selection snaps the group bounding box and applies the same final delta to each selected element.

## Before, Desired, and Live

Arrange distinguishes three presentations:

- **Before** — geometry before a saved Arrange action.
- **Desired** — the human-arranged result.
- **Live** — the page with Arrange previews removed, showing only application source.

Each completed drag records target identity, Before and Desired rectangles, visual offsets, page scope, and creation time. Intent participates in Mesurer history and can persist across reloads when the target can be rebound safely.

The preview is temporary browser presentation. Arrange never writes CSS, component source, templates, or application state.

## Transform ownership

Arrange previews movement with an inline transform while keeping the element's original inline transform value and priority as the baseline.

Cleanup is ownership-aware. Mesurer restores the previous transform only when the current inline transform still matches the exact preview value and priority Mesurer applied. If the host application changes the transform while Arrange owns a preview, Mesurer preserves that host change and relinquishes the obsolete ownership record instead of restoring an older baseline over it.

That rule applies when switching to Live, reviewing an intent, refreshing/reapplying presentation, turning Arrange off, removing the plugin, and disposing Mesurer. Refresh does not accumulate old preview offsets or revive an obsolete baseline.

## Direct text editing

Arrange keeps Select active, so a reviewer can move an element and then double-click its text without leaving the layout workflow.

Direct editing records its own Before/Desired copy and typography intent. Contextual Typography appears for the active field without turning off Select or Arrange. The two intent channels remain independent:

```text
Arrange
  Before / Desired geometry

Text edit
  Before / Desired copy and typography
```

Preserve both until their evidence has been consumed. See [Direct text editing and Typography](./TEXT_EDITING.md).

## Agent API

When `arrangePlugin()` is mounted, the agent capability surface reports `arrange: true`.

Read saved intent:

```js
const intents = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(intents.at(-1).id)
```

Show a saved presentation:

```js
await window.__MESURER__.showArrange(intent.id, "before")
await window.__MESURER__.showArrange(intent.id, "desired")
await window.__MESURER__.showArrange(intent.id, "live")
```

Request screenshot geometry for an outer browser harness:

```js
const plan = await window.__MESURER__.arrangeCapturePlan(
  intent.id,
  "desired",
)
```

The harness owns screenshot bytes. Mesurer supplies the viewport/focus geometry.

## Implement the outcome

An Arrange offset describes what the user wants to see, not how source code should implement it.

If the Desired preview moves a control 96px to the right, the correct source change may be flex/grid alignment, gap, sizing, ordering, margins, or component structure. Copying the preview transform into production CSS is usually the wrong implementation.

The same rule applies to text/style intent: sampled rendered values describe the visual target, not necessarily the source token or declaration to paste.

## Review after source changes

After implementing the design, wait for the application to settle, show Live, and compare it with Desired:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")

const review = await window.__MESURER__.reviewArrange(intent.id)
```

`reviewArrange()` reports target status, Desired and current Live rectangles, exact deltas, tolerance, and match state. The preview is removed while Live geometry is measured, so temporary Arrange offsets cannot make unfinished source look correct.

If the task also has text-edit intent, verify Live copy and typography with the text Desired preview inactive as well.

## Persistence and cleanup

Arrange preferences and intent use the normal plugin persistence channel. Targets are rebound conservatively through selector and fingerprint rules and are scoped to the current origin, pathname, and query string. Ambiguous targets remain unresolved rather than being guessed.

Cancelling a drag returns to the previously saved Desired presentation. Switching to Live, disabling Arrange, or disposing Mesurer removes only presentation that Mesurer still owns; newer host-authored transforms are preserved.

## Scope

Arrange is a visual layout-intent tool, not a general DOM/CSS editor. It focuses on repositioning with edge, center, guide, and X-ray alignment. The preview does not reflow siblings and never claims to be the final source implementation.

See [Context workflow](./CONTEXT_WORKFLOW.md) for combined human/agent review.
