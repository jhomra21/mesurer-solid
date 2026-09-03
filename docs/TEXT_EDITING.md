# Direct text editing

Mesurer Solid extends Text Inspector with a reversible direct-copy and typography workflow for ordinary rendered text. The feature is designed for a human reviewer to express **what the text should say and look like** while staying on the real page, then let a coding agent implement that intent in normal application source.

This is a Mesurer Solid extension, not a feature inherited from the pinned upstream Mesurer baseline. It deliberately reuses Mesurer's existing Text Inspector typography renderer and the canonical toolbar visual language instead of introducing a second inspector or a separate top-level editing plugin.

## Where direct editing is available

Direct text editing works while either of these page-targeting modes is active:

- **Text Inspector**;
- **Select**.

Arrange keeps Select active, so the normal combined workflow is:

```text
select / arrange an element
        ↓
double-click its text
        ↓
edit copy and typography
        ↓
Enter to keep Desired
        ↓
continue arranging or reviewing
```

There is no separate Text Edit toolbar tool to activate.

## What can be edited

The current contract intentionally targets ordinary page elements with one non-empty **direct text node** under the pointer. It is meant for labels, buttons, headings, paragraphs, badges, and similar rendered copy.

Mesurer does not take over native editing for:

- `<input>`;
- `<textarea>`;
- `<select>` / `<option>`;
- `contenteditable` elements;
- media/embedded elements such as images, video, audio, and iframes;
- mixed/nested rich-text structures that do not resolve to one unambiguous direct text node.

Those boundaries are deliberate. Link creation, numbered/bulleted lists, generic rich-text editing, and form editing are not exposed as decorative controls. Adding those would require a structural intent model rather than pretending they are ordinary typography changes.

## Human interaction

### Open the editor

On desktop, **double-click** editable direct text. On touch or pen, **double-tap** the same text.

Mesurer places a textarea over the rendered text using the target's current computed typography and visual geometry. The current text is selected from start to finish, so the next keystroke replaces it immediately.

The editor inherits the target's current rendered:

- font family;
- font size;
- font weight;
- font style;
- line height;
- letter spacing;
- text alignment;
- text transform;
- text decoration;
- text color;
- padding and border radius;
- effective page background behind the text.

Typing previews directly on the real rendered target.

### Text Inspector information appears automatically

Opening direct editing also shows Text Inspector information for that exact target. The transient card uses the existing Text Inspector typography renderer and currently reports:

- **Family**;
- **Size**;
- **Weight**;
- **Line**;
- **Tracking**;
- the target tag/text snippet;
- matching CSS variable names when Text Inspector can resolve them.

The card updates while the edit session is active, so changing typography or copy does not leave a stale inspector snapshot.

This automatic card does **not** globally switch Mesurer into Text Inspector mode, create a persistent pin, or disable Arrange. It is contextual information attached only to the active direct-edit session.

### Compact formatting toolbar

The default edit bar intentionally stays compact and follows the same visual language as the main Mesurer toolbar. It exposes only:

- **B** — Bold;
- **I** — Italic;
- **U** — Underline;
- **Text ▾** — typography/style menu.

The floating surface uses Mesurer's white toolbar treatment, compact spacing, rounded controls, normal shadow, and blue active states. Detailed typography no longer expands the default toolbar with several always-visible selects.

While the editor owns focus, the usual formatting shortcuts work without triggering Mesurer tools:

- `Cmd/Ctrl+B` — Bold;
- `Cmd/Ctrl+I` — Italic;
- `Cmd/Ctrl+U` — Underline.

### Text menu and semantic presets

Open **Text ▾** for typography choices. The top of the menu contains semantic presets derived from the page:

- **Text**;
- **Heading 1** when a visible direct-text `<h1>` exists;
- **Heading 2** when a visible direct-text `<h2>` exists;
- **Heading 3** when a visible direct-text `<h3>` exists.

Mesurer does not invent heading levels that the rendered page does not use.

Each preset represents the **dominant rendered typography bundle** Mesurer observes for that semantic level. A bundle includes:

- font family;
- font size;
- font weight;
- font style;
- line height;
- letter spacing;
- text transform;
- color.

For **Text**, Mesurer derives the dominant ordinary body-text bundle from visible direct-text paragraph/span usage. For H1/H2/H3, it derives the dominant bundle among visible direct-text headings of that level. This matters on pages that contain several visual variants of the same heading level: the semantic preset stays canonical rather than depending on one special variant.

A non-dominant variant is not discarded. The lower part of the same menu still exposes page-derived:

- **Font** choices;
- **Size** choices;
- **Weight** choices;
- common text-color swatches;
- a custom color picker.

So a page can have a canonical Heading 2 preset while still allowing a reviewer to pick a special display font, size, weight, or color that appears elsewhere on the page.

Preset shortcuts are available while the editor has focus:

| Preset | macOS | Other platforms |
| --- | --- | --- |
| Text | `Option+Cmd+0` | `Alt+Ctrl+0` |
| Heading 1 | `Option+Cmd+1` | `Alt+Ctrl+1` |
| Heading 2 | `Option+Cmd+2` | `Alt+Ctrl+2` |
| Heading 3 | `Option+Cmd+3` | `Alt+Ctrl+3` |

A shortcut only applies a heading level that exists in the current page-derived catalog.

The page-derived choices are based on **rendered styles**, not an arbitrary Mesurer preset list and not a source-code token scanner. The current target value is retained as an option even when it is not one of the page's most common values.

Choosing a rendered-page value is useful human intent, but it does not imply that production source should receive the sampled computed value as an inline style. A coding agent should still find the appropriate class, CSS variable, theme token, component prop, or stylesheet rule when one exists.

### Commit and cancel

- **Enter** keeps the current edit as Desired intent.
- **Shift+Enter** inserts a newline in the textarea instead of committing.
- **Escape** closes the Text menu first when it is open; pressing Escape again cancels the editing session and restores the text/style state that existed when that session opened.
- Clicking outside the active editor/formatting surfaces commits the current session.

Keyboard shortcuts such as `S`, `A`, `G`, and other Mesurer tool shortcuts are suppressed while the editor owns keyboard focus, so typing normal text cannot accidentally activate Mesurer tools.

## Before, Desired, and Live

Direct text editing is a reversible visual specification. It does not pretend to edit application source.

Each saved intent records:

```text
Before
  original direct text
  original relevant computed style values

Desired
  requested direct text
  requested text/style deltas
```

While Select or Text Inspector is active, Mesurer may preview the saved Desired copy/style on the rendered target. That preview participates in Mesurer history and persists with plugin state.

When the previewing page-targeting mode is inactive, Mesurer restores the source-rendered value it still owns. This distinction is important for agent verification: a coding agent must not look at Mesurer's Desired preview and mistake it for a source-code implementation.

Mesurer also avoids fighting the host application. If the application changes a text/style value itself, Mesurer relinquishes ownership rather than blindly overwriting a new source-rendered value.

## Agent API

When the agent bridge is enabled and direct text editing is available, capabilities includes:

```text
textEdit
```

The corresponding methods are:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(edits.at(-1).id)
```

A resolved intent contains:

```text
id
createdAt
pageUrl
selector
nodeIndex
before
desired
styles[]
  property
  before
  desired
```

Supported style-delta properties currently include:

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

Agents should treat these values as **human visual intent**, not production implementation instructions.

For example:

```text
Human Desired
  text: "Start free trial"
  font-family: Inter
  font-weight: 700
  color: rgb(...)

Good source implementation
  <Button class="cta-primary">Start free trial</Button>
  theme/font/token changes where appropriate

Bad source implementation
  blindly copy Mesurer's temporary inline preview styles
```

## Agent verification workflow

For a broad request such as “check Mesurer context,” saved text edits are one of the human-intent channels that must be inventoried before source changes:

```js
const capabilities = window.__MESURER__.capabilities().capabilities
const textEdits = capabilities.textEdit
  ? await window.__MESURER__.textEdits()
  : []

const textEditIntents = await Promise.all(
  textEdits.map((edit) => window.__MESURER__.textEdit(edit.id)),
)
```

Before editing source, retain the relevant intent id, target selector, Before/Desired text, and style deltas.

After editing source:

1. wait for the application render to stabilize;
2. keep the saved text-edit intent;
3. deactivate the Select/Text Inspector preview without clearing history;
4. inspect the target's real rendered text and computed typography;
5. compare the real Live result with Desired;
6. reactivate Select only if further visual review is useful.

A correct implementation survives with Mesurer's preview inactive.

## Working with Arrange

Arrange and direct text editing are complementary human-intent channels:

```text
Arrange
  Before/Desired geometry

Text edit
  Before/Desired copy + typography/style deltas
```

A reviewer can move a component, edit its label, change its typography, and then simply ask an agent to “check Mesurer context.” The Agent Skill treats those channels as one visual message and should implement both semantically in source.

Do not clear Arrange history to work on text, and do not clear text-edit history to verify Arrange. Preserve both until their relevant evidence has been consumed.

See [`ARRANGE.md`](./ARRANGE.md) for the layout-intent workflow and [`CONTEXT_WORKFLOW.md`](./CONTEXT_WORKFLOW.md) for combined human/agent context handling.

## Runtime ownership

The direct-edit runtime is installed by Mesurer's renderer bridge rather than as a competing top-level plugin. Internally it owns:

- text-edit intent state/history;
- direct double-click/double-tap targeting;
- the in-place textarea session;
- the compact formatting toolbar and Text menu;
- page-derived style/preset discovery;
- reversible text/style preview ownership;
- the `text-edit` service consumed by the public agent bridge.

For presentation it deliberately reuses:

- the canonical Mesurer toolbar surface language;
- `TypographyInspector` for typography data;
- the existing Text Inspector card renderer for the automatic information card.

That keeps typography interpretation shared while avoiding hidden ownership between the Text Inspector tool runtime and the direct-edit runtime.

## Validation contract

The repository's rendered browser contract covers the complete interaction through active Arrange/Select state. It verifies, in a real Chromium page:

- double-click opens the editor through the Arrange interaction surface;
- the current text is fully selected;
- editor typography matches the target;
- the formatting surface follows Mesurer toolbar geometry/appearance;
- the default toolbar is compact: B/I/U/Text;
- automatic Text Inspector information is visible for the edited field;
- Text/H1/H2/H3 availability follows visible rendered semantic usage;
- Heading presets apply the dominant rendered bundle for their level;
- non-dominant typography variants remain available in detailed choices;
- page-derived font/size/weight/color values are available;
- Bold/Italic/Underline work and remain reversible;
- custom color works;
- the Text Inspector card updates with live changes;
- Enter commits Desired state;
- disabling the preview exposes the real source-rendered Before state;
- re-enabling Select restores Desired preview;
- the editor, menu, and transient inspector card clean up together;
- no page or console errors are introduced.

Focused renderer tests separately cover dominant body/heading preset selection, absent heading levels, preserved page variants, reversible intent, source ownership, and native-editable exclusions.

The package-smoke suite separately protects the public `textEdit` capability and `textEdits()` / `textEdit()` API surface.
