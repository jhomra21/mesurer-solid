# Changelog

Notable user-facing changes to Mesurer Solid are recorded here. Add upcoming changes under **Unreleased**; the release workflow moves them into the versioned section when it prepares a release PR.

## Unreleased

- Simplify the development-only Mesurer mounting examples to use explicit `if` blocks instead of ternaries, `undefined`, and optional-chained cleanup, while preserving the same Vite development and HMR behavior.

<!-- Add user-facing changes here before preparing a release. -->

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

## 0.1.2 - 2026-08-30

- Add first-party package and host validation for React, Solid 1, Solid 2, Vue, Svelte, vanilla DOM, and Electron renderer pages.
- Add portable Agent Skill installation through `mesurer-skill install` and package the same skill content used by the repository.
- Add Context, annotations, review, screenshot capture planning, and state-preserving browser injection guidance for coding agents.

## 0.1.1 - 2026-08-29

- Move the public package to the canonical unscoped `mesurer-solid` name while keeping compatibility aliases for earlier package APIs.
- Add screenshot capture support, plugin settings integration, Trusted Types handling, and release automation hardening.

## 0.1.0 - 2026-08-28

- First stable release of Mesurer Solid.
