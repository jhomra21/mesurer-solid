# Direct text editing and Typography

Mesurer can preview copy and typography changes directly on the rendered page. These changes are reversible Desired intent; they do not edit application source.

The visible inspection tool is **Typography**. Its internal built-in id remains `text-inspector` for compatibility.

## Start editing

Direct editing works while Select or Typography is active. Arrange keeps Select active, so the same interaction also works while arranging.

Double-click ordinary direct text on desktop, or double-tap with touch or pen. Mesurer keeps the rendered host element as the visible editing surface, selects the existing text so typing replaces it immediately, and shows a blinking caret at the host text position once the selection collapses.

When editing begins from Select or Arrange, Typography becomes contextually active for that field without replacing Select. If Typography was already explicitly selected, the normal hover/pinned Typography surface is temporarily suppressed so the field has one live card. Ending the edit restores the normal Typography surface and keeps the explicitly selected tool active.

That one contextual card is also the direct formatting surface. Family, Size, Weight, Line, and Tracking are live controls; Format contains Bold, Italic, and Underline; Color contains rendered-page swatches plus a custom color; and Style opens the available Text/Heading presets inside the same card. The card stays visible during the edit and is initially positioned around the active text without covering it. When full-height placement is impossible in a constrained viewport, the card uses the available lane and scrolls internally rather than disappearing below the viewport or obscuring the field.

Typography has two deliberately separate ownership rules. **Interaction ownership belongs to Mesurer:** the card and its controls are inspector UI, never inspectable page content, and form a hard hit-test boundary so clicking or double-clicking them cannot select the card itself or retarget page content underneath. **Geometry ownership belongs to the inspected text:** while the source is visible the card is placed around that source, then scrolls with it; when the source leaves the viewport the contextual card leaves with it instead of remaining as unrelated viewport furniture. The global toolbar and its Settings surface remain viewport-owned UI.

## What can be edited

Mesurer edits one unambiguous non-empty **direct text run** at a time. A simple element with one direct text node is editable as before. For mixed inline copy such as `text <kbd>Shift+A</kbd> text`, Mesurer can target the direct text run under the pointer while preserving the inline child and the other text runs unchanged.

It leaves these under browser/application control:

- `<input>`, `<textarea>`, `<select>`, and `<option>`;
- media and embedded elements;
- structural or ambiguous rich-text editing that would require changing nested markup rather than one direct text run;
- content that is natively editable through `contenteditable` inheritance.

Editability follows browser semantics. Descendants of `contenteditable="true"`, `contenteditable=""`, or `contenteditable="plaintext-only"` stay native even when the descendant has no attribute. A nested `contenteditable="false"` boundary ends that inherited editable region; text inside that boundary can use Mesurer editing when the normal direct-text-run rules pass.

Mesurer does not expose link creation, lists, node insertion/removal, or other structural rich-text controls until there is a real structural intent model for them. Editing text around an existing inline child does not flatten, remove, or recreate that child.

## Formatting

The interactive Typography card exposes:

- Bold, Italic, and Underline;
- page-derived Family, Size, and Weight values;
- editable Line height and Tracking / letter spacing values;
- common rendered-page text colors plus a custom color;
- Text and the available H1/H2/H3 semantic presets inside the Style section.

The semantic preset section contains Text and only the H1/H2/H3 levels actually rendered on the page. Each preset uses the dominant rendered typography bundle for that semantic level. Less common variants stay available through the direct Family, Size, Weight, and Color controls. Line and Tracking accept valid CSS values and preview them on the real target using the same reversible style-intent ownership as the other controls.

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

- **Enter** in the text editor keeps the current copy/style as Desired intent.
- **Shift+Enter** inserts a newline in the text editor.
- **Escape** closes the currently open Typography dropdown first; Escape again cancels the edit.
- Clicking outside the editor and the interactive Typography card commits the session.

Normal Mesurer tool shortcuts are suppressed while the editor owns keyboard focus. Interacting with a control inside the Typography card keeps the same edit session active.

## Original vs Desired presentation

Saving an edit and showing it on the page are separate decisions. The saved intent is retained even when Mesurer temporarily shows the original page value.

By default, **Keep text changes is OFF**:

- while **Typography** owns the presentation, saved Desired copy/style is shown;
- when you return to **Select** or another tool, the original page presentation is restored;
- switching back to Typography shows the saved Desired presentation again;
- this presentation switch does not delete the saved edit or its history.

To keep saved text/style changes visible outside Typography, open **Settings** with the gear button or `Cmd/Ctrl+,`, choose **General**, and turn on **Keep text changes**. The setting is persisted. Turning it off restores the normal tool-owned behavior without deleting the saved intent.

Arrange has the matching **Keep Arrange changes** switch in the same General panel; see [Arrange](./ARRANGE.md).

## Desired preview and ownership

Each saved edit records the original target, Before text, Desired text, and requested style deltas. Desired presentation is tool-owned by default as described above; application source remains unchanged in either presentation.

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