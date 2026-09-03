# Mesurer design feedback loop

Mesurer is most useful when it stays in the loop while a UI is being built, not when it is opened once at the end as a debugging accessory.

The operating principle is:

> **The rendered page is the source of truth. CSS intent is not proof of the rendered result.**

A stylesheet can say `display: flex`, `gap: 16px`, or `align-items: center` while the actual page still looks wrong because of intrinsic sizing, inherited styles, transforms, fonts, wrapping, scrollbars, responsive rules, unexpected parents, or neighboring components.

Mesurer adds a second principle:

> **The human and the agent share the same visual state in the page.**

The human can select one or many elements, drag a region, place guides, create measurements/held distances, enable rulers/X-ray, save a note, arrange a Desired layout, directly edit Desired copy/typography, or—when the optional screenshot plugin is enabled—capture a real viewport region for manual review. The agent reads structured context and saved intent from `window.__MESURER__` through its existing browser harness. There is no Send-to-agent/MCP/WebMCP/ACP delivery layer.

## Default workflow for agent-driven UI work

When Mesurer is already present, read human state **before editing**:

```text
human selects / measures / guides / annotates / arranges / edits text
        ↓
agent discovers existing window.__MESURER__
        ↓
agent inventories workspace + selection + annotations + Arrange + text edits
        ↓
agent reads all selected targets + relevant pair distances + Desired intent
        ↓
agent edits the implementation
        ↓
real application renders / HMR settles
        ↓
Mesurer.stable()
        ↓
Arrange Live review + text Live check + annotation/fresh context
        ↓
outer harness takes a real task screenshot
        ↓
agent compares exact measurements + pixels + Desired intent
        ↓
repeat until rendered evidence supports the claim
```

If Mesurer is absent, inject the bundled `inject-script` through the browser evaluation channel the harness already owns. Do not create a second browser, new CDP stack, or Mesurer-specific server.

The optional human screenshot camera is not required for this agent loop. It is a separate first-party plugin documented in [`SCREENSHOTS.md`](./SCREENSHOTS.md).

Direct text editing is documented in [`TEXT_EDITING.md`](./TEXT_EDITING.md). Arrange is documented in [`ARRANGE.md`](./ARRANGE.md).

## Read before touching source

A human does not need to save an annotation to communicate useful visual state.

```js
await window.__MESURER__.ready()

const capabilities = window.__MESURER__.capabilities().capabilities
const workspace = await window.__MESURER__.context()
const arrangements = capabilities.arrange
  ? await window.__MESURER__.arrangements()
  : []
const textEdits = capabilities.textEdit
  ? await window.__MESURER__.textEdits()
  : []

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}

const annotations = await window.__MESURER__.annotations()
const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

Resolve relevant Arrange/text-edit ids before HMR too:

```js
const arrangeIntents = await Promise.all(
  arrangements.map((intent) => window.__MESURER__.arrange(intent.id)),
)
const textEditIntents = await Promise.all(
  textEdits.map((intent) => window.__MESURER__.textEdit(intent.id)),
)
```

Retain these initial values in the current task before HMR can replace selected DOM nodes.

### What the human may already be communicating

```text
selection                 → “this is what I mean”
multi-selection           → “compare these things and their relationships”
selected region           → “this whitespace/area is the problem”
guide                      → alignment reference
measurement               → exact box/region geometry evidence
held distance             → exact relationship between two regions/targets
rulers                     → coordinate context
X-ray                      → structural inspection context
annotation note            → durable explicit intent + baseline
Arrange Desired            → “put this rendered UI here”
text/style Desired edit    → “make this copy/typography look like this”
screenshot thumbnail       → manual visual evidence/review state; preserve it
```

Rulers/X-ray are context, not automatic design requirements. Annotation notes, Arrange Desired geometry, and text/style Desired edits are intent. Numeric Mesurer data is rendered evidence. A screenshot preview may be useful human evidence, but its pixels do not replace exact Mesurer geometry.

## Multi-selection standard

When a person selects multiple elements, inspect **every selected target** rather than returning only a count or the first target.

For each target, use the full computed inspection: selector/identity, rect, box model, typography, appearance, flex/grid/layout, scroll dimensions, and overflow.

Then inspect relationships among targets. Prefer existing `selection.visualContext.distances`; for a selected pair without relevant distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, surface all useful unique pair relationships. Example:

```text
Card 01: 972 × 390
Card 02 paragraph: 415 × 53
Card 03 heading: 415 × 68

Card 01 → Card 02 paragraph: vertical gap 184.9px
Card 01 → Card 03 heading: vertical gap 156.4px
Card 02 paragraph → Card 03 heading: horizontal gap 80px
```

Also read viewport/DPR/document overflow, guides, held distances, rulers/X-ray, and relevant plugin state. For large selections, focus on adjacent/repeated/user-relevant pairs instead of generating unhelpful O(n²) output.

## What an agent should validate

Do not stop at “the CSS looks correct.” Use the rendered result.

### Alignment

- Do intended left/right/top/bottom edges actually line up?
- Are controls vertically centered relative to labels/icons?
- Do repeated components share intended dimensions/anchors?
- Does a human-placed guide cross the edges that should align?
- In a multi-selection, which pair or repeated set is actually misaligned?

Use target rects, guides, `inspect()` / `inspectAll()`, center deltas, and exact coordinates.

### Spacing

- Is the visible gap actually 8/12/16/24px as intended?
- Are padding/margin producing the expected rhythm?
- Are repeated gaps consistent?
- Does a human-held distance show the same value after the fix?
- For multi-selection, did all relevant pair gaps move to the intended values?

Use scoped `visualContext.distances`, box-model fields, and `distance(a, b)`.

### Typography and copy

Use the `typography` section to verify loaded font, size, weight, line height, letter spacing, alignment, and color, then confirm composition in the screenshot.

If the human created a direct text edit, also compare the saved `textEdit(id)` Desired copy/style deltas against **Live source with Mesurer's preview inactive**. The automatic Text Inspector card shown during editing is useful human feedback, but it is transient UI rather than the final verification source.

### Layout and responsiveness

Use `layout`, `scroll`, and `viewport()` to verify flex/grid behavior, clipping/overflow, breakpoints, and document dimensions.

### Visual appearance

Use `appearance` for computed background/border/radius/shadow/opacity and a real screenshot for composition/visual judgment.

## Human annotation workflow

A saved annotation records a durable note and immutable baseline.

Before editing:

```js
const context = await window.__MESURER__.context({ annotation: annotationId })
```

After editing:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` can produce exact evidence such as:

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
width: 318px → 320px
baseline evidence disappeared → kind="missing"
```

This turns a human visual note into deterministic rendered acceptance evidence without transporting a message outside the page.

## Human Arrange + text-edit workflow

Arrange and direct text editing let a reviewer express layout and copy/typography together without describing either in prose.

```text
move component to Desired position
        ↓
double-click label while Arrange/Select stays active
        ↓
replace copy / choose page font-size-weight-color / B-I-U
        ↓
Text Inspector info card updates for that field
        ↓
Enter keeps text/style Desired intent
        ↓
agent reads Arrange + textEdit together
```

The source implementation should satisfy both outcomes semantically. A temporary Arrange transform is not a production layout rule, and a sampled computed text style is not automatically a production inline style.

After source edits, verify Arrange with `showArrange(id, "live")` / `reviewArrange(id)` and verify text with the text Desired preview inactive. Do not clear either history channel merely to expose Live.

## Unsaved selection/measurement workflow

If the human only selected/measured things, keep the initial context object in the current agent task and compare after the edit:

```js
await window.__MESURER__.stable()
const current = await window.__MESURER__.context()
```

For focused comparison:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

For multi-selection, remeasure the same target dimensions and pair relationships captured before editing.

## Use measurements and screenshots together

Neither signal replaces the other.

**Mesurer context answers:** what was selected, exact position/size/gaps, computed box model/font/layout/overflow, pair relationships, and how geometry changed.

**Saved intent answers:** what the human explicitly requested through annotation notes, Arrange Desired geometry, and direct text/style Desired edits.

**Screenshots answer:** composition, hierarchy, crowding/emptiness, color/shape relationships, clipping/overlap, and other visual judgment.

This is true whether the screenshot came from the outer agent harness or the optional human screenshot plugin. Only the context/measurement path should be used for exact numeric claims.

## Clean screenshot evidence for coding agents

For normal agent verification, the outer harness owns screenshot bytes:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // use the harness's real screenshot primitive
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ scope: "selection" }` for unsaved selection evidence. Mesurer defines capture scope/presentation; the outer harness controls exact viewport, timing, artifact storage, and comparison.

## Human screenshot plugin

When the task needs a person-facing capture workflow, enable `screenshotPlugin()` from `mesurer-solid/screenshot` or set `window.__MESURER_CONFIG__ = { screenshot: true }` before normal injection. The first-party Chrome extension enables it automatically.

The camera tool:

- lets the human drag a viewport region;
- captures a real visible-page PNG with HiDPI-aware crop scaling;
- hides Mesurer control chrome during capture;
- supports persisted best-effort automatic copy/download outputs;
- leaves a persistent draggable thumbnail with native image right-click behavior;
- opens a larger Copy/Save/Close viewer on click;
- reports capture/output status without discarding a valid PNG when an optional output fails.

Normal browser hosts use `getDisplayMedia()`; the Chrome extension captures via `chrome.tabs.captureVisibleTab()` through its isolated-world bridge and therefore avoids the normal screen-share chooser.

This camera path is **not** an agent delivery channel. An agent should preserve a human preview unless the task specifically involves testing or manipulating the screenshot feature. See [`SCREENSHOTS.md`](./SCREENSHOTS.md).

## Minimal agent iteration

When no saved annotation/Arrange/text intent is relevant:

```js
await window.__MESURER__.stable()

const feedback = await window.__MESURER__.feedback([
  "header",
  "nav",
  "main",
  "[data-testid='primary-card']",
  "[data-testid='primary-action']",
])
```

Then take a real screenshot through the outer harness.

A completion should be evidence-based, for example:

```text
- card left edge: 312px
- heading left edge: 312px
- button/card right gap: 24px
- primary action height: 40px
- document horizontal overflow: false
- computed heading font: Inter, 32px, 700, 40px line-height
- requested label text and typography match saved Desired intent in Live source
- screenshot: no clipping; hierarchy matches requested composition
```

## When to use Mesurer

For an agent with browser access, Mesurer should be the default verification layer for layout, spacing, alignment, sizing, typography, copy/style intent, responsive behavior, overflow/clipping, visual hierarchy, design-system consistency, reference recreation, visual polish, and issues the human has already selected/measured/arranged/edited in the page.

It is not necessary to call every method after every edit. Measure what matters to the request.

Use the screenshot plugin itself as the automation target only when the requested work is about screenshot capture/preview/viewer behavior. Otherwise use the harness screenshot path for task evidence.

## Do not destroy review state

If the page already contains Mesurer, use the current instance rather than reinjecting it.

Injected Mesurer defaults to `reuseExisting: true`; explicit replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

Never change/delete human guides, measurements, held distances, annotations, Arrange intents, text-edit intents, or screenshot preview/viewer state merely to make validation look successful.

## Users can extend Mesurer by asking their agent

Because the runtime is plugin-based, project-specific inspection behavior should normally be a plugin:

> “Add a Mesurer plugin that checks whether the cards align to our 8px grid.”

> “Add a Mesurer tool that highlights overflowing containers.”

> “Replace X-ray with one that shows our design-system component names.”

The first-party screenshot implementation is itself an example of this architecture: a substantial UI/capture capability can live behind a removable plugin and public subpath rather than expanding permanent core state.

Direct text editing is intentionally different: it extends the renderer's existing Text Inspector/Select interaction contract and shares typography primitives rather than creating a competing top-level editing tool.

Modify core only when the missing capability is genuinely shared platform behavior.

## Example: validating a card grid and its copy

If the user says:

> “These cards are messed up. Look at the measurements and edits I made and make them line up.”

A Mesurer-driven agent can:

1. reuse the live Mesurer instance;
2. inventory workspace + multi-selection + annotations + Arrange + text edits;
3. record every selected card's exact rect/box model;
4. record relevant pair gaps/center deltas/guides;
5. retain any Desired geometry and copy/typography intent;
6. edit the implementation;
7. wait for the real render to settle;
8. switch Arrange and text previews to real Live source without deleting intent;
9. remeasure/review the same targets and pair relationships;
10. verify the real copy/computed typography against text Desired intent;
11. capture a real screenshot through the outer harness;
12. iterate until exact geometry, copy/typography, and visual appearance support the fix.

## Suggested instruction for coding agents

> **For meaningful UI/design work, first reuse and read any existing Mesurer state in the page, including the human's selection, guides, measurements, held distances, annotations, Arrange Desired geometry, text/style Desired edits, and screenshot review state. For multi-selection, inspect every selected target and the relevant pairwise pixel relationships. Treat annotation/Arrange/text Desired state as intent and rendered measurements as evidence. After editing, wait for the real page to settle, verify Arrange and text changes against real Live source with temporary previews inactive, remeasure/review the same evidence, and pair exact geometry with a real browser screenshot before claiming completion. Use the optional Mesurer screenshot plugin only when the task needs that human camera workflow; do not treat it as agent delivery or destroy a human preview. Do not create a separate Mesurer transport, Send-to-agent path, browser, or server when the current harness can evaluate the page directly.**

The repository's own [`AGENTS.md`](../AGENTS.md) follows this rule.