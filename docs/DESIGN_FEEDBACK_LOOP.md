# Mesurer design feedback loop

Mesurer is most useful when it stays in the loop while a UI is being built, not when it is opened once at the end as a debugging accessory.

The operating principle is:

> **The rendered page is the source of truth. CSS intent is not proof of the rendered result.**

A stylesheet can say `display: flex`, `gap: 16px`, or `align-items: center` while the actual page still looks wrong because of intrinsic sizing, inherited styles, transforms, fonts, wrapping, scrollbars, responsive rules, unexpected parents, or neighboring components. An agent should validate what the browser actually rendered.

## Default workflow for agent-driven UI work

For every meaningful visual change:

```text
user asks for a UI/design change
        ↓
agent edits the implementation
        ↓
real application renders / HMR settles
        ↓
Mesurer.stable()
        ↓
Mesurer.feedback([...important selectors])
        ↓
outer harness takes a screenshot
        ↓
agent compares measurements + pixels to the requested design
        ↓
agent fixes discrepancies
        ↓
repeat until the rendered result matches the claim
```

Mesurer supplies the numeric/structural side of that loop. The outer browser harness supplies interaction and screenshots.

## What an agent should validate

Do not stop at “the CSS looks correct.” Use the rendered result to check claims such as:

### Alignment

- Do intended left/right edges actually line up?
- Are controls vertically centered relative to their labels/icons?
- Do cards, headers, sidebars, and content columns share the intended anchors?
- Are repeated components using the same dimensions?

Use `inspect()` / `inspectAll()` rects and compare `left`, `right`, `top`, `bottom`, width, height, and center positions.

### Spacing

- Is the visible gap actually 8/12/16/24 px as intended?
- Are padding and margin values producing the expected visual rhythm?
- Are repeated gaps consistent rather than merely declared consistently?

Use box-model fields plus `distance(a, b)`.

### Typography

- Did the expected font actually load?
- Are size, weight, line-height, letter spacing, alignment, and color correct in computed styles?
- Did wrapping change a component's height or alignment?

Use the `typography` section of element inspections, then confirm composition in the screenshot.

### Layout and responsiveness

- Is a component using the expected flex/grid behavior at the current viewport?
- Are grid tracks/flex directions what the design expects?
- Is content clipping or overflowing?
- Did a responsive breakpoint produce an unintended document width?

Use `layout`, `scroll`, and `viewport()`.

### Visual appearance

- Is the actual background/border/radius/shadow/opacity what the agent thinks it rendered?
- Does the composition still look balanced once all real content is present?

Use `appearance` for computed values and the screenshot for pixel/compositional judgment.

## Minimal agent iteration

```js
await window.__MESURER__.stable();

const feedback = await window.__MESURER__.feedback([
  "header",
  "nav",
  "main",
  "[data-testid='primary-card']",
  "[data-testid='primary-action']",
]);
```

Then take a screenshot through the existing browser harness.

The agent should be able to explain its visual conclusion with evidence such as:

```text
- card left edge: 312 px
- heading left edge: 312 px
- button/card right gap: 24 px
- primary action height: 40 px
- document horizontal overflow: false
- computed heading font: Inter, 32 px, 700, 40 px line-height
- screenshot: no clipping; visual hierarchy matches requested composition
```

That is stronger than “I set the CSS to the requested values.”

## When to use Mesurer

For an agent that has browser access, Mesurer should be the default verification layer for work involving:

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
- diagnosing why a rendered result does not match the implementation's apparent intent.

It is not necessary to call every Mesurer method after every source edit. The rule is to measure the parts whose rendered behavior matters to the user's request.

## Use measurements and screenshots together

Neither signal replaces the other.

**Mesurer answers:**

```text
Where is it?
How large is it?
What is the actual gap?
What box model did the browser compute?
What font/layout/overflow values are active?
Are repeated elements numerically aligned?
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

## Users can extend Mesurer by asking their agent

A user does not need to understand Mesurer internals to customize it. Because the runtime is plugin-based, a useful interaction is simply:

> “Add a Mesurer plugin that checks whether the cards in this dashboard align to an 8 px spacing grid.”

or:

> “Add a Mesurer tool that highlights elements overflowing their containers.”

or:

> “Replace the X-ray tool with one that shows our design-system component names.”

or:

> “Add a command that measures all toolbar buttons and reports inconsistent heights.”

The agent should normally implement these as plugins using `@jhomra21/mesurer-solid/core`, not by forking the renderer.

Plugins can contribute:

```text
tools
commands
hooks
overlays
settings contributions
state slices
services
disposal behavior
```

They can be passed at mount time or loaded/replaced while Mesurer is running.

```ts
await mounted.ready;
await mounted.pluginHost?.load(myAuditPlugin);
await mounted.pluginHost?.replace(nextAuditPlugin);
mounted.pluginHost?.remove("my.audit.plugin");
```

If a plugin replaces a built-in slot, the stable `builtin.*` command and conventional shortcut can continue to address that capability.

## Prefer plugins over permanent forks

When a user asks Mesurer to do something project-specific:

1. first ask whether the capability can live in a plugin;
2. use plugin-owned state/services/overlays where possible;
3. modify Mesurer core only when the missing capability is genuinely a platform concern;
4. if a core change is needed, preserve the public plugin and agent contracts.

This keeps Mesurer reusable while allowing each project or agent harness to grow its own inspection vocabulary.

## Example: validating a card grid

Suppose the user asks:

> “Make these six cards feel cleaner and make sure everything lines up.”

A weak agent can edit CSS until the source looks plausible.

A Mesurer-driven agent can instead:

1. inspect all six card rects with `inspectAll()`;
2. verify equal widths/heights where intended;
3. measure row/column gaps;
4. inspect each card's padding;
5. compare title/baseline/CTA alignment;
6. check document and card overflow;
7. take the screenshot and judge visual balance;
8. change the implementation;
9. remeasure the exact same selectors;
10. report the before/after evidence.

That turns “make it cleaner” from an ungrounded styling guess into an iterative visual engineering task.

## Suggested instruction for coding agents

Projects that want Mesurer used consistently can include this instruction:

> **For meaningful UI/design changes, validate the rendered result with Mesurer before claiming completion. Wait for the page to settle, measure the relevant elements, check alignment/spacing/overflow/computed styles, and pair those measurements with a browser screenshot. Treat the rendered browser state—not the source CSS—as the final source of truth. If Mesurer lacks a project-specific inspection capability, prefer adding a Mesurer plugin rather than guessing or forking the tool.**

The repository's own [`AGENTS.md`](../AGENTS.md) follows this rule.
