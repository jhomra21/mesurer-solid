# Documentation

Mesurer Solid is a browser inspection and visual-intent tool. Start with setup, then open the guide for the workflow you are using.

## Start here

- [Getting started](./GETTING_STARTED.md) — install Mesurer and mount it from browser code.
- [Root README](../README.md) — product overview, features, shortcuts, and first-party plugins.
- [npm package README](../packages/mesurer/README.md) — public package entries and package-facing usage.

## Workflows

- [Direct text editing and Typography](./TEXT_EDITING.md) — inspect type and record reversible copy/style intent.
- [Arrange](./ARRANGE.md) — move rendered UI into a Desired layout and compare it with Live source.
- [Screenshots](./SCREENSHOTS.md) — capture visible-tab regions and configure screenshot output.
- [Context](./CONTEXT_WORKFLOW.md) — selection, measurements, annotations, review, and shared human/agent state.
- [Design feedback loop](./DESIGN_FEEDBACK_LOOP.md) — use Mesurer while implementing and reviewing UI.

## Agent and browser integration

- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md) — preserve human state, read saved intent, and verify Live output.
- [Mesurer UI skill](../.agents/skills/mesurer-ui/SKILL.md) — portable instructions shipped for coding agents.
- [Browser harness](./BROWSER_HARNESS.md) — reuse an existing browser and inject Mesurer only when needed.
- [Browser extension](../extension/README.md) — Chromium injection without application source changes.

## Browser compatibility

- [Host isolation](./HOST_ISOLATION.md) — Shadow DOM, top-layer mounting, overlays, and modal dialogs.
- [Trusted Types](./TRUSTED_TYPES.md) — strict CSP and DOM-construction guarantees.

## Project reference

- [Architecture](../ARCHITECTURE.md) — package boundaries, ownership, plugins, renderer, and agent surfaces.
- [Upstream parity](./UPSTREAM_PARITY.md) — pinned Mesurer source audits and deliberate product differences.
- [Releasing](../RELEASING.md) — release validation and npm publishing.
- [Changelog](../CHANGELOG.md) — user-facing changes by release.
- [Repository agent rules](../AGENTS.md) — source-first implementation and validation rules for this repository.

User guides describe what to do. Architecture, parity, release, and repository-agent documents carry the deeper maintenance contracts.