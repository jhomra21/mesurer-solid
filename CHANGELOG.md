# Changelog

Notable user-facing changes to Mesurer Solid are recorded here. Add upcoming changes under **Unreleased**; the release workflow moves them into the versioned section when it prepares a release PR.

## Unreleased

<!-- Add user-facing changes here before preparing a release. -->

## 0.1.7-beta.3 - 2026-09-09

- No user-facing changes.

## 0.1.7-beta.2 - 2026-09-09

- Keep plugin-owned persisted settings durable across immediate page reload/navigation, including the default `mesurer-plugin-settings` namespace used when no `persistKey` is provided.

## 0.1.7-beta.1 - 2026-09-09

- Keep direct text editing visually anchored to the rendered host element: the keyboard textarea stays transparent at the host's exact bounds, a subtle inset ring marks edit state, the initially selected text is visibly highlighted for immediate replacement, a blinking caret follows collapsed selections, and text runs around inline markup such as shortcut badges remain editable without flattening those children.
- Unify contextual Typography information and direct formatting into one always-visible interactive inspector. Family, Size, Weight, Line, and Tracking become live controls alongside Bold/Italic/Underline, rendered-page and custom colors, and Text/Heading presets; the old second floating text toolbar/menu no longer renders as a competing surface, and the unified inspector repositions or constrains itself within available viewport space rather than covering the active edit field.
- Keep selected and inspected element chrome locked to its host while scrolling instead of easing or catching up after the page moves; direct-edit rings follow the same frame-locked geometry.

## 0.1.7-beta.0 - 2026-09-06

- Add a persisted global **Shortcuts** switch under Settings → General, defaulting on and available as `shortcutsEnabled`. Turning it off gates built-in and plugin shortcuts while leaving toolbar controls, editor-local keys, and Escape/cancel behavior available.
- Add one stable compactable toolbar with full-height separators and 150ms reduced-motion-aware transitions. Compact mode hides inactive controls while keeping every active tool visible, and expanding restores the same order and state without introducing toolbar modes.
- Tighten Arrange and Typography interaction: Arrange can be activated before Select and enables it automatically; turning Arrange off leaves Select active while turning Select off exits Arrange; direct text editing shows one live Typography card even when Typography was already selected.
- Make preview ownership safe across history and teardown. Text/style undo and redo now update still-owned Desired values without overwriting host changes, inherited `contenteditable` regions remain native with nested `contenteditable="false"` boundaries respected, Arrange preserves host-authored transform updates, and async plugin setup is cancelled cleanly without disposing unrelated plugins on shared hosts.

## 0.1.6 - 2026-09-04

- Extend direct text editing to Select/Arrange workflows with full-text replacement and touch/pen double-tap support; rename the human-facing Text Inspector tool to **Typography** while retaining the internal `text-inspector` compatibility id, keep B/I/U/Font/Size/Weight/rendered colors as direct editing controls, separate page-derived Text/H1/H2/H3 semantic presets into their own popup, and show contextual Typography information for the edited field without interrupting Select or Arrange.
- Expose saved Before/Desired text and style intent through the agent `textEdit` capability and `textEdits()` / `textEdit(id)` APIs, and teach the portable Agent Skill to include those edits in broad Mesurer-context sweeps and verify the real source-rendered result with Mesurer's preview inactive.

## 0.1.5 - 2026-09-02

- Simplify the development-only Mesurer mounting examples to use explicit `if` blocks instead of ternaries, `undefined`, and optional-chained cleanup, while preserving the same Vite development and HMR behavior.

## 0.1.4 - 2026-09-02

- Clarify that Mesurer can mount directly in an application's existing browser entry, add concrete React, Solid, Vue, Svelte/vanilla, Electron, and SSR placement examples, and present `src/dev/mesurer.ts` as an optional organization pattern rather than a required or preferred location.

## 0.1.3 - 2026-09-02

- Refresh the public docs for the current Arrange, Screenshot, shortcuts, Color Picker, Text Inspector, plugin, and client-mounting workflows, including Arrange as a human/designer visual specification that coding agents verify against Before/Desired/Live state.
- Update the portable `mesurer-ui` Agent Skill and agent-integration guide so broad requests to check Mesurer/context inspect the combined live human intent—workspace, selection, target-bound annotations, Arrange intents, guides, measurements, distances, and preserved screenshot state—before editing source; document upstream drawing annotations as an intentional product divergence rather than a missing stable feature.
- Add first-party toolbar shortcuts for Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Arrange, Screenshot, Context actions, Settings, and Mesurer visibility, while coordinating Arrange with Select and disabling conflicting page-interaction tools while Arrange is active.
- Extend Text Inspector with reversible Desired-text editing on double-click, keep Arrange and Select state in sync, and make Arrange/Screenshot split-button quick menus match Guides geometry and close after a choice.
- Keep Color Picker faithful to the native `EyeDropper` contract: hide it when native sampling is unavailable or the current Codex host bridge is present, keep `P` inert in those hosts, preserve upstream button toggle-off versus fresh `P`-key picking behavior, and avoid a DOM/CSS sampling fallback.
