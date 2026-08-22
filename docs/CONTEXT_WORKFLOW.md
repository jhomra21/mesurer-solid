# Human-in-the-loop visual context workflow

Mesurer turns browser-visible design feedback into a deterministic context payload that a person can copy or an ACP-capable client can deliver to a coding agent.

The foundation intentionally stays small:

```text
human selection / annotation
          +
Mesurer visual evidence
          |
          v
  MesurerContextV1
          |
    format once
      /      \
clipboard    ACP
```

The clipboard and ACP paths use the same context and formatter. ACP is not a separate richer interpretation of the user's feedback.

## Context scopes

Every context has one of three scopes.

### Workspace

```js
await window.__MESURER__.context()
```

Captures the meaningful current Mesurer workspace: selected/referenced targets, guides, measurements, held distances, viewport state, rulers/X-ray state, and computed DOM inspection.

### Selection

```js
await window.__MESURER__.context({ scope: "selection" })
```

Captures the current selected element(s)/selection region plus only relevant evidence touching that scope.

### Annotation

A user selects one or more page elements and chooses **Add note**. Mesurer stores the target locator/fingerprint, baseline geometry, related visual state, and the user's note.

```js
await window.__MESURER__.context({ annotation: annotationId })
```

The user note is intent. Computed DOM data and visual measurements are supporting evidence.

## Relevance rules

Context collection is intentionally deterministic rather than AI-powered.

For selection/annotation scope:

- a measurement is relevant when it references a selected target or overlaps the scoped region;
- a held distance is relevant when either endpoint references a selected target or either endpoint rect overlaps the scoped region;
- a guide is relevant when it crosses/touches the scoped rect, including a small edge tolerance;
- rulers/X-ray are recorded as visual-state metadata rather than being treated as semantic instructions themselves.

This keeps the payload explainable and stable.

## Annotation rebinding after HMR

A live `HTMLElement` cannot survive DOM replacement. Each element annotation therefore records:

- a stable selector candidate;
- tag/id/test-id/role/aria/class fingerprint data;
- its last known viewport rect;
- the original baseline snapshot.

A MutationObserver triggers refresh after DOM changes. Mesurer rebinds only when the selector resolves to exactly one fingerprint-compatible element. Otherwise the target remains stale.

This conservative rule is important: a visual QA tool must not silently validate the wrong component after a refactor.

## Review after an agent edit

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

The review includes:

- original annotation note;
- target connection/rebinding status;
- baseline targets/guides/measurements/distances;
- fresh `MesurerContextV1` for the same annotation;
- measurable before/current geometry changes.

This supports the intended loop:

```text
human marks issue
  → agent reads annotation
  → agent edits source
  → normal HMR/render
  → agent waits for stability
  → Mesurer re-resolves/re-measures
  → agent checks review
  → iterate or hand back to human
```

Mesurer can prove numeric changes. It should not claim subjective notes such as “make this feel lighter” are objectively solved; those still require model/human visual judgment.

## Screenshot evidence

Mesurer does not render a fake DOM screenshot. The browser/harness takes real pixels.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // capture the actual current viewport
  // capture plan.focus when available
} finally {
  await window.__MESURER__.finishCapture()
}
```

A capture plan always asks for the current viewport and may add a focused evidence crop. The focus crop is the union of relevant targets, measurements, and distance endpoints plus context padding, clamped to the current viewport. It is deliberately not just the selected element's bounding box because a spacing/alignment issue often depends on nearby evidence.

During capture:

**Hidden chrome**
- main/tool extension toolbars;
- settings and tool panels;
- context/comment editor;
- Copy/Send controls;
- other Mesurer inspector controls.

**Preserved evidence**
- page content;
- selection/annotation markers;
- rulers and guides;
- measurements and held distances;
- rendered pixel labels/alignment evidence.

## Copy Context

The visible **Copy context** action and `copyContext()` format the same `MesurerContextV1` used elsewhere.

```js
await window.__MESURER_INSTANCE__.copyContext({ annotation: annotationId })
```

The browser API also exposes:

```js
await window.__MESURER__.contextText({ annotation: annotationId })
```

Clipboard copy first uses the modern Clipboard API and falls back to a user-gesture-compatible textarea copy path where necessary.

## ACP

Mesurer intentionally does not discover or manage individual coding agents.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const prompt = toAcpContentBlocks(context, evidenceImages);
```

The ACP client that already owns the target session sends those content blocks. If images are not supported by that ACP agent/session, send the text block only.

There are no Mesurer-specific OpenCode/Pi/Cursor/etc. transports.

## Agent Skill

The npm package ships `skills/mesurer-ui/SKILL.md`. A generic installer can place it in a project's standard Agent Skills discovery directory:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

The repository also dogfoods the same workflow through `.agents/skills/mesurer-ui/SKILL.md`.

The skill tells agents when Mesurer is relevant and, most importantly, requires rendered-browser revalidation for visual work when Mesurer is available.

## Browser extension

The first-party MV3 extension is the recommended zero-source-change human path for arbitrary pages. It packages the same `inject-script` runtime and toggles it on the active tab using `activeTab` + `scripting`; it does not fork Mesurer or request persistent access to every site.

The old DevTools Snippet path remains a useful no-extension fallback.
