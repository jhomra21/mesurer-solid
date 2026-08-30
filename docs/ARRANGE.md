# Arrange

Arrange lets a person reposition selected rendered elements to show **where they want the UI to end up** without pretending to edit the application source.

It is an optional first-party plugin:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  agent: true,
  plugins: [arrangePlugin()],
})
```

Use the same browser-only Mesurer setup module described in [`GETTING_STARTED.md`](./GETTING_STARTED.md). Arrange does not belong in server code, an Electron main process, or build configuration.

## Human workflow

1. Select one or more page elements with Mesurer.
2. Click **Arrange** in the toolbar.
3. Drag the selection to the desired position.
4. Move near another visible element edge or center, an X-ray outline, or an existing Mesurer guide to snap into alignment.
5. Hold **Shift** while dragging to lock movement to the dominant axis.
6. Release the pointer. The snapped **Desired** placement remains visible so you can inspect it or continue arranging.

Arrange records one history entry when the drag finishes. Pointer movement itself is transient, so a single drag does not create dozens of undo steps.

`Cmd/Ctrl+Z` and redo use the normal Mesurer plugin history. Undo removes the latest saved placement from the visible Desired presentation; redo restores it.

Repeated drags start from the current Desired placement rather than the source-rendered position, so you can refine a layout in several small moves.

## What Arrange changes

Arrange changes only the temporary browser presentation. It does **not** edit CSS, component source, templates, or application state.

While Arrange is active, the saved Desired offsets are previewed on the rendered page. During a drag, Arrange temporarily updates those offsets as the pointer moves. Mesurer's normal measurement boxes are suppressed while Arrange is active so a stale source-position rectangle is not left behind as a detached visual ghost.

When the pointer is released, the snapped placement remains visible as **Desired**. Leaving Arrange returns the page to **Live**, which removes the temporary Arrange preview and shows only what the application source currently renders.

Each completed drag records:

- a stable selector and element fingerprint;
- Before geometry;
- Desired geometry;
- the previous visual offset;
- the Desired visual offset;
- page URL scope;
- creation time.

The intent and Desired presentation are persisted after reload when the target can be rebound safely. The temporary transform remains a Mesurer preview; it is never written back to application source.

If a target becomes ambiguous or cannot be rebound conservatively, Arrange does not move another element in its place.

## Snapping and alignment

Arrange uses Mesurer's existing guide snap distance of `10px`.

For a dragged element or multi-selection group, Arrange compares these alignment anchors:

- horizontal position: **left, center, right**;
- vertical position: **top, center, bottom**.

Nearby visible page elements contribute the same edge and center anchors. Existing Mesurer guides are also valid snap targets.

When **X-ray** is on, its visible element outlines use those same page-element rectangles, so the X-ray lines you can see are valid Arrange alignment targets too. Arrange can stick to the left, center, right, top, center, or bottom geometry exposed by those outlined elements; X-ray does not create a separate or approximate coordinate system.

When an anchor comes within the snap distance, Arrange adjusts that drag axis to the exact alignment and shows a red alignment ruler between the moving selection and the matched element. Guide targets use the same ruler treatment across the viewport.

Snapping is evaluated independently on X and Y. With Shift axis locking, only the active movement axis is eligible to snap, so snapping does not break the axis lock.

For multi-selection, the group bounding box is snapped as one unit and every selected target receives the same final drag delta.

## Before, Desired, and Live

Arrange intentionally distinguishes three presentations:

- **Before** — the page as it appeared before a specific Arrange action.
- **Desired** — the human-arranged visual result, including any alignment snap chosen during the drag.
- **Live** — the page with Arrange previews removed, showing only what the application source currently renders.

That distinction lets a coding agent compare human intent with the real implementation instead of mistaking a temporary preview for completed work.

Desired remains visible after a completed drag and can be restored after reload. Deactivating Arrange returns the human page to Live. Agents can switch explicitly between Before, Desired, and Live through the Arrange API.

## Agent API

When `arrangePlugin()` is mounted, the Mesurer agent capability surface reports `arrange: true`.

```js
const capabilities = window.__MESURER__.capabilities()
```

Read saved Arrange intents:

```js
const intents = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(intents.at(-1).id)
```

Present a historical state:

```js
await window.__MESURER__.showArrange(intent.id, "before")
await window.__MESURER__.showArrange(intent.id, "desired")
await window.__MESURER__.showArrange(intent.id, "live")
```

Request screenshot geometry for the outer browser harness:

```js
const plan = await window.__MESURER__.arrangeCapturePlan(
  intent.id,
  "desired",
)
```

The plan includes a full viewport capture plus a padded focus rectangle around the affected targets. Mesurer does not own or transmit the screenshot bytes; the browser harness uses its normal screenshot primitive.

## Before/Desired screenshots

For a coding task that starts from a human Arrange intent, the agent should capture **Before** and **Desired** before editing source or allowing HMR to replace the original DOM.

```js
await window.__MESURER__.showArrange(intent.id, "before")
const beforePlan = await window.__MESURER__.arrangeCapturePlan(intent.id, "before")
// outer harness captures Before

await window.__MESURER__.showArrange(intent.id, "desired")
const desiredPlan = await window.__MESURER__.arrangeCapturePlan(intent.id, "desired")
// outer harness captures Desired
```

The user does not need to save, attach, or send those images manually. The portable Mesurer Agent Skill teaches compatible coding agents this workflow.

## Implement the outcome, not the preview mechanism

A drag is a visual specification.

If Arrange records a target moving `96px` to the right, that does **not** mean the source fix should be:

```css
transform: translateX(96px);
```

The agent should inspect the surrounding rendered layout and make the source-level change that actually expresses the design: flex/grid alignment, gap, margins, sizing, ordering, component structure, or another appropriate rule.

The temporary Arrange transform exists only to preview the desired result. It is evidence of intent, not the prescribed source implementation.

## Review after source edits

After editing the application, wait for the real render, switch to Live, and compare it with Desired:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")

const review = await window.__MESURER__.reviewArrange(intent.id)
```

`reviewArrange()` returns `mesurer.arrange-review/v1` with:

- target status: `connected`, `partial`, or `stale`;
- Desired rectangle for each target;
- current Live rectangle when resolvable;
- exact rectangle delta;
- tolerance;
- per-target and overall match status.

For example:

```text
Before       Desired      Live
x 120   →    x 284        x 276
                         remaining +8px

source edit
  ↓
Live x 284
  ↓
matched ✓
```

The preview is removed while Live geometry is measured, so a temporary Arrange offset cannot make an unfinished source change appear correct.

## Multi-selection

Arrange moves the current Mesurer selection as one group. Each target keeps its own identity and Before/Desired rectangles while sharing the final snapped drag delta.

This is useful for communicating changes such as moving an entire action group, repositioning several aligned controls, or testing a different composition without manually describing every element.

## Persistence and rebinding

Arrange state uses the normal plugin persistence channel. With `persistKey`, it is stored under that Mesurer instance's plugin key; otherwise it uses the default plugin storage key.

Persistence keeps both the intent evidence and the current Desired preview. After reload, safely rebound targets return to their saved Desired positions. Deactivating Arrange or explicitly switching to Live removes the preview without deleting the intent.

Targets are rebound with Mesurer's selector + fingerprint rules. An ambiguous match is treated as unresolved rather than guessed.

Arrange also scopes intents to the current origin, pathname, and query string so an intent from one page is not applied to a different route.

## Cleanup

Cancelling a drag restores the previously saved Desired presentation. Deactivating Arrange, removing the plugin, disposing Mesurer, or switching explicitly to Live restores the source-rendered page presentation. Existing inline transform and visibility values and priorities are preserved and restored exactly.

Arrange-owned UI is marked as Mesurer inspector chrome and cannot become a page target itself.

## Current scope

Arrange is deliberately a **visual layout-intent tool**, not a general DOM/CSS editor.

It focuses on repositioning with edge/center alignment snapping. The temporary preview does not reflow siblings, and Arrange does not write application source. Future extensions can build on the same Before/Desired/Live contract without changing that separation.
