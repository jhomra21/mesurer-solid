# Direct text editing and Typography

Mesurer can preview copy and typography changes directly on the rendered page. These changes are reversible Desired intent; they do not edit application source.

The visible inspection tool is **Typography**. Its internal built-in id remains `text-inspector` for compatibility.

## Start editing

Direct editing works while Select or Typography is active. Arrange keeps Select active, so the same interaction also works while arranging.

Double-click ordinary direct text on desktop, or double-tap with touch or pen. Mesurer places an editor over the rendered target, matches its current typography, and selects the existing text so typing replaces it immediately.

When editing begins from Select or Arrange, Typography becomes contextually active for that field without replacing Select. If Typography was already explicitly selected, the normal hover/pinned Typography surface is temporarily suppressed so the field has one live card. Ending the edit restores the normal Typography surface and keeps the explicitly selected tool active.

The contextual card reports Family, Size, Weight, Line, Tracking, target/text information, and CSS-variable references when available.

## What can be edited

Mesurer targets an ordinary element with one unambiguous, non-empty direct text node. It leaves these under browser/application control:

- `<input>`, `<textarea>`, `<select>`, and `<option>`;
- media and embedded elements;
- ambiguous mixed or nested rich text;
- content that is natively editable through `contenteditable` inheritance.

Editability follows browser semantics. Descendants of `contenteditable="true"`, `contenteditable=""`, or `contenteditable="plaintext-only"` stay native even when the descendant has no attribute. A nested `contenteditable="false"` boundary ends that inherited editable region; text inside that boundary can use Mesurer editing when the normal direct-text rules pass.

Mesurer does not expose link creation, lists, or other structural rich-text controls until there is a real structural intent model for them.

## Formatting

The editor exposes direct controls for:

- Bold, Italic, and Underline;
- page-derived Font, Size, and Weight values;
- common rendered-page text colors plus a custom color;
- a separate Text/Heading semantic preset.

The semantic popup contains Text and only the H1/H2/H3 levels actually rendered on the page. Each preset uses the dominant rendered typography bundle for that semantic level. Less common variants stay available through the direct Font, Size, Weight, and Color controls.

| Action | Shortcut |
| --- | --- |
| Bold | `Cmd/Ctrl+B` |
| Italic | `Cmd/Ctrl+I` |
| Underline | `Cmd/Ctrl+U` |
| Text | `Option+Cmd+0` on macOS, `Alt+Ctrl+0` elsewhere |
| Heading 1 | `Option+Cmd+1` / `Alt+Ctrl+1` |
| Heading 2 | `Option+Cmd+2` / `Alt+Ctrl+2` |
| Heading 3 | `Option+Cmd+3` / `Alt+Ctrl+3` |

A heading shortcut does nothing when that level is unavailable.

## Keep or cancel an edit

- **Enter** keeps the current copy/style as Desired intent.
- **Shift+Enter** inserts a newline.
- **Escape** closes the semantic popup first when it is open; Escape again cancels the edit.
- Clicking outside the editor and its formatting surfaces commits the session.

Normal Mesurer tool shortcuts are suppressed while the editor owns keyboard focus.

## Desired preview and ownership

Each saved edit records the original target, Before text, Desired text, and requested style deltas. Mesurer may preview Desired on the real target while Select or Typography is active, but application source remains unchanged.

Undo and redo update the rendered preview only while Mesurer still owns the current value. If Mesurer changed `Original → First → Second`, undo can move the DOM from `Second` back to `First` when `Second` is still the value Mesurer applied. Style ownership uses the same rule and includes inline priority.

If the application changes the text or inline style itself, Mesurer relinquishes ownership and leaves that host-authored value alone through later history changes, cleanup, or disposal.

## Agent API

With the agent bridge enabled:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(edits.at(-1).id)
```

An intent includes target identity, Before/Desired copy, and style deltas such as font family, size, weight, style, line height, letter spacing, text transform, color, and text decoration.

Treat these values as visual requirements, not source-level instructions. Implement the result with the application's components, classes, design tokens, theme values, CSS variables, or stylesheet rules where appropriate.

## Verify the source result

Before editing source, retain the relevant intent. After the application renders:

1. Wait for Mesurer to settle.
2. Keep the intent, but make sure its Desired preview is inactive.
3. Read the target's Live text and computed typography.
4. Compare Live with Desired.

A correct implementation still matches after Mesurer's temporary preview is removed.

If the same task also has Arrange intent, preserve both channels: Arrange owns geometry intent; direct text editing owns copy and typography intent.

See [Arrange](./ARRANGE.md), [Context](./CONTEXT_WORKFLOW.md), and [Architecture](../ARCHITECTURE.md) for the surrounding runtime and agent contracts.
