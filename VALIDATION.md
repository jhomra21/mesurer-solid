# Validation policy

Mesurer is an interaction-heavy browser tool. A green test suite is useful only when the tests exercise the same behavior, runtime topology, and visible outcome that a user relies on.

## Acceptance evidence

A behavior may be treated as fixed or release-ready only when an end-to-end browser contract exercises the real user path and verifies the resulting application state and visible geometry. For behavior involving isolation, Shadow DOM, nested scrolling, top-layer mounting, portals, focus, or browser layout, the acceptance fixture must preserve that topology instead of replacing it with mocks.

Good acceptance contracts perform real input such as clicks, double-clicks, typing, keyboard shortcuts, pointer movement, drag, wheel scrolling, resize, reload, or navigation. They then verify the user-visible result: selection identity, edited content, persisted state, geometry, relative placement, interaction ownership, rendered pixels when appropriate, and browser diagnostics.

For regressions reported manually, reproduce the exact failed scenario before considering the fix complete. A test that does not actually reach the failed behavior or rendered state is not evidence, even if it is green.

Inspect changes must cover the real browser hit-test path. Current acceptance includes pointer-transparent descendants, overlapping page targets, transformed elements, canvas, closed Shadow DOM boundaries, large DOMs, and physical SVG selection. Programmatic `select()` and Context must resolve the same SVG targets as the visible Select tool. Select lifecycle acceptance also requires turning Select off to clear logical selection, preserving that empty state across reload, re-enabling without resurrecting the old target, and physical held-Shift input producing a real multi-selection. Color Picker browser acceptance verifies the native `EyeDropper` fallback and exact clipboard format. Packed Electron acceptance verifies that a host capture capability takes precedence, samples the current window without invoking `EyeDropper`, maps HiDPI coordinates from CSS pixels to PNG pixels, and does not leave a recurring Color Picker animation-frame loop or 500 ms capability poll.

Toolbar interaction changes must prove both sides of pointer ownership. Dragging toolbar chrome or a trigger must move the toolbar after the drag threshold, while pointer activity inside menus, dialogs, form controls, editable regions, and sliders must leave the toolbar in place. Triggers that own expandable UI must also expose the rendered open state through `aria-expanded`.

Host-specific toolbar placement needs host-specific acceptance. On macOS Electron, verify the unsaved default toolbar starts below the native titlebar area and a real drag cannot move any part of the toolbar back into that top strip. Verify the toolbar can still use the left edge below the titlebar. Normal browsers must keep the browser drag behavior. A safe saved toolbar position must survive reload, while an older saved position inside the native titlebar area must be corrected on mount.

## Measure rendered output, not a proxy

When a regression is about visible spacing, overlap, or jitter, assert the geometry the user actually sees. Do not infer visible correctness from an internal shell coordinate, a synthetic fallback lane, or a placement constant when another wrapper/card can add its own offset.

For direct text editing, this means measuring the real edit/selection geometry, the rendered dimensions pill, and the visible Typography card. If the intended gaps are symmetric, compare those rendered gaps directly. When a late anchor handoff can rewrite geometry, the contract should perturb that handoff and prove the visible elements recover to the intended relationship.

Pointer-motion regressions must be sampled while the pointer is moving. A before/after assertion can miss a visible intermediate-frame oscillation that returns to the starting coordinate. When a user reports jitter, sample the rendered card on successive animation frames and fail on intermediate movement or unexpected placement-style writes.

## Measurement geometry contracts

Distance regressions must verify the rendered geometry that the user sees.

Current contracts cover shared-overlap anchors for separated boxes, guide-line-to-box edge distances, padding-box container spacing, and pairwise multi-selection geometry. A change to these rules should exercise the corresponding visible overlay or browser/geometry contract and keep Context/agent evidence aligned with the same result.

See [Measurements and distance geometry](./docs/MEASUREMENTS.md).

## Supporting tests

Unit, jsdom, attribute, role, count, existence, and implementation-detail checks are supporting tests only. They may protect invariants and shorten debugging, but they do not prove the feature works in the browser and must not be cited as the reason a manual failure is fixed.

Do not make production code accommodate missing jsdom/browser APIs merely to keep a supporting test green. Put test-environment shims in the test environment instead.

Implementation diagnostics such as data attributes, event counters, geometry-read counters, or hot-path instrumentation are useful only when paired with an end-to-end behavior contract. They can explain *how* a behavior stays correct or performant; they cannot substitute for proving that the behavior is correct.

## Visual parity contracts

The historical React parity suite protects the accepted shared renderer presentation from its pinned baseline. Do not use that old baseline to approve a newly ported or materially restyled upstream component.

A ported upstream component that can visibly drift needs a focused current-source browser comparison against the audited upstream commit. Isolate the component from intentional Mesurer Solid product differences around it. Compare rendered pixels and the component's geometry, computed styles, controls, options, and icon primitives. Do not normalize a real design difference out of the report.

Layout Guides currently applies this rule to its initial, list, editor, aligned-editor, and grid states.

## Fresh checkout and Codex test isolation

The root `bun run test` command reads built package artifacts. On a fresh checkout or in a disposable worktree, run `bun run build:packages` first. Focused package tests can run directly when their required artifacts already exist.

Codex bridge and connector tests must behave the same inside and outside a live Codex session. The test setup clears ambient thread, app-tools-pipe, Desktop-opener, and Codex-home state unless a case supplies that state itself. Tests that write Codex state use a disposable `CODEX_HOME`.

## Development server contract

The root `bun run dev` command is a supported contributor path. CI starts it from a clean checkout, requests `/layout-guides.html`, and fails if Vite reports a dependency-scan, pre-transform, or internal-server error.

This check matters because the basic example aliases renderer source directly. Syntax can pass the production transform while still failing Vite's dependency scanner. Changes to renderer TSX, example entries, aliases, or Vite configuration must keep the root dev smoke green.

## Screenshot host contracts

Screenshot host selection must be tested at the public plugin boundary. The Chromium Screenshot contract mounts `screenshot()`, exercises native host results as `Blob`, `ArrayBuffer`, `Uint8Array`, and wrapped `{ png, ...metadata }`, and verifies the cropped PNG result. Malformed host data must fail on the selected host path rather than falling through to a different capture permission flow.

Package smoke builds and packs the exact npm artifact, installs it into a clean Electron consumer, and runs a real Electron renderer with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. The Electron preload exposes the host capture capability, the main process backs it with `webContents.capturePage()`, and renderer code still mounts plain `screenshot()`.

The Chromium extension keeps a separate private adapter backed by `chrome.tabs.captureVisibleTab()`. Its permission and injection behavior belongs to the extension contract, not to the public Screenshot configuration.

## Hot-path performance contracts

Performance regressions should prefer structural contracts over timing thresholds when the required complexity can be stated directly. Timing is noisy across CI runners; synchronous DOM work is observable and deterministic.

For the accepted direct-edit window-scroll path, the packed consumer contract injects thousands of unrelated nodes, enters direct edit, fires a burst of consecutive window scroll events, and requires zero synchronous document/element selector calls, layout reads, Range geometry, hit testing, or computed-style reads during that burst. Deferred settle work may reconcile afterward, but ordinary compositor scroll must not acquire new synchronous discovery/layout cost.

Pointer movement has the same ownership principle: hover may update hover chrome, but pure pointer motion must not restabilize or rewrite source-linked Typography placement when the edited source itself did not move.

## Release rule

Do not hand off a candidate SHA for manual acceptance merely because CI is green. Before handoff:

1. Run the end-to-end contracts for the behaviors changed by the candidate.
2. Verify the contracts use the same public mount/runtime topology relevant to the bug.
3. Verify actual user input reaches the intended rendered UI.
4. Verify the resulting application state and visible geometry. Element presence alone is insufficient.
5. Keep console/page errors at zero for the exercised path.
6. Keep the root dev-server smoke green when changed renderer source is loaded directly by the basic example.
7. For Screenshot host changes, keep both the Chromium host-result contract and the packed Electron contract green.
8. Keep performance invariants paired with the visible behavior they protect.
9. Treat manual acceptance as a separate final check; automation reduces regressions but does not replace the user's real-browser validation.

A shallow green check is never permission to say a user-reported behavior is fixed.
