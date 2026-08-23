# Changelog

Notable user-facing changes to Mesurer Solid are recorded here. Add upcoming changes under **Unreleased**; the release workflow moves them into the versioned section when it prepares a release PR.

## Unreleased

<!-- Add user-facing changes here before preparing a release. -->

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




