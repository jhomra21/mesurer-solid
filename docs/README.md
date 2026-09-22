# Documentation

Mesurer Solid is a browser inspection and visual-intent tool. Start with setup, then open the guide for the task you are doing.

## Start here

- [Capabilities](./CAPABILITIES.md). Complete map of built-in tools, first-party plugins, agent methods, plugin APIs, and supported hosts.
- [Getting started](./GETTING_STARTED.md). Install Mesurer and mount it from browser code.
- [Root README](../README.md). Product overview, shortcuts, first-party plugins, and common workflows.
- [npm package README](../packages/mesurer/README.md). Public package entries and package-facing usage.

## Workflows

- [Direct text editing and Typography](./TEXT_EDITING.md). Inspect type and record reversible copy and style intent.
- [Arrange](./ARRANGE.md). Move rendered UI into a Desired layout and compare it with Live source.
- [Screenshots](./SCREENSHOTS.md). Capture visible-tab regions and configure screenshot output.
- [Context](./CONTEXT_WORKFLOW.md). Read selection, measurements, annotations, review state, and shared human-agent evidence.
- [Queue Context feedback to Codex](./CODEX.md). Queue human visual feedback to the originating or another recent same-project Codex thread.
- [Design feedback loop](./DESIGN_FEEDBACK_LOOP.md). Use Mesurer while implementing and reviewing UI.

## Agent and browser integration

- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md). Preserve human state, read saved intent, and verify Live output.
- [Mesurer UI skill](../.agents/skills/mesurer-ui/SKILL.md). Portable instructions shipped for coding agents.
- [Browser and agent integration](./BROWSER_HARNESS.md). Reuse an existing browser and inject Mesurer only when needed.
- [Browser extension](../extension/README.md). Inject Mesurer into Chromium tabs without application source changes.

## Browser compatibility

- [Host isolation](./HOST_ISOLATION.md). Shadow DOM, top-layer mounting, overlays, and modal dialogs.
- [Trusted Types](./TRUSTED_TYPES.md). Strict CSP and DOM-construction guarantees.

## Project reference

- [Design language](./DESIGN_LANGUAGE.md). Shared surface, color, density, motion, and UI-review rules for new features.
- [Repository structure](./REPOSITORY_STRUCTURE.md). Directory ownership, package boundaries, test placement, and cleanup rules.
- [Contributing](../CONTRIBUTING.md). Development setup, documentation expectations, validation, and pull request guidance.
- [Architecture](../ARCHITECTURE.md). Package boundaries, ownership, plugins, renderer, and agent APIs.
- [Upstream parity](./UPSTREAM_PARITY.md). Pinned Mesurer source audits and deliberate product differences.
- [Releasing](../RELEASING.md). Release validation and npm publishing.
- [Changelog](../CHANGELOG.md). User-facing changes by release.
- [Repository agent rules](../AGENTS.md). Implementation and validation rules for this repository.

User guides explain product behavior. Architecture, parity, release, and repository rules explain how the repository maintains that behavior.
