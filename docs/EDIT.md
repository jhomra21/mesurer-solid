# Edit

Edit is Mesurer's page-editing mode. It lets a person move HTML elements, edit direct text, and change text styling on the rendered page without writing application source.

Select remains the inspection mode. Typography stays in Select and reports the text and computed styles already rendered by the page. Text input, font changes, text color, formatting, and layout movement belong to Edit.

Context and Codex remain visible in both modes.

## Enable Edit

Edit is a default first-party plugin in normal `mountMesurer()` usage. When you provide an explicit plugin list, add `edit()`:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, edit } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [context(), edit()],
})
```

`arrange()` remains available as a compatibility alias. Existing `mesurer.arrange.*` state ids, persisted intent, services, and agent methods keep their current names.

## Switch modes

Use the mode switch at the left of the toolbar:

- **Select** or `1` opens inspection tools.
- **Edit** or `2` opens editing tools.

The switch follows upstream Mesurer's grouped-toolbar structure and styling. Select keeps the upstream inspection icon; Edit intentionally uses Mesurer Solid's movement glyph, and its chevron opens Edit options without changing modes. Mesurer Solid keeps toolbar motion at 150 ms.

The legacy `Shift+A` shortcut still enters Edit as a compatibility shortcut.

Selecting a Select-only tool such as X-ray, Typography, Color Picker, Screenshot, or Recording leaves Edit first. Rulers, ordinary Guides, and Layout Guides stay visible and usable in Edit, so alignment evidence can be adjusted without leaving the editing lane. Context and Codex also remain visible in both modes.

## Move elements

Edit uses the movement model retained by the Arrange compatibility layer. Select one or more HTML elements and drag the Edit selection box to the desired position.

Edit can start before a selection exists. Entering Edit enables Select as its targeting prerequisite and preserves an existing selection. Hold Shift while selecting page elements to add or remove targets.

A selected element with its own movement gets a **Reset position** control. **Edit options** also includes **Reset all positions** for the current page.

Hold Shift while dragging to lock movement to the dominant axis. One completed drag creates one history entry. Repeated drags start from the current Desired position.

SVG elements remain selectable and measurable, but Edit does not apply movement transforms to them.

## Edit text and typography

Double-click an editable direct text run while Edit is active. The inline editor and Typography editing card let you change:

- text content;
- font family, size, and weight;
- line height and letter spacing;
- bold, italic, and underline;
- text color, including a custom color;
- available Text and H1/H2/H3 presets.

The Typography tool in Select is inspection-only. It does not open the direct editor or reveal saved Desired text by itself.

Mesurer edits one unambiguous non-empty direct text run at a time. It does not take over native form controls, inherited `contenteditable` regions, or structural rich-text markup.

See [Direct text editing and Typography](./TEXT_EDITING.md) for the text ownership and keyboard contracts.

## Snapping

**Edit options** and Settings expose the movement preferences:

- Snapping
- Element edges
- Element centers
- Guides
- Prefer X-ray edges
- Alignment rulers

X and Y are evaluated independently. Multi-selection snaps the group bounding box and applies one rendered delta to all selected targets. Nested selected targets keep movement relative to the nearest moved ancestor.

When X-ray is visible and **Prefer X-ray edges** is enabled, visible X-ray boxes are valid snap targets.

## Before, Desired, and Live

Edit movement keeps the existing compatibility schema:

- **Before** is the geometry or text before a saved edit.
- **Desired** is the human-edited result.
- **Live** is the application page with Mesurer's temporary preview removed.

While Edit is active, saved Desired movement and text/style intent are shown. Returning to Select restores the original page presentation by default without deleting the saved intent.

Settings has two independent presentation switches:

- **Keep Edit changes** keeps saved movement visible outside Edit.
- **Keep text changes** keeps saved text and typography visible outside Edit.

Both settings affect presentation only. They do not write application source or remove intent.

## Ownership

Edit movement restores a previous inline transform only while the element still contains the exact preview value and priority Mesurer applied. If the application changes that transform, Mesurer preserves the application value.

Text and style editing use the same ownership rule. Mesurer updates or restores a value only while it still owns the value currently rendered by the element.

Changing text on a moved live element does not reset its position. Edit keeps ownership of the exact live element while it remains connected. Reload and replacement rebinding still use strict target identity.

## Agent API

The browser agent keeps the existing Arrange method names for compatibility:

```js
const intents = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(intents.at(-1).id)

await window.__MESURER__.showArrange(intent.id, "before")
await window.__MESURER__.showArrange(intent.id, "desired")
await window.__MESURER__.showArrange(intent.id, "live")

const review = await window.__MESURER__.reviewArrange(intent.id)
```

Direct text/style intent remains available through `textEdits()` and `textEdit(id)`.

Application code can use the canonical `edit()` plugin factory and the `MesurerEditService` type. The service is still registered under the existing `arrange` service id so older integrations keep working.

## Implement and review

Desired records the rendered result, not a source-code prescription. Implement the result using the application's components, layout rules, tokens, variables, or styles.

After changing source, compare the real page with the saved intent:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")
const review = await window.__MESURER__.reviewArrange(intent.id)
```

For text changes, compare Live text and computed typography with the temporary text preview inactive.

See [Context](./CONTEXT_WORKFLOW.md) for combined review and [Browser and agent integration](./BROWSER_HARNESS.md) for the full agent API.
