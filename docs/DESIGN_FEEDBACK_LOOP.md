# Design feedback loop

Mesurer turns rendered UI state and human visual intent into evidence that can be consumed before and after source edits.

For the exact agent procedure and APIs, use [Agent Integration](../packages/mesurer/AGENT_INTEGRATION.md). This guide describes the review model rather than duplicating the operational steps.

## The loop

A complete visual change has four phases:

1. **Read intent.** Preserve the existing selection, annotations, Arrange Desired state, text and typography Desired state, measurements, guides, and relevant screenshot context.
2. **Edit source.** Change the application through its normal workflow. Do not mutate Mesurer evidence to make the page appear correct.
3. **Observe Live.** Wait for the rendered page to settle and inspect the affected targets again.
4. **Compare.** Evaluate Live against the original problem and any saved Desired or baseline evidence.

The loop ends on rendered evidence, not on a successful build.

## Evidence types

Use the evidence that matches the request:

- **Context/selection** for exact geometry, typography, overflow, and relationships.
- **Annotations** for target-bound notes with before/current review.
- **Arrange** for Before/Desired/Live geometry.
- **Text editing** for Before/Desired/Live copy and typography.
- **Measurements/guides** for alignment and spacing relationships.
- **Screenshots** for visual context that structured measurements do not express well.

Do not substitute one evidence type for another merely because it is easier to automate.

## Relationships matter

Visual requests often concern relationships rather than isolated elements: shared edges, gaps, baselines, repeated dimensions, overflow, hierarchy, or alignment across a group.

For multi-selection work, inspect pairwise/relational evidence and verify the same relationship after the source change.

## Desired is not Live

Arrange and direct text editing can preview Desired state without changing application source. That preview is intent, not completion evidence.

After editing source, compare against the real Live rendering with the preview inactive or through the relevant review API.

## Browser evidence

A screenshot can prove appearance that structured geometry cannot, but it should not replace exact measurements when the request is numeric or relational.

Use the browser controller for ordinary task screenshots. Use Mesurer's screenshot plugin when the task is specifically about the human capture feature.

## Completion

A visual task is complete when the relevant Live evidence matches the requested outcome and the exercised browser path is clean.

A passing build or a CSS declaration is implementation evidence. It does not prove the rendered result.

See [Context](./CONTEXT_WORKFLOW.md), [Arrange](./ARRANGE.md), [Text Editing](./TEXT_EDITING.md), and [Screenshots](./SCREENSHOTS.md) for feature-specific behavior.
