# Changelog

Notable user-facing changes to Mesurer Solid are recorded here. Add upcoming changes under **Unreleased**; the release workflow moves them into the versioned section when it prepares a release PR.

## Unreleased

<!-- Add user-facing changes here before preparing a release. -->

## 0.2.0-beta.3 - 2026-09-26

- Keep the default Mesurer toolbar clear of the native macOS window controls in Electron renderers. Browser defaults and user-saved toolbar positions stay unchanged.

## 0.2.0-beta.2 - 2026-09-26

- Keep persisted Context annotations connected after reload when their saved selector still uniquely identifies the same compatible target, even if the host contains other matching elements of the same tag such as multiple editor canvases.

## 0.2.0-beta.1 - 2026-09-25

- Keep saved Context annotations connected across renderer reloads when a framework changes non-identity classes but the unique structural target and rendered geometry remain stable. Review also stops treating the transient Select measurement box as missing durable evidence when the annotated target itself reconnects.

## 0.2.0-beta.0 - 2026-09-25

- Keep Color Picker inside native application hosts that expose `window.__MESURER_HOST__.captureScreenshot`: Mesurer now samples the current renderer window with one host capture after the user clicks, maps CSS coordinates to the returned PNG dimensions for HiDPI displays, and keeps browser `EyeDropper` as the fallback when no host capture capability exists.
- Remove the Color Picker's permanent animation-frame positioning loop and 500 ms capability poll. Positioning and capability checks now run from relevant state, resize, focus, visibility, and toolbar events instead of waking an idle Electron renderer continuously.
- Expand the packed Electron package smoke to verify application-local Color Picker sampling, zero native `EyeDropper` calls on the host-capture path, exact host capture count, native Screenshot capture, and isolated renderer security settings.

## 0.1.9 - 2026-09-24

- Match current React Select lifecycle: invoking Select now clears the current element/Guide selection before toggling the tool, so turning Select off cannot leave latent selection that reappears later. Browser acceptance now covers Select-off persistence, physical Shift-click multi-selection, and exact native Color Picker clipboard output.
- Fix Guide-to-element distance measurement to use the exact zero-thickness Guide coordinate instead of a one-pixel rectangle, while preserving the visible Guide hit target. Browser coverage now verifies exact vertical and horizontal distances.
- Deepen the main `mountMesurer()` interface without adding another factory: `ready` now resolves the live plugin host after startup, `describe()` waits for readiness, `signal` can own disposal, readonly plugin arrays are accepted, and `excludeBuiltins` uses public names such as `typography` and `colorPicker`. The lower-level `createMesurerRuntime()` also accepts readonly plugin lists and disposes partial startup on failure. Keep `excludePlugins` and `onPluginsReady` as compatibility surfaces, and preserve falsy values returned by `service<T>()`.
- Match Layout Guides to the audited current React Mesurer component, including menu size, control fields, spacing, icon strokes, editor states, first-open default guide creation, and separate panel/overlay visibility. A focused browser parity job now compares the current component directly while the existing historical renderer parity suite remains unchanged.

- Make Screenshot choose its capture path internally. Electron/native hosts can expose `window.__MESURER_HOST__.captureScreenshot`, the Chromium extension keeps its private adapter, and ordinary browser pages fall back to `getDisplayMedia()`. Renderer usage stays `screenshot()`. Existing provider and low-level helpers remain only for compatibility. Package smoke now runs the packed artifact in Electron 43 with context isolation and sandboxing enabled, node integration disabled, and a packaged `file://` renderer.
- Fix the root `bun run dev` path under Vite 8 by removing JSX comma expressions from Layout Guides. CI now starts the root dev command and loads `layout-guides.html` so dependency-scan and pre-transform failures cannot pass unnoticed.
- Add first-party **Layout Guides** as `layoutGuides()`: columns, rows, and pixel grids are plugin-owned, page-scoped, undoable through the existing command/history path, available through `MesurerLayoutGuidesService`, and included in Context evidence.
- Scope default persisted workspace state to the current route so page-owned guides, selections, measurements, and annotations do not leak across in-tab navigation. Keep toolbar placement as tab-session UI and restore it across route changes and reloads.
- Restore explicitly opened Chromium-extension sessions after reload or eligible in-tab navigation while retaining `activeTab` instead of requesting persistent site access. Recovery stops when the browser no longer grants access and resumes only after another explicit action click.
- Remount extension-owned Mesurer when page DOM replacement disconnects its injected host, while keeping disconnected-host recovery opt-in for general programmatic injection.
- Refine measurement geometry with shared-overlap anchors, true guide-line-to-box distances, and padding-box container spacing while retaining Mesurer Solid's multi-selection and diagonal evidence model.
- Improve Inspect hit testing for pointer-transparent visual descendants and overlapping targets, and treat SVG elements as first-class Select, point-inspection, Context, and annotation targets.
- Keep toolbar dragging separate from menu/dialog/form interaction: trigger drags close their open transient surface only after drag starts, while Guide menu state is exposed through `aria-expanded`.

- Add persisted **System**, **Light**, and **Dark** appearance modes through Settings and the public `theme` mount option. The active theme now follows Mesurer UI across the isolated renderer, document-backed Context and Typography, direct editing, and portaled selection chrome.
- Add a design-review contract for new Mesurer-owned UI, using current upstream floating-surface, control, density, motion, and ownership language without restyling accepted existing surfaces by default.
- Let plugin commands return JSON-safe values through the core host and browser-agent command API instead of discarding handler results.
- Add `MountedMesurer.service<T>(id)` for typed optional-plugin capabilities, make Codex `queue()` / `codex.queue` the canonical delivery API, and retain `send()` / `codex.send` as compatibility aliases.

## 0.1.9-beta.2 - 2026-09-24

- Match current React Select lifecycle: invoking Select now clears the current element/Guide selection before toggling the tool, so turning Select off cannot leave latent selection that reappears later. Browser acceptance now covers Select-off persistence, physical Shift-click multi-selection, and exact native Color Picker clipboard output.

## 0.1.9-beta.1 - 2026-09-24

- Fix Guide-to-element distance measurement to use the exact zero-thickness Guide coordinate instead of a one-pixel rectangle, while preserving the visible Guide hit target. Browser coverage now verifies exact vertical and horizontal distances.
- Deepen the main `mountMesurer()` interface without adding another factory: `ready` now resolves the live plugin host after startup, `describe()` waits for readiness, `signal` can own disposal, readonly plugin arrays are accepted, and `excludeBuiltins` uses public names such as `typography` and `colorPicker`. The lower-level `createMesurerRuntime()` also accepts readonly plugin lists and disposes partial startup on failure. Keep `excludePlugins` and `onPluginsReady` as compatibility surfaces, and preserve falsy values returned by `service<T>()`.

## 0.1.9-beta.0 - 2026-09-24

- Match Layout Guides to the audited current React Mesurer component, including menu size, control fields, spacing, icon strokes, editor states, first-open default guide creation, and separate panel/overlay visibility. A focused browser parity job now compares the current component directly while the existing historical renderer parity suite remains unchanged.

- Make Screenshot choose its capture path internally. Electron/native hosts can expose `window.__MESURER_HOST__.captureScreenshot`, the Chromium extension keeps its private adapter, and ordinary browser pages fall back to `getDisplayMedia()`. Renderer usage stays `screenshot()`. Existing provider and low-level helpers remain only for compatibility. Package smoke now runs the packed artifact in Electron 43 with context isolation and sandboxing enabled, node integration disabled, and a packaged `file://` renderer.
- Fix the root `bun run dev` path under Vite 8 by removing JSX comma expressions from Layout Guides. CI now starts the root dev command and loads `layout-guides.html` so dependency-scan and pre-transform failures cannot pass unnoticed.
- Add first-party **Layout Guides** as `layoutGuides()`: columns, rows, and pixel grids are plugin-owned, page-scoped, undoable through the existing command/history path, available through `MesurerLayoutGuidesService`, and included in Context evidence.
- Scope default persisted workspace state to the current route so page-owned guides, selections, measurements, and annotations do not leak across in-tab navigation. Keep toolbar placement as tab-session UI and restore it across route changes and reloads.
- Restore explicitly opened Chromium-extension sessions after reload or eligible in-tab navigation while retaining `activeTab` instead of requesting persistent site access. Recovery stops when the browser no longer grants access and resumes only after another explicit action click.
- Remount extension-owned Mesurer when page DOM replacement disconnects its injected host, while keeping disconnected-host recovery opt-in for general programmatic injection.
- Refine measurement geometry with shared-overlap anchors, true guide-line-to-box distances, and padding-box container spacing while retaining Mesurer Solid's multi-selection and diagonal evidence model.
- Improve Inspect hit testing for pointer-transparent visual descendants and overlapping targets, and treat SVG elements as first-class Select, point-inspection, Context, and annotation targets.
- Keep toolbar dragging separate from menu/dialog/form interaction: trigger drags close their open transient surface only after drag starts, while Guide menu state is exposed through `aria-expanded`.

- Add persisted **System**, **Light**, and **Dark** appearance modes through Settings and the public `theme` mount option. The active theme now follows Mesurer UI across the isolated renderer, document-backed Context and Typography, direct editing, and portaled selection chrome.
- Add a design-review contract for new Mesurer-owned UI, using current upstream floating-surface, control, density, motion, and ownership language without restyling accepted existing surfaces by default.
- Let plugin commands return JSON-safe values through the core host and browser-agent command API instead of discarding handler results.
- Add `MountedMesurer.service<T>(id)` for typed optional-plugin capabilities, make Codex `queue()` / `codex.queue` the canonical delivery API, and retain `send()` / `codex.send` as compatibility aliases.

## 0.1.8 - 2026-09-21

- Keep mixed-inline direct text editing on Mesurer-owned target state instead of redefining host `childNodes`, so text runs around inline children remain editable while native `NodeList` behavior and child identity stay intact.
- Show the same Mesurer Solid hero image on the npm package page and GitHub README by using the repository-backed image URL.
- Keep **Queue to Codex** on Codex's native durable queue for every client. Desktop ownership now uses `codex://threads/<threadId>` to load or resume the real app-owned thread, so delivery no longer depends on the `codex_app` MCP pipe; existing queued-submission ids are preserved across bridge restarts and recovery instead of being deleted and resent.
- Preserve saved Context annotations across same-tab reloads, restore their exact ids/baselines, and conservatively rebind element targets from stored selector/fingerprint identity instead of losing review state when the page refreshes.
- Preserve page-local Codex routing across browser reloads with per-tab affinity state, refuse to inherit a bridge-wide default when multiple registered threads make the destination ambiguous, and resume exact queued/working delivery tracking after reload so annotation completion cleanup is not lost.
- Add tracked **Queue to Codex** lifecycle feedback: disable the action before submission to suppress double-click duplicates, show Queueing/Queued/Working/Finished or Interrupted states in the tool and destination row, correlate the exact queued prompt with bounded Codex history, reject synthetic unfinished Interrupt states produced by separate history readers, keep Interrupted deliveries reconcilable for backend corrections, and remove only the annotations included in a successfully completed turn by default.
- Keep generic plugin split menus inside the browser viewport: choose the side with usable space, clamp horizontal placement, widen for long labels up to a bounded desktop width, keep selected rows filling the menu, prevent horizontal scrolling, and make tall destination lists scroll vertically instead of extending off-screen.
- Rename the human Codex action to **Queue to Codex**, return `delivery: "queued"` from programmatic delivery, and document Queue versus in-flight **Steer** semantics instead of implying that Mesurer interrupts an active Codex turn.
- Add a Codex destination picker that keeps each Mesurer page pinned to the Codex thread that originally connected it, then shows five recent same-project Codex threads from app-server with one **Show 5 more…** expansion to ten.
- Make **Queue to Codex** health- and CSP-aware: mounting `codex()` does not probe loopback, the first send or thread chooser establishes availability, a missing bridge becomes **Codex unavailable** with an explicit retry, and successful connections continue health-checking for automatic recovery; the trusted SessionStart connector records the project directory used to scope recent-thread discovery.
- Consolidate first-party plugin factories under `mesurer-solid/plugins` with concise feature names such as `context()`, `arrange()`, `screenshot()`, and `codex()`, and remove the redundant public `*Plugin` factory names and one-plugin-per-subpath exports.
- Add optional **Send to Codex** delivery that can auto-bind to the Codex thread that starts the bridge through `CODEX_THREAD_ID`, register later existing or newly-created Codex threads locally, switch among registered destinations, and send saved Context, selection evidence, or workspace Context through Codex's queued-user-message command.
- Keep Context annotations attached to their page targets through window and nested scrolling. Add Note, the composer, saved markers and panels, and the ownership edge move with their source without one-frame catch-up; saved panels keep their page-relative point and multiple notes stay local to the target.
- Keep Add Note available while an existing note is open, allow repeated notes on the same selected element, and keep annotation ownership to one clean exact-bound edge without duplicate selection or ghost paint.
- Keep Select hover and selection evidence below Context cards and fixed Mesurer chrome, including non-isolated browser top-layer hosts, so blue page evidence cannot paint through the new-note composer or a saved annotation card.

## 0.1.7 - 2026-09-15

- Keep Add Note and saved annotation cards above live page selection/hover chrome. The transient Add Note composer now belongs to the selection that opened it, so selecting another element closes the composer and restores the small Add Note trigger for the new target instead of moving the open card.
- Keep custom Typography select popups attached to their trigger while the Typography card scrolls internally, without adding work back to the direct-edit window-scroll hot path.
- Keep direct text editing as the single visible selection owner: parent → child re-entry no longer leaves duplicate selection chrome, the dimensions pill stays clear of Typography with symmetric `2px / 2px` rendered spacing, and Typography continues to follow its source fully offscreen and back.
- Keep Typography visually stable during ordinary pointer movement and preserve the zero-layout/query direct-edit window-scroll hot path, eliminating the cursor-move jitter and scroll catch-up found during real-consumer testing.
- Hide the transient **Add Note** annotation button while direct text editing is active so it cannot overlap the dimensions pill, then restore it automatically when editing ends; existing saved annotation markers and panels remain available.
- Keep live Select hover outlines below the active document-backed Typography inspector during direct text editing, while ordinary Select hover retains its protected top-layer ownership.
- Keep Typography inspector cards above selected page outlines and measurement labels when their document-layer geometry overlaps, matching the toolbar's protected paint and hit ownership without moving either surface.
- Keep the toolbar at the user's chosen viewport position when selected page content moves underneath it. Mesurer no longer automatically shifts the toolbar to another edge to avoid the selected target; toolbar stacking and hit ownership still remain above page selection chrome.
- Keep selection, direct-edit Typography, and annotation chrome attached to their page targets through window and nested scrolling without scroll catch-up, while Mesurer inspector/toolbar surfaces remain hard interaction boundaries that occlude page selection chrome instead of being selected through.
- Add persisted **Keep text changes** and **Keep Arrange changes** controls under Settings → General. Both default off, so saved Desired intent remains available in its owning tool while Select and other tools show the original page presentation unless the corresponding control is enabled.
- Keep Context, Arrange, and Screenshot discoverable as optional Settings plugins, keep compact Settings inside the viewport as the toolbar resizes, and preserve toolbar clearance/stacking over selected page chrome.
- Keep plugin-owned persisted settings durable across immediate page reload/navigation, including the default `mesurer-plugin-settings` namespace used when no `persistKey` is provided.
- Keep direct text editing visually anchored to the rendered host element: the keyboard textarea stays transparent at the host's exact bounds, a subtle inset ring marks edit state, the initially selected text is visibly highlighted for immediate replacement, a blinking caret follows collapsed selections, and text runs around inline markup such as shortcut badges remain editable without flattening those children.
- Unify contextual Typography information and direct formatting into one always-visible interactive inspector. Family, Size, Weight, Line, and Tracking become live controls alongside Bold/Italic/Underline, rendered-page and custom colors, and Text/Heading presets; the old second floating text toolbar/menu no longer renders as a competing surface, and the unified inspector repositions or constrains itself within available viewport space rather than covering the active edit field.
- Keep selected and inspected element chrome locked to its host while scrolling instead of easing or catching up after the page moves; direct-edit rings follow the same frame-locked geometry.
- Add a persisted global **Shortcuts** switch under Settings → General, defaulting on and available as `shortcutsEnabled`. Turning it off gates built-in and plugin shortcuts while leaving toolbar controls, editor-local keys, and Escape/cancel behavior available.
- Add one stable compactable toolbar with full-height separators and 150ms reduced-motion-aware transitions. Compact mode hides inactive controls while keeping every active tool visible, and expanding restores the same order and state without introducing toolbar modes.
- Tighten Arrange and Typography interaction: Arrange can be activated before Select and enables it automatically; turning Arrange off leaves Select active while turning Select off exits Arrange; direct text editing shows one live Typography card even when Typography was already selected.
- Make preview ownership safe across history and teardown. Text/style undo and redo now update still-owned Desired values without overwriting host changes, inherited `contenteditable` regions remain native with nested `contenteditable="false"` boundaries respected, Arrange preserves host-authored transform updates, and async plugin setup is cancelled cleanly without disposing unrelated plugins on shared hosts.

## 0.1.6 - 2026-09-06

- Add framework-neutral Context inspection through `window.__MESURER__.context(...)` and `contextText(...)`, backed by pure `@jhomra21/mesurer-solid-dom` extractors rather than framework-specific internals.
- Expose Context selection through `window.__MESURER__.select(...)` for stable browser-driven agent workflows.
- Add first-class saved Context annotations: with Select + Context enabled, **Add Note** opens a source-attached note composer and saved notes persist as numbered page markers with one open card; `window.__MESURER__.context({ annotation })` returns the note plus current target connectivity/geometry and baseline/current UI evidence.
- Add plugin-neutral annotation access through `window.__MESURER__.annotations()`, plus `context({ annotation })`, `contextText({ annotation })`, and annotation capture planning so coding agents can discover, read, and screenshot human review notes without renderer-private selectors.
- Add Context review classification through `window.__MESURER__.review()` with explicit `pass`, `review`, and `stale` states, including per-item displacement/resizing diagnostics relative to the saved baseline.
- Add native screenshot capture plans through `window.__MESURER__.capturePlan(...)`, `prepareCapture(...)`, and `finishCapture()`: region, target, viewport, and full-page plans use CSS-pixel clipping metadata while capture prep hides Mesurer UI without mutating the host page.
- Add generic runtime read surfaces through `window.__MESURER__.describe()`, `state()`, `commands()`, `plugins()`, and `review()` so browser agents can inspect plugin state without relying on renderer-private DOM.
- Add `packages/mesurer-browser-fixture` plus `scripts/browser-harness.mjs` as the canonical disposable browser verification harness: `bun run browser:harness` starts the fixture on an ephemeral localhost port, launches or attaches a browser with CDP, writes `browser-session.json`, and stays alive until terminated.
- Add explicit `isolation: "shadow" | "none"` support. `"shadow"` remains the default; `"none"` renders the same Mesurer UI into a plain child of the resolved mount target, using `.msr\:*` utility classes and without leaking baseline/global CSS into the host document.
- Make plugin state semantics explicit: transient renderer state remains memory-only; plugin persistence stores only declared `persist` slices plus Settings plugin enablement; history stores only declared `history` slices, with first-party edit/arrange Desired state participating in undo/redo while Context notes and screenshot capture state do not.

## 0.1.5 - 2026-09-03

- Unify the browser-agent contract around `window.__MESURER__`, add metadata-rich context payloads with layout/typography/connectivity evidence, make `contextText()` the canonical Markdown serializer, and add a public `version` plus a validation-safe `window.__MESURER__.validate()` contract.
- Add the portable `mesurer-ui` Agent Skill for browser-driven Codex and other coding agents, package a deterministic `mesurer-skill install` CLI, and verify the installed skill/injector from clean packed-package consumers.
- Give `contextText({ scope: "selection" })` a deterministic fallback: when nothing is selected it now returns the full workspace Context instead of failing.
- Add capture-state primitives for agents: `capturePlan(...)`, `prepareCapture(...)`, and `finishCapture()` with full-page/viewport/region clip metadata plus reversible Mesurer UI hiding, so screenshot workflows do not need to infer coordinates or mutate the host page.
- Make the browser controller's public `select(...)` command return a deterministic command result, including the selected target count, while preserving the same command invocation path.
- Add a public `commands()` discovery surface and document the current stable command ids alongside `describe()`, `state()`, and `review()` so agents can inspect available command/state features before mutating the page.
- Add a stable `context:v1` plugin service with `context()`, `contextText()`, `copyContext()`, `select()`, annotation APIs, and capture APIs, so extensions can consume Context without reaching through controller internals.
- Add opt-in static package metadata helpers `MESURER_VERSION`, `MESURER_PLUGIN_API_VERSION`, and `describeMesurerPackage()` so tooling can inspect release/plugin capabilities without mounting the browser runtime.
- Treat `connect-src` as the explicit CSP boundary for optional loopback Codex delivery and keep the default Mesurer runtime free of outbound requests unless the Codex plugin is enabled.
- Add a standalone `mesurer-codex` loopback companion plus optional `codex()` plugin that sends saved Context, current selection, or workspace Context through `codex queue`, with explicit origin controls and opt-in packaging.

## 0.1.4 - 2026-09-01

- Add current-selection Context copy from the toolbar, hide Mesurer UI from clipboard context capture, and add a 2-second "Copied" confirmation without changing selection or tool state.
- Make toolbar drag finish stable under normal pointer movement by restoring host selection state immediately on pointer release and suppressing only the synthetic post-drag click instead of carrying a one-shot suppression flag into later unrelated clicks.
- Keep the dimensions label attached to the viewport-visible edge of a partially clipped selected element and clear it once the target is fully offscreen, without clamping the selection border or changing measured geometry.
- Keep the selected target's blue highlight visible while using the Context popover, while preventing Mesurer's toolbar/popover UI from becoming a selection or measurement target.
- Keep the dimensions label and Context popover above overlapping host-page content in isolated and non-isolated mounts, without coupling their placement to host stacking contexts.
- Keep the Context popover available in plugin-driven mounts without requiring a hard-coded shell flag, and expose selection/workspace Context through the public `window.__MESURER__` API.
- Keep Context extraction bounded to the selected semantic target and its immediate layout relationships, with stable DOM-path and geometry evidence rather than framework-specific component internals.

## 0.1.3 - 2026-09-01

- Port the remaining top-layer overlays to the Solid renderer and remove the legacy React renderer package from the runtime path.

## 0.1.2 - 2026-08-31

- Switch the default renderer path from React to Solid while keeping the package's public injection API stable.
- Keep the default Mesurer export framework-neutral by routing it through the renderer bundle instead of importing `solid-js` from the public entry.
- Add host-compat CI that verifies the package can be loaded into React, Solid, Vue, Svelte, vanilla HTML, browser-eval, and Electron-style consumers without framework coupling.

## 0.1.1 - 2026-08-31

- Match the canonical `ibelick/mesurer` toolbar and measurement visuals while preserving the Solid port's framework-neutral package API.
- Keep the historical `@jhomra21/mesurer-solid` package name as a compatibility alias while publishing the canonical npm package as `mesurer-solid`.

## 0.1.0 - 2026-08-30
