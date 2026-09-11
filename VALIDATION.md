# Validation policy

Mesurer is an interaction-heavy browser tool. A green test suite is useful only when the tests exercise the same behavior, runtime topology, and visible outcome that a user relies on.

## Acceptance evidence

A behavior may be treated as fixed or release-ready only when an end-to-end browser contract exercises the real user path and verifies the resulting application state and visible geometry. For behavior involving isolation, Shadow DOM, nested scrolling, top-layer mounting, portals, focus, or browser layout, the acceptance fixture must preserve that topology instead of replacing it with mocks.

Good acceptance contracts perform real input such as clicks, double-clicks, typing, keyboard shortcuts, pointer movement, drag, wheel scrolling, resize, reload, or navigation. They then verify the user-visible result: selection identity, edited content, persisted state, geometry, relative placement, interaction ownership, rendered pixels when appropriate, and browser diagnostics.

For regressions reported manually, reproduce the exact failed scenario before considering the fix complete. A test that does not actually reach the failed surface or behavior is not evidence, even if it is green.

## Supporting tests

Unit, jsdom, attribute, role, count, existence, and implementation-detail checks are supporting tests only. They may protect invariants and shorten debugging, but they do not prove the feature works in the browser and must not be cited as the reason a manual failure is fixed.

Do not make production code accommodate missing jsdom/browser APIs merely to keep a supporting test green. Put test-environment shims in the test environment instead.

Implementation diagnostics such as data attributes, event counters, geometry-read counters, or hot-path instrumentation are useful only when paired with an end-to-end behavior contract. They can explain *how* a behavior stays correct or performant; they cannot substitute for proving that the behavior is correct.

## Release rule

Do not hand off a candidate SHA for manual acceptance merely because CI is green. Before handoff:

1. Run the end-to-end contracts for the behaviors changed by the candidate.
2. Verify the contracts use the same public mount/runtime topology relevant to the bug.
3. Verify actual user input reaches the intended rendered surface.
4. Verify the resulting application state and visible geometry, not just element presence.
5. Keep console/page errors at zero for the exercised path.
6. Keep performance invariants paired with the visible behavior they protect.
7. Treat manual acceptance as a separate final check; automation reduces regressions but does not replace the user's real-browser validation.

A shallow green check is never permission to say a user-reported behavior is fixed.
