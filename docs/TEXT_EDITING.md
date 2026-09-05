# Direct text editing and Typography

Mesurer can preview copy and typography changes directly on the rendered page. Those changes are reversible visual intent; they do not edit application source.

The visible inspection tool is **Typography**. Its internal built-in id remains `text-inspector` for compatibility.

## Start an edit

Direct editing works while Select or Typography is active. Arrange keeps Select active, so the same interaction also works while arranging.

Double-click ordinary direct text on desktop, or double-tap it with touch or pen. Mesurer places an editor over the rendered target, matches its current typography, and selects the existing text so typing replaces it immediately.

When editing starts, Typography becomes contextually active for that field without replacing Select. If Typography was already explicitly selected, Mesurer suppresses the older hover/pinned Typography surface for the duration of the edit so there is only one live card for the field. Closing the edit restores the normal Typography surface and leaves the explicitly selected tool active.

The direct-edit card reports the current Family, Size, Weight, Line, Tracking, target/text information, and CSS-variable references when available.

## Editable targets

Mesurer targets an ordinary element with one unambiguous, non-empty direct text node. It does not take over:

- `<input>`, `<textarea>`, `<select>`, or `<option>`;
- media and embedded elements;
- ambiguous mixed/nested rich text;
- content that is natively editable through `contenteditable` inheritance.

The editability check follows browser semantics. A child of `contenteditable="true"`, `contenteditable=""`, or `contenteditable="plaintext-only"` stays under native editing even when the child itself has no attribute. A nested `contenteditable="false"` boundary ends that inherited editable region; a descendant inside that boundary can use Mesurer direct editing when the normal target rules pass.

This boundary is intentional. Mesurer does not expose link creation, lists, or other structural rich-text controls until there is a real structural intent model for them.

## Formatting

The editor exposes the common controls directly:

- Bold, Italic, Underline;
- page-derived Font, Size, and Weight values;
- common rendered-page text colors and a custom color control;
- a separate Text/Heading semantic preset control.

The semantic popup contains Text and only the H1/H2/H3 levels that are actually rendered on the page. Each row uses the dominant rendered typography bundle for that semantic level rather than an arbitrary Mesurer preset. Less common page variants remain available through the direct Font, Size, Weight, and Color controls.

Formatting shortcuts work while the editor owns focus:

| Action | Shortcut |
| --- | --- |
| Bold | `Cmd/Ctrl+B` |
| Italic | `Cmd/Ctrl+I` |
| Underline | `Cmd/Ctrl+U` |
| Text | `Option+Cmd+0` on macOS, `Alt+Ctrl+0` elsewhere |
| Heading 1 | `Option+Cmd+1` / `Alt+Ctrl+1` |
| Heading 2 | `Option+Cmd+2` / `Alt+Ctrl+2` |
| Heading 3 | `Option+Cmd+3` / `Alt+Ctrl+3` |

An unavailable heading shortcut does nothing instead of inventing a style.

## Commit and cancel

- Enter keeps the current copy/style as Desired intent.
- Shift+Enter inserts a newline.
- Escape closes the semantic popup first when it is open; Escape again cancels the edit session.
- Clicking outside the editor and its formatting surfaces commits the session.

Normal Mesurer tool shortcuts are suppressed while the editor owns keyboard focus.

## Before, Desired, and Live

Each saved edit records the original target and the requested result:

```text
Before
  original direct text
  original relevant style values

Desired
  requested direct text
  requested style deltas
```

Mesurer may show Desired on the real target while Select or Typography is active. The preview participates in Mesurer history and persistence, but the application source remains unchanged.

Undo and redo are ownership-aware. Suppose Mesurer changes `Original → First → Second` and undo restores the intent to `First`. If the DOM still contains Mesurer's previously owned `Second`, Mesurer updates it to `First`. Redo moves it back to `Second` by the same rule.

Text styles use the same ownership model. If Mesurer still owns `font-size: 24px`, undo can restore its previous Desired `20px`. Inline style priority is part of that ownership check.

Mesurer does not fight the application. If the host changes the text or an inline style while a preview is active, the current value no longer matches what Mesurer owns. Mesurer then relinquishes ownership and preserves the host-authored value through later history changes and cleanup.

Clearing the intent, disabling its preview, or disposing Mesurer restores the original value only while Mesurer still owns the current preview. A newer host value is left alone.

## Agent API

With the agent bridge enabled, saved edits are available through `textEdit`:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(edits.at(-1).id)
```

An intent includes target identity, Before/Desired copy, and style deltas such as:

```text
font-family
font-size
font-weight
font-style
line-height
letter-spacing
text-transform
color
text-decoration-line
```

These values are visual requirements, not source-level instructions. An agent should implement the outcome with the application's component props, classes, theme values, CSS variables, design tokens, or stylesheet rules where appropriate.

## Verify an implementation

Before editing source, retain the relevant intent and its Before/Desired values. After changing the application:

1. Wait for the real render to settle.
2. Keep the saved intent but disable its Desired preview.
3. Read the target's Live text and computed typography.
4. Compare Live with Desired.

A correct source implementation still matches after the temporary Mesurer preview is inactive.

When Arrange intent exists for the same task, preserve both channels. Arrange owns geometry intent; text editing owns copy and typography intent. A broad request to check Mesurer context should consume both before source changes.

## Runtime ownership

Direct editing is installed by the renderer bridge and owns its text-edit state/history, targeting, editor session, page-derived typography catalog, reversible preview ownership, and `text-edit` service.

The presentation layer owns the field editor, formatting controls, semantic popup, and contextual Typography card. It reuses the same Typography inspector/card primitives as the normal tool rather than creating a second inspection model.

## Validation

Repository tests cover text and style undo/redo, host-authored changes, cleanup, inherited editable regions, nested `contenteditable="false"`, contextual Typography behavior, Arrange coordination, and browser editing in Chromium. Package smoke tests protect the public `textEdit` capability and `textEdits()` / `textEdit()` APIs.

See [Arrange](./ARRANGE.md) for layout intent and [Context workflow](./CONTEXT_WORKFLOW.md) for combined human/agent review.
