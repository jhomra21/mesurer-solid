# Documentation

Mesurer Solid is a browser inspection and visual-intent tool. The current stable package is `mesurer-solid@0.2.1` on `latest`. Start with setup, then open the guide for the task you are doing.

## Start here

- [Capabilities](./CAPABILITIES.md) maps the built-in tools, first-party plugins, agent methods, plugin APIs, and supported hosts.
- [Getting started](./GETTING_STARTED.md) explains how to install Mesurer and mount it from browser code.
- [Root README](../README.md) covers the product overview, shortcuts, first-party plugins, and common workflows.
- [npm package README](../packages/mesurer/README.md) documents the public package entries and usage.

## Workflows

- [Direct text editing and Typography](./TEXT_EDITING.md) explains how to inspect type and record reversible copy and style intent.
- [Edit](./EDIT.md) covers element movement, direct text/style editing, and Before/Desired/Live review. [Arrange compatibility](./ARRANGE.md) lists the preserved API names.
- [Layout guides](./LAYOUT_GUIDES.md) explains how to overlay page-scoped columns, rows, or a pixel grid and expose them through Context.
- [Measurements and distance geometry](./MEASUREMENTS.md) defines box, guide, container, and multi-selection spacing evidence.
- [Screenshots](./SCREENSHOTS.md) explains page-region capture, output settings, and host capture selection.
- [Recording](./RECORDING.md) explains selected-region video capture, the `recording:v1` service, MediaBunny export, and browser/extension/Electron acquisition.
- [Context](./CONTEXT_WORKFLOW.md) explains how to read selection, measurements, annotations, review state, and shared human-agent evidence.
- [Queue Context feedback to Codex](./CODEX.md) documents delivery to the originating or another recent same-project Codex thread.
- [Design feedback loop](./DESIGN_FEEDBACK_LOOP.md) describes how to use Mesurer while implementing and reviewing UI.

## Agent and browser integration

- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md) explains how agents preserve human state, read saved intent, and verify Live output.
- [Mesurer UI skill](../.agents/skills/mesurer-ui/SKILL.md) contains the portable instructions shipped for coding agents.
- [Browser and agent integration](./BROWSER_HARNESS.md) explains how to reuse an existing browser and inject Mesurer only when needed.
- [ChatGPT and Codex plugin](./CHATGPT_CODEX_PLUGIN.md) documents the desktop/local plugin prototype, direct UI automation contract, and optional MCP shortcuts.
- [Browser extension](../extension/README.md) explains how to inject Mesurer into Chromium tabs without application source changes.
- [Electron renderer example](../examples/electron-renderer/README.md) shows renderer mounting, native Screenshot/Color Picker capture, the package-owned `mesurer-solid/electron` Recording bootstrap, and optional Codex host wiring.

## Browser compatibility

- [Host isolation](./HOST_ISOLATION.md) documents Shadow DOM, top-layer mounting, overlays, and modal dialogs.
- [Trusted Types](./TRUSTED_TYPES.md) documents strict CSP and DOM-construction guarantees.

## Project reference

- [Design language](./DESIGN_LANGUAGE.md) defines shared UI, color, density, motion, and review rules for new features.
- [Repository structure](./REPOSITORY_STRUCTURE.md) defines directory ownership, package boundaries, test placement, and cleanup rules.
- [Contributing](../CONTRIBUTING.md) covers development setup, documentation expectations, validation, and pull request guidance.
- [Architecture](../ARCHITECTURE.md) documents package boundaries, ownership, plugins, the renderer, and agent APIs.
- [Upstream parity](./UPSTREAM_PARITY.md) records pinned Mesurer source audits and deliberate product differences.
- [Releasing](../RELEASING.md) documents release validation and npm publishing.
- [Changelog](../CHANGELOG.md) records user-facing changes by release.
- [Repository agent rules](../AGENTS.md) defines implementation and validation rules for this repository.

User guides explain product behavior. Architecture, parity, release, and repository rules explain how the repository maintains that behavior.
