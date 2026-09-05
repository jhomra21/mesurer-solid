# Documentation

Mesurer Solid is a browser inspection and visual-intent tool. Start with installation, then use the workflow-specific docs when you need the deeper behavior or agent contract.

## Start here

- [Getting started](./GETTING_STARTED.md) — install Mesurer and mount it from the correct browser entry.
- [Root README](../README.md) — short product overview, features, shortcuts, and first-party plugins.
- [npm package README](../packages/mesurer/README.md) — public package entry points and package-facing usage.

## Human workflows

- [Direct text editing and Typography](./TEXT_EDITING.md) — inspect rendered type and record reversible copy/style intent.
- [Arrange](./ARRANGE.md) — move selected rendered UI into a Desired layout and compare it with Live source.
- [Screenshots](./SCREENSHOTS.md) — capture visible-tab regions and configure screenshot output.
- [Context workflow](./CONTEXT_WORKFLOW.md) — selection, measurements, annotations, review, and shared human/agent context.
- [Design feedback loop](./DESIGN_FEEDBACK_LOOP.md) — use Mesurer as a repeatable visual implementation and review loop.

## Agent and browser integration

- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md) — coding-agent setup, state preservation, intent inventory, and verification.
- [Mesurer UI skill](../.agents/skills/mesurer-ui/SKILL.md) — portable agent instructions shipped with the package.
- [Browser harness](./BROWSER_HARNESS.md) — launch/attach behavior and browser-controlled validation.
- [Host isolation](./HOST_ISOLATION.md) — mounting, top-layer behavior, hostile host CSS, and shared-host boundaries.
- [Trusted Types](./TRUSTED_TYPES.md) — renderer behavior on strict Trusted Types pages.
- [Browser extension](../extension/README.md) — zero-source-change Chromium injection and visible-tab screenshot capture.

## Repository maintenance

- [Architecture](../ARCHITECTURE.md) — package boundaries, runtime ownership, plugins, renderer, and agent surfaces.
- [Upstream parity](./UPSTREAM_PARITY.md) — pinned Mesurer source audits, adopted behavior, and deliberate differences.
- [Releasing](../RELEASING.md) — validation, release preparation, npm publishing, and provenance.
- [Changelog](../CHANGELOG.md) — user-facing changes by release.
- [Agent repository rules](../AGENTS.md) — source-first implementation and validation rules for coding agents working in this repository.

The public product docs describe behavior. `ARCHITECTURE.md`, `UPSTREAM_PARITY.md`, `RELEASING.md`, and `AGENTS.md` carry repository and maintenance detail and intentionally stay more technical.
