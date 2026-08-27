# Mesurer design feedback loop

Mesurer is most useful when it stays in the loop while a UI is being built, not when it is opened once at the end as a debugging accessory.

The operating principle is:

> **The rendered page is the source of truth. CSS intent is not proof of the rendered result.**

A stylesheet can say `display: flex`, `gap: 16px`, or `align-items: center` while the actual page still looks wrong because of intrinsic sizing, inherited styles, transforms, fonts, wrapping, scrollbars, responsive rules, unexpected parents, or neighboring components.

Mesurer adds a second principle for human/agent work:

> **The human and the agent share the same visual state in the page.**

The human can select elements, drag a region, place guides, create measurements/held distances, enable rulers/X-ray, or save a note. The agent reads that exact state from `window.__MESURER__` through its existing browser harness. No MCP/WebMCP/ACP/chat-delivery layer is required.

## Default workflow for agent-driven UI work

When Mesurer is already present, read human state **before editing**:

```text
human selects / measures / guides / annotates
        ↓
agent discovers existing window.__MESURER__
        ↓
agent reads workspace + selection + annotations
        ↓
agent edits the implementation
        ↓
real application renders / HMR settles
        ↓
Mesurer.stable()
        ↓
annotation review() and/or fresh context/measurements
        ↓
outer harness takes a real screenshot
        ↓
agent compares exact measurements + pixels to human intent
        ↓
agent fixes remaining discrepancies
        ↓
repeat until rendered evidence supports the claim
```

If Mesurer is absent, inject the bundled `inject-script` through the browser evaluation channel the harness already owns. Do not create a second browser, new CDP stack, or Mesurer-specific server.

## Read before touching source

A human does not need to save an annotation to communicate useful visual state.

Start with:

```js
await window.__MESURER__.ready()

const workspace = await window.__MESURER__.context()

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

The agent should retain these initial values in the current task before HMR can replace selected DOM nodes.

### What the human may already be communicating

```text
selection                 → “this is what I mean”
selected region           → “this whitespace/area is the problem”
guide                      → alignment reference
measurement               → exact box/region geometry evidence
held distance             → exact relationship between two regions/targets
rulers                     → coordinate context
X-ray                      → structural inspection context
annotation note            → durable explicit intent + baseline
```

Rulers/X-ray are context, not automatic design requirements. Annotation notes are intent. Numeric Mesurer data is rendered evidence.

## What an agent should validate

Do not stop at “the CSS looks correct.” Use the rendered result to check claims such as:

### Alignment

- Do intended left/right/top/bottom edges actually line up?
- Are controls vertically centered relative to labels/icons?
- Do cards, headers, sidebars, and content columns share intended anchors?
- Are repeated components using the same dimensions?
- Does a human-placed guide actually cross the edges that should align?

Use target rects, guides, `inspect()` / `inspectAll()`, and compare exact coordinates.

### Spacing

- Is the visible gap actually 8/12/16/24 px as intended?
- Are padding and margin values producing the expected visual rhythm?
- Are repeated gaps consistent rather than merely declared consistently?
- Does a held distance created by the human show the same value after the fix?

Use scoped `visualContext.distances`, box-model fields, and `distance(a, b)`.

### Typography

- Did the expected font actually load?
- Are size, weight, line-height, letter spacing, alignment, and color correct in computed styles?
- Did wrapping change component height/alignment?

Use the `typography` section of target inspections, then confirm composition in the screenshot.

### Layout and responsiveness

- Is a component using the expected flex/grid behavior at the current viewport?
- Are grid tracks/flex directions what the design expects?
- Is content clipping or overflowing?
- Did a responsive breakpoint produce unintended document width?

Use `layout`, `scroll`, and `viewport()`.

### Visual appearance

- Is the actual background/border/radius/shadow/opacity what the agent thinks rendered?
- Does the composition still look balanced once real content is present?

Use `appearance` for computed values and a real screenshot for pixel/compositional judgment.

## Human annotation workflow

When the human saves an annotation, Mesurer records a durable note and immutable baseline for the relevant targets/region/evidence.

Before editing:

```js
const context = await window.__MESURER__.context({ annotation: annotationId })
```

After editing:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` can give exact evidence such as:

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
width: 318px → 320px
baseline guide/measurement/target disappeared → kind="missing"
```

This turns a human's visual note into deterministic rendered acceptance evidence without transporting a message anywhere outside the page.

## Unsaved selection/measurement workflow

If the human only selected and measured things, keep the initial context object in the current agent task and compare after the edit:

```js
await window.__MESURER__.stable()
const current = await window.__MESURER__.context()
```

For focused comparison, use selectors from the initial target inspections:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

Example:

```text
before: cards 37px apart, left-edge delta 4px
after:  cards 24px apart, left-edge delta 0px
```

This is enough to validate many UI fixes without forcing the human to create a formal note.

## Use measurements and screenshots together

Neither signal replaces the other.

**Mesurer answers:**

```text
What did the human select?
Where is it?
How large is it?
What is the exact gap?
What box model did the browser compute?
What font/layout/overflow values are active?
Are repeated elements numerically aligned?
How did the rendered geometry change after the edit?
```

**Screenshots answer:**

```text
Does the composition look balanced?
Is visual hierarchy clear?
Does the design feel crowded or empty?
Are colors and shapes working together?
Does clipping/overlap look visually wrong?
```

A strong design agent uses both rather than guessing measurements from pixels or judging composition from CSS alone.

## Clean screenshot evidence

Mesurer controls can be hidden without hiding visual evidence:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // use the harness's real screenshot primitive
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ scope: "selection" }` for unsaved selection evidence.

The outer harness owns the screenshot. Mesurer only defines capture scope and presentation state.

## Minimal agent iteration

When no annotation baseline is needed:

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

Then take a screenshot through the existing browser harness.

A completion should be evidence-based, for example:

```text
- card left edge: 312px
- heading left edge: 312px
- button/card right gap: 24px
- primary action height: 40px
- document horizontal overflow: false
- computed heading font: Inter, 32px, 700, 40px line-height
- screenshot: no clipping; hierarchy matches requested composition
```

That is stronger than “I set the CSS to the requested values.”

## When to use Mesurer

For an agent with browser access, Mesurer should be the default verification layer for work involving:

- layout;
- spacing;
- alignment;
- sizing;
- typography;
- responsive behavior;
- overflow/clipping;
- visual hierarchy;
- design-system consistency;
- recreating a reference design;
- polishing a page that is technically correct but visually weak;
- diagnosing why a rendered result does not match implementation intent;
- understanding visual issues the human has already marked/measured in the page.

It is not necessary to call every method after every source edit. Measure the parts whose rendered behavior matters to the request.

## Do not destroy review state

If the page already contains Mesurer, agents must use the current instance rather than reinjecting it.

Injected Mesurer defaults to `reuseExisting: true`; explicit replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That is for deliberate HMR/test replacement, not normal human/agent collaboration.

Never change/delete human guides, measurements, held distances, or annotations merely to make validation look successful.

## Users can extend Mesurer by asking their agent

Because the runtime is plugin-based, users can ask for project-specific inspection behavior:

> “Add a Mesurer plugin that checks whether the cards in this dashboard align to an 8 px spacing grid.”

> “Add a Mesurer tool that highlights elements overflowing their containers.”

> “Replace the X-ray tool with one that shows our design-system component names.”

The agent should normally implement these as plugins using `mesurer-solid/core`, not by forking the renderer.

Plugins can contribute tools, commands, hooks, overlays, settings contributions, state slices, services, and disposal behavior.

## Prefer plugins over permanent forks

When a user asks Mesurer to do something project-specific:

1. first ask whether the capability can live in a plugin;
2. use plugin-owned state/services/overlays where possible;
3. modify Mesurer core only when the missing capability is genuinely a platform concern;
4. if core changes are needed, preserve public plugin and agent contracts.

## Example: validating a card grid

Suppose the user says:

> “These cards are messed up. Look at the measurements I made and make them line up.”

A Mesurer-driven agent can:

1. reuse the live Mesurer instance;
2. read workspace + current selection + any annotations;
3. record the human's exact card rects/gaps/guides;
4. inspect relevant source/CSS;
5. edit the implementation;
6. wait for the real render to settle;
7. remeasure the same targets/distances;
8. use `review()` if the human saved a baseline;
9. capture a real screenshot;
10. iterate until exact geometry and visual appearance support the fix.

That turns “make it cleaner” or “look at what is broken” from an ungrounded styling guess into an iterative visual engineering task.

## Suggested instruction for coding agents

Projects that want Mesurer used consistently can include:

> **For meaningful UI/design work, first reuse and read any existing Mesurer state in the page, including the human's selection, guides, measurements, held distances, and annotations. Treat notes as intent and rendered measurements as evidence. After editing, wait for the real page to settle, remeasure/review the affected state, and pair exact geometry with a real browser screenshot before claiming completion. Do not create a separate Mesurer transport, browser, or server when the current harness can evaluate the page directly.**

The repository's own [`AGENTS.md`](../AGENTS.md) follows this rule.
