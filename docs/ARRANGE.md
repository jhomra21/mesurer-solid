# Arrange

Arrange lets a person move selected HTML elements without editing application source. SVG elements can still be selected, measured, and reviewed, but Arrange does not apply transforms to them.

It is an optional first-party plugin:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrange } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [arrange()],
})
```

Mount it from the same browser-only Mesurer setup described in [Getting started](./GETTING_STARTED.md).

## Arrange a selection

1. Click Arrange or press `Shift+A`.
2. Select one or more HTML elements.
3. Drag the selection to the desired position.
4. Release the pointer to save that placement as Desired intent.

Arrange can be activated before a selection exists. It enables Select automatically and preserves any existing selection. Hold Shift while clicking page elements to add or remove targets from the selection, including elements that sit underneath the current Arrange group box.

Arrange depends on Select, but the dependency is one-way. Turning Arrange off leaves Select active. Turning Select off while Arrange is active also exits Arrange.

Escape cancels an active drag first. Otherwise, the first Escape clears the current Arrange selection while keeping Arrange and Select active, so the next element can be selected immediately. Press Escape again with no selection to exit both Arrange and its dependent Select. While a target is selected, Arrange hides Select's hover box so a nested parent or child does not look like a second selection.

Arrange is a normal optional tool in one stable toolbar, not a toolbar mode.

## Reset positions

A moved selected element gets a compact **Reset position** button beside its Arrange box. In a multi-selection, each moved element gets its own button. Resetting one element removes that element's accumulated Arrange position for the current page and returns it to its original position.

The Arrange options menu also has **Reset all positions**. It removes all saved Arrange positions for the current page without changing Arrange state saved for other routes.

Both reset actions change Arrange intent through the normal command history, so undo can restore the removed position. They only change Mesurer's Desired preview and saved intent. They do not edit application source.

Hold Shift while dragging to lock movement to the dominant axis. One completed drag creates one history entry. Repeated drags start from the current Desired position so the layout can be refined incrementally.

## Snapping

The Arrange chevron and Settings expose the same persisted preferences:

- Snapping
- Element edges
- Element centers
- Guides
- Prefer X-ray edges
- Alignment rulers

X and Y are evaluated independently. With Shift axis locking, only the active movement axis can snap. Multi-selection snaps the group bounding box and applies the same rendered delta to every selected element. If both a parent and one of its descendants are selected, the descendant does not receive the parent's movement a second time.

When X-ray is visible and **Prefer X-ray edges** is enabled, the visible X-ray boxes become snap targets.

## Before, Desired, and Live

Arrange keeps three presentations separate:

- **Before.** Geometry before a saved Arrange action.
- **Desired.** The human-arranged result.
- **Live.** The application page with Arrange preview removed.

Each completed drag records target identity, Before and Desired rectangles, offsets, page scope, and creation time. Intent participates in Mesurer history and can persist when the target can be rebound safely.

The preview is temporary browser presentation. Arrange never writes production CSS, templates, component source, or application state.

## Original vs Desired presentation

Saving an Arrange action and keeping its preview visible outside Arrange are separate decisions. The saved intent remains available even when Mesurer restores the original page geometry.

By default, **Keep Arrange changes is OFF**:

- while **Arrange** owns the presentation, saved Desired transforms are shown;
- when you return to **Select** or another tool, the original page presentation is restored;
- switching back to Arrange shows the saved Desired arrangement again;
- switching presentation does not delete Arrange intent or history.

To keep saved Arrange changes visible outside Arrange, open **Settings** with the gear button or `Cmd/Ctrl+,`, choose **General**, and turn on **Keep Arrange changes**. The setting is persisted. Turning it off restores the normal tool-owned behavior without deleting saved intent.

The same General panel contains **Keep text changes** for Typography/direct text editing; see [Direct text editing and Typography](./TEXT_EDITING.md).

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

Get capture geometry for an browser controller:

```js
const plan = await window.__MESURER__.arrangeCapturePlan(
  intent.id,
  "desired",
)
```

Mesurer supplies the reproducible state and geometry; the browser controller owns screenshot bytes.

## Typed Arrange service

Application code with access to the plugin host can resolve `MesurerArrangeService` from service id `arrange`.

| Method | Result |
| --- | --- |
| `active()` | Report whether Arrange is active. |
| `intents()` | List saved Arrange intents. |
| `intent(id)` | Read one saved intent or `null`. |
| `show(id, state)` | Show Before, Desired, or Live presentation for one intent. |
| `showCurrent()` | Restore the presentation that current Arrange state calls for. |
| `capturePlan(id, state)` | Return screenshot regions for one presentation. |
| `review(id, tolerance?)` | Compare Live geometry with Desired. |
| `resetSelection()` | Reset the selected elements to their original positions on the current page. |
| `resetAll()` | Reset all Arrange positions on the current page. |
| `clear()` | Clear all saved Arrange intent through the plugin service. |

The agent-facing methods use the longer names `arrangements()`, `arrange()`, `showArrange()`, `arrangeCapturePlan()`, and `reviewArrange()` so they remain unambiguous on `window.__MESURER__`.

## Implement and review

Desired describes the visual result, not the source-level implementation. A 96px preview offset is only evidence about the requested result. The application may implement it with flex or grid alignment, gap, sizing, ordering, margins, or component structure.

After editing source:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")
const review = await window.__MESURER__.reviewArrange(intent.id)
```

`reviewArrange()` compares the real Live rectangles with Desired and reports exact deltas and target status. Because the preview is removed during Live review, temporary Arrange transforms cannot make unfinished source look correct.

If the task also contains direct text-edit intent, verify Live copy and typography with the text Desired preview inactive too.

## Scope

Arrange records layout intent. It supports repositioning with edge, center, guide, ruler, and X-ray alignment. Its preview does not reflow siblings and is not a source-code implementation.

Targets are rebound conservatively. Ambiguous targets remain unresolved rather than being guessed.

See [Direct text editing and Typography](./TEXT_EDITING.md) for copy/type intent and [Context](./CONTEXT_WORKFLOW.md) for combined review.