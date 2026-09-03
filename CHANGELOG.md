# Changelog

Notable user-facing changes to Mesurer Solid are recorded here. Add upcoming changes under **Unreleased**; the release workflow moves them into the versioned section when it prepares a release PR.

## Unreleased

- Extend direct text editing to Select/Arrange workflows with full-text replacement and touch/pen double-tap support; keep the default formatting bar compact as B/I/U/Text, add page-derived Text/H1/H2/H3 presets from dominant rendered typography while preserving non-dominant page variants in detailed Font/Size/Weight/Color choices, and automatically show live Text Inspector information for the edited field.
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
- Add the optional Arrange layout-intent workflow with persistent Desired placement, repeated-drag accumulation, X-ray/guide alignment snapping, configurable snap preferences, and automatic Select activation.
- Keep plugin-heavy Settings compact with collapsed, borderless plugin disclosures, and add Guides-style chevron quick menus with single-line entries for Arrange and Screenshot preferences so common modes can be changed without opening the full Settings panel.
- General → Plugins now treats each plugin row as its lifecycle toggle. First-party Context, Arrange, and Screenshot remain discoverable even when initially disabled; enabled plugins show a settings chevron only when they have additional controls, redundant Context/Screenshot visibility rows are hidden, lifecycle choices and plugin preferences persist across reloads, and Use defaults deterministically restores mount-time availability without discarding plugin-owned workspace state.

## 0.1.3-beta.1 - 2026-09-02

- Add first-party toolbar shortcuts for Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Arrange, Screenshot, Context actions, Settings, and Mesurer visibility, while coordinating Arrange with Select and disabling conflicting page-interaction tools while Arrange is active.
- Extend Text Inspector with reversible Desired-text editing on double-click, keep Arrange and Select state in sync, and make Arrange/Screenshot split-button quick menus match Guides geometry and close after a choice.
- Keep Color Picker faithful to the native `EyeDropper` contract: hide it when native sampling is unavailable or the current Codex host bridge is present, keep `P` inert in those hosts, preserve upstream button toggle-off versus fresh `P`-key picking behavior, and avoid a DOM/CSS sampling fallback.

## 0.1.3-beta.0 - 2026-08-31

- Add the optional Arrange layout-intent workflow with persistent Desired placement, repeated-drag accumulation, X-ray/guide alignment snapping, configurable snap preferences, and automatic Select activation.
- Keep plugin-heavy Settings compact with collapsed, borderless plugin disclosures, and add Guides-style chevron quick menus with single-line entries for Arrange and Screenshot preferences so common modes can be changed without opening the full Settings panel.
- General → Plugins now treats each plugin row as its lifecycle toggle. First-party Context, Arrange, and Screenshot remain discoverable even when initially disabled; enabled plugins show a settings chevron only when they have additional controls, redundant Context/Screenshot visibility rows are hidden, lifecycle choices and plugin preferences persist across reloads, and Use defaults deterministically restores mount-time availability without discarding plugin-owned workspace state.

## 0.1.2 - 2026-08-29

- Make `mountMesurer`, `MountMesurerOptions`, and `MountedMesurer` the canonical public mount API spellings, keep the earlier `Measurer` forms as deprecated compatibility aliases for existing `0.1.1` consumers, and use the canonical Mesurer spelling throughout internal renderer/model code and examples.

## 0.1.1 - 2026-08-29

- Keep plugin-contributed Settings toggle labels on one line in compact rows, and make the Screenshot toolbar camera icon match the original Mesurer visual.
- Fix plugin-contributed Settings persistence when no explicit `persistKey` is provided, make **Use defaults** reset and persist plugin controls to their mount-time defaults, and report the public package version consistently in Settings, `MESURER_VERSION`, and official Mesurer plugin metadata.
- Add generic plugin-contributed toggle controls under Settings → General → Plugins, including persisted Context and Screenshot controls for tool visibility, screenshot auto-copy/auto-download, and whether captures include measurement presentation.
- Add the optional `mesurer-solid/screenshot` plugin with drag-to-select visible-tab capture, HiDPI-aware PNG cropping, best-effort automatic clipboard copy and local download outputs, persisted output settings, a persistent draggable preview with native image actions and click-to-open Copy/Save viewer, capture-status feedback, and a no-prompt Chrome extension capture bridge with `getDisplayMedia()` fallback for normal browser hosts.

## 0.1.1-beta.3 - 2026-08-29

- Keep plugin-contributed Settings toggle labels on one line in compact rows, and make the Screenshot toolbar camera icon match the original Mesurer visual.

## 0.1.1-beta.2 - 2026-08-29

- Fix plugin-contributed Settings persistence when no explicit `persistKey` is provided, make **Use defaults** reset and persist plugin controls to their mount-time defaults, and report the public package version consistently in Settings, `MESURER_VERSION`, and official Mesurer plugin metadata.

## 0.1.1-beta.1 - 2026-08-29

- Add generic plugin-contributed toggle controls under Settings → General → Plugins, including persisted Context and Screenshot controls for tool visibility, screenshot auto-copy/auto-download, and whether captures include measurement presentation.

## 0.1.1-beta.0 - 2026-08-28

- Add the optional `mesurer-solid/screenshot` plugin with drag-to-select visible-tab capture, HiDPI-aware PNG cropping, best-effort automatic clipboard copy and local download outputs, persisted output settings, a persistent draggable preview with native image actions and click-to-open Copy/Save viewer, capture-status feedback, and a no-prompt Chrome extension capture bridge with `getDisplayMedia()` fallback for normal browser hosts.

## 0.1.0 - 2026-08-28

- Measure every unique pair in multi-selection spacing so additional selected elements no longer lose pairwise or nested edge-distance evidence.
- Keep all pairwise spacing lines while collapsing identical labels at rest; hovering a shared value fans out its pair labels and emphasizes the hovered pair's line and elements.
- Show direct orthogonal spacing relationships by default, with an opt-in persisted diagonal mode that renders the true nearest-corner Euclidean distance for diagonal pairs.
- Keep distinct visible spacing labels clickable by moving colliding value pills along their measurement line first, with perpendicular movement only as a fallback, without changing the measurement lines themselves.
- Make Mesurer shared visual state the default agent workflow: agents read the human's live selection, annotations, measurements, and rendered evidence through the existing browser harness, while safe reinjection preserves the mounted instance and human state.
- Add strict programmatic `select(selector | selectors)` for exact rendered targets; it visibly updates Mesurer's live selection, returns selection-scoped `MesurerContextV1`, and rejects missing or ambiguous selectors instead of guessing.
- Remove the Send-to-agent/delivery API and toolbar surface in favor of direct page-state context plus the human-facing Copy Context, Copy Selection, and Add Note controls.
- Keep the Solid 2 development/browser path free of the previous strict-read and delegated pointer-handler diagnostics while preserving the React-to-Solid interaction contract.

## 0.1.0-beta.12 - 2026-08-24

- Publish the canonical npm package as `mesurer-solid` instead of `@jhomra21/mesurer-solid`; the runtime API and export paths are unchanged apart from the package specifier, and the old scoped prereleases remain available for existing installs.
- Preserve the `mesurer-skill` executable in the canonical npm artifact and point installer recovery guidance at the unscoped `mesurer-solid` package.

## 0.1.0-beta.11 - 2026-08-24

- Improve annotation note UX for multi-selection: the floating annotation affordance follows the selected element under the pointer, note surfaces show the selected-element count, saved annotations retain all selected targets, markers reopen notes reliably, and both the composer and saved panels can be dragged without disturbing the selection.
- Keep distance labels readable near viewport edges by anchoring labels to the visible part of their measurement segment, while hiding labels whose measurement line is entirely outside the viewport and preserving the underlying distance geometry.
- Document how to enable `mesurer.context`, use Copy Context / Copy Selection / Add Note, annotate single or multiple elements and arbitrary regions, run context/review/capture APIs programmatically, use injection defaults, and opt into API-only context with `ui: false`.

## 0.1.0-beta.10 - 2026-08-24

- Make automatic multi-selection spacing a configurable `mesurer.distance` settings surface, with persisted/API-configurable visibility, color, line weight, solid/dashed/dotted pattern, dash length, and gap.

## 0.1.0-beta.9 - 2026-08-24

- Keep the target-anchored annotation UI's generated stylesheet in sync with its current source classes.
- Improve nested and overlapping multi-selection by preserving descendant Shift-selection semantics and showing all available dashed edge offsets for stacked selections.

## 0.1.0-beta.8 - 2026-08-23

- Make context and annotation controls match Mesurer's visual language, with normalized toolbar icons, a 24×24 annotation affordance beside the selected target, and compact target-anchored annotation composer/marker/panel surfaces.
- Add true sparse Shift multi-selection and automatic dashed pixel-spacing guides between selected elements, including non-contiguous selections such as A + C without visually selecting elements in between.

## 0.1.0-beta.7 - 2026-08-23

- Add the removable `mesurer.context` plugin with workspace, selection, and annotation context; Copy Context / Copy Selection / Add Note toolbar actions; durable annotation anchors; scoped review; and region-aware capture planning.
- Add agent-facing context, annotation, review, capture, and optional send APIs, plus deterministic text/ACP content mapping for coding-agent workflows.
- Ship one portable `mesurer-ui` Agent Skill whose installer includes the exact built `inject-script.js`, so agents can attach Mesurer without adding it to the target application's dependencies.
- Add a first-party Manifest V3 browser extension and make both module and classic injection load the context plugin by default while retaining an explicit low-level `context: false` mode.
- Harden multi-instance and Shadow DOM behavior with instance-local built-in commands, root-scoped inspection and selection, conservative annotation rebinding, ShadowRoot-aware hit testing/snapping, and correctly scoped X-ray ownership.
- Preserve exact capture presentation across hide/restore cycles, including inline `!important` display declarations, and distinguish evidence that moved outside annotation scope from evidence that was actually removed.

## 0.1.0-beta.6 - 2026-08-21

- Make the private Solid 2 renderer compatible with strict Trusted Types pages by compiling through Solid's universal renderer and creating DOM nodes directly instead of relying on HTML-string template sinks.
- Add an exact packed-package browser regression for `require-trusted-types-for 'script'; trusted-types 'none'`, combined with the current hostile host-isolation checks.
- Document the Trusted Types renderer contract separately from host-page occlusion/isolation guarantees.

## 0.1.0-beta.5 - 2026-08-21

- Harden Mesurer against host-page occlusion with browser top-layer mounting, hostile-CSS protection, later-overlay reassertion, modal-dialog handling, and a fixed fallback.
- Expose the selected `hostLayer` strategy and `bringToFront()` on mounted instances for diagnostics and explicit reassertion.
- Add adversarial packed-package coverage for stacking, clipping, popovers, modals, host hit-testing, and plugin controls across React, Solid 1, and Solid 2 hosts.
- Document Mesurer as an always-on agent design feedback loop that validates the rendered page with exact measurements plus screenshots, and show how users can extend or replace capabilities with plugins.

## 0.1.0-beta.4 - 2026-08-21

- No user-facing changes.

## 0.1.0-beta.3 - 2026-08-20

- No user-facing changes.
