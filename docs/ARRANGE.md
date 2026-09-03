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

1. Click **Arrange** in the toolbar or press **Shift+A**. Arrange activates **Select** automatically.
2. Select one or more page elements. If a selection already exists, Arrange preserves it.
3. Drag the selection to the desired position.
4. Move near another visible element edge, center, X-ray box edge, or existing Mesurer guide to snap into alignment.
5. Hold **Shift** while dragging to lock movement to the dominant axis.
6. Release the pointer. The snapped **Desired** placement remains visible so you can inspect it or continue arranging.

Arrange does not require a page selection before it can be activated. This keeps the interaction one-step: choose Arrange, then choose what to move.

Arrange and Select are coordinated. Arrange keeps Select active because selection is required for Arrange interaction; leaving Select exits Arrange and returns the page to Live rather than leaving an unusable Arrange state selected. While Arrange is active, conflicting page-interaction tools and their shortcuts are disabled so they cannot steal the interaction mid-drag.

Arrange records one history entry when the drag finishes. Pointer movement itself is transient, so a single drag does not create dozens of undo steps.

`Cmd/Ctrl+Z` and redo use the normal Mesurer plugin history. Undo removes the latest saved placement from the visible Desired presentation; redo restores it.

Repeated drags start from the current Desired placement rather than the source-rendered position, so you can refine a layout in several small moves.

## Arrange and direct text editing

Arrange intentionally keeps Select active, so direct text editing works without leaving the layout workflow.

A reviewer can:

1. activate Arrange;
2. select and move an element;
3. double-click ordinary direct text inside that selected element;
4. replace the copy or change typography/color with the Mesurer-style formatting strip;
5. inspect the automatic Text Inspector card for that exact field;
6. press **Enter** to keep the text/style change as Desired intent;
7. continue arranging.

The two features record separate but complementary intent:

```text
Arrange intent
  Before / Desired geometry

Text-edit intent
  Before / Desired copy
  requested typography/style deltas
```

Neither channel should erase the other. A person can move a control and change its label/typography, then simply ask a coding agent to “check Mesurer context.” The Agent Skill inventories both channels before changing source.

Direct text editing does not globally switch into Text Inspector mode while Arrange is active. Its contextual inspector card is transient and attached only to the edit session, so Arrange remains selected and usable.

See [`TEXT_EDITING.md`](./TEXT_EDITING.md) for the complete direct text-edit contract, target boundaries, toolbar behavior, automatic inspector information, agent API, and Live verification rules.

## Arrange settings

Arrange exposes these frequently changed preferences from the small chevron beside the Arrange toolbar button and from its full, collapsed plugin section in Mesurer Settings. Both surfaces read and write the same persisted plugin state. The quick menu closes after a preference is chosen:

- **Snapping** — master switch for magnetic alignment. Enabled by default.
- **Element edges** — snap left/right and top/bottom edges to nearby elements. Enabled by default.
- **Element centers** — allow center-to-center alignment when X-ray edge preference is not active. Enabled by default.
- **Guides** — snap to existing Mesurer guides. Enabled by default.
- **Prefer X-ray edges** — while X-ray is on, use the visible blue box edges as element snap targets instead of invisible element centers. Enabled by default.
- **Alignment rulers** — show the red ruler while a snap is active. Enabled by default.

Turning **Snapping** off leaves Arrange as a free-drag visual intent tool. The other snap-target controls are disabled until snapping is enabled again.

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

Element snapping is semantic rather than all-anchor-to-all-anchor:

- element **edges align to edges**;
- element **centers align center-to-center**;
- Mesurer guides can align any compatible moving edge or center.

This avoids a visible box edge unexpectedly pulling toward another element's invisible center.

When X-ray is visible and **Prefer X-ray edges** is enabled, Arrange restricts element snap targets to elements that are actually outlined by X-ray and uses their visible box edges. That makes the blue X-ray geometry and the magnetic Arrange geometry agree on screen.

Without that preference, nearby visible page elements can contribute both edge and center anchors according to the enabled Arrange settings. Existing Mesurer guides are also valid snap targets when **Guides** is enabled.

When an anchor comes within the snap distance, Arrange adjusts that drag axis to exact alignment. With **Alignment rulers** enabled, a red ruler shows the active snap between the moving selection and the matched element; guide targets use the same ruler treatment across the viewport.

Snapping is evaluated independently on X and Y. With Shift axis locking, only the active movement axis is eligible to snap, so snapping does not break the axis lock.

For multi-selection, the group bounding box is snapped as one unit and every selected target receives the same final drag delta.

## Before, Desired, and Live

Arrange intentionally distinguishes three presentations:

- **Before** — the page as it appeared before a specific Arrange action.
- **Desired** — the human-arranged visual result, including any alignment snap chosen during the drag.
- **Live** — the page with Arrange previews removed, showing only what the application source currently renders.

That distinction lets a coding agent compare human intent with the real implementation instead of mistaking a temporary preview for completed work.

Desired remains visible after a completed drag and can be restored after reload. Deactivating Arrange returns the human page to Live. Agents can switch explicitly between Before, Desired, and Live through the Arrange API.

Text/style Desired edits have their own preview ownership and history. When a task combines Arrange and text editing, preserve both intent records. Do not clear text-edit history merely to inspect Arrange Live state, and do not clear Arrange history to inspect text Live state.

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

If direct text editing has also been used, the same broad review should inventory `textEdit` and read `textEdits()` / `textEdit(id)` before source changes. Arrange geometry and text/style intent are independent evidence channels even when they refer to the same rendered component.

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

The same rule applies to direct text/style edits used alongside Arrange: a sampled font/color/weight is Desired visual evidence, not an instruction to paste Mesurer's temporary inline style into production source.

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

If the same task includes a text-edit intent, also deactivate the text Desired preview without deleting that intent and compare the target's real rendered copy/computed typography with the saved Desired text/style values. A complete implementation must match both layout and text intent in Live source.

## Multi-selection

Arrange moves the current Mesurer selection as one group. Each target keeps its own identity and Before/Desired rectangles while sharing the final snapped drag delta.

This is useful for communicating changes such as moving an entire action group, repositioning several aligned controls, or testing a different composition without manually describing every element.

## Persistence and rebinding

Arrange intent state and Arrange preferences use the normal plugin persistence channel. With `persistKey`, they are stored under that Mesurer instance's plugin key; otherwise they use the default plugin storage key.

Persistence keeps both the intent evidence and the current Desired preview. After reload, safely rebound targets return to their saved Desired positions. Deactivating Arrange or explicitly switching to Live removes the preview without deleting the intent.

Targets are rebound with Mesurer's selector + fingerprint rules. An ambiguous match is treated as unresolved rather than guessed.

Arrange also scopes intents to the current origin, pathname, and query string so an intent from one page is not applied to a different route.

## Cleanup

Cancelling a drag restores the previously saved Desired presentation. Deactivating Arrange, removing the plugin, disposing Mesurer, or switching explicitly to Live restores the source-rendered page presentation. Existing inline transform and visibility values and priorities are preserved and restored exactly.

Arrange-owned UI is marked as Mesurer inspector chrome and cannot become a page target itself.

## Current scope

Arrange is deliberately a **visual layout-intent tool**, not a general DOM/CSS editor.

It focuses on repositioning with configurable edge/center/guide alignment snapping. The temporary preview does not reflow siblings, and Arrange does not write application source. Future extensions can build on the same Before/Desired/Live contract without changing that separation.
