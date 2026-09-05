# Arrange

Arrange lets a person move rendered UI into the position they want without pretending to edit application source.

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

## Arrange a selection

1. Click Arrange or press `Shift+A`.
2. Select one or more elements.
3. Drag the selection to the desired position.
4. Release the pointer to save that placement as Desired intent.

Arrange can be activated before a selection exists. It enables Select automatically and preserves any existing selection.

Arrange depends on Select, but the dependency is one-way: turning Arrange off leaves Select active; turning Select off while Arrange is active also exits Arrange.

Arrange is a normal optional tool in one stable toolbar, not a toolbar mode.

Hold Shift while dragging to lock movement to the dominant axis. One completed drag creates one history entry. Repeated drags start from the current Desired position so the layout can be refined incrementally.

## Snapping

The Arrange chevron and Settings expose the same persisted preferences:

- Snapping
- Element edges
- Element centers
- Guides
- Prefer X-ray edges
- Alignment rulers

X and Y are evaluated independently. With Shift axis locking, only the active movement axis can snap. Multi-selection snaps the group bounding box and applies the final delta to each selected element.

When X-ray is visible and **Prefer X-ray edges** is enabled, the visible X-ray boxes become snap targets.

## Before, Desired, and Live

Arrange keeps three presentations separate:

- **Before** — geometry before a saved Arrange action.
- **Desired** — the human-arranged result.
- **Live** — the application page with Arrange preview removed.

Each completed drag records target identity, Before and Desired rectangles, offsets, page scope, and creation time. Intent participates in Mesurer history and can persist when the target can be rebound safely.

The preview is temporary browser presentation. Arrange never writes production CSS, templates, component source, or application state.

## Transform ownership

Arrange previews movement with an inline transform while retaining the element's previous inline transform value and priority as its baseline.

Mesurer restores that baseline only while the current transform still matches the exact preview value and priority it applied. If the application changes the transform, Mesurer relinquishes ownership and preserves the host-authored value through Live review, refresh, plugin removal, and disposal.

This prevents stale Arrange state from overwriting a real source update.

## Agent API

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

Get capture geometry for an outer browser harness:

```js
const plan = await window.__MESURER__.arrangeCapturePlan(
  intent.id,
  "desired",
)
```

Mesurer supplies the reproducible state and geometry; the harness owns screenshot bytes.

## Implement and review

Desired describes the visual result, not the source-level implementation. A 96px preview offset might ultimately be implemented with flex/grid alignment, gap, sizing, ordering, margins, or component structure rather than a production transform.

After editing source:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")
const review = await window.__MESURER__.reviewArrange(intent.id)
```

`reviewArrange()` compares the real Live rectangles with Desired and reports exact deltas and target status. Because the preview is removed during Live review, temporary Arrange transforms cannot make unfinished source look correct.

If the task also contains direct text-edit intent, verify Live copy and typography with the text Desired preview inactive too.

## Scope

Arrange is a layout-intent tool, not a general DOM/CSS editor. It focuses on repositioning with edge, center, guide, ruler, and X-ray alignment. The preview does not reflow siblings and never claims to be the final source implementation.

Targets are rebound conservatively. Ambiguous targets remain unresolved rather than being guessed.

See [Direct text editing and Typography](./TEXT_EDITING.md) for copy/type intent and [Context](./CONTEXT_WORKFLOW.md) for combined review.
