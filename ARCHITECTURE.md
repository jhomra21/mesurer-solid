# Architecture notes

## Solid 2 rules for this port

### 1. Do not port React hooks one-for-one

Simple state from Mesurer's React hooks belongs in the central Solid model. Behavior remains modular only when it owns a meaningful external lifecycle (pointer input, keyboard input, resize tracking, persistence, history, etc.).

### 2. Treat writes as staged

Solid 2 batches writes. Code must not depend on a setter being immediately visible to reactive reads in the same synchronous turn.

Preferred event shape:

```ts
const next = calculateFromEvent(event);
useImperatively(next);
setState((draft) => {
  draft.value = next;
});
```

Use `flush()` only at a proven imperative boundary, never as a default fix for interaction code.

### 3. Plain DOM handles stay plain

DOM nodes, pointer-capture targets, observer instances and other imperative handles are plain closure variables unless their identity needs to render UI.

### 4. Effects are split compute -> apply

Solid 2 `createEffect` should make tracked inputs explicit and keep external side effects in the apply function. Cleanup is returned by the apply function.

### 5. Browser lifecycle uses `onSettled`

The measurement runtime is a browser capability. Listeners/observers are installed after settlement and cleanup is colocated with setup.

### 6. Props stay reactive

Do not destructure component props at the function boundary. If an intentionally one-time initial value is needed, read it under `untrack`.

### 7. Framework-neutral code stays framework-neutral

Geometry, DOM measurement, distance math, snapping, persistence formats and selection algorithms must not import Solid. This keeps the port maintainable against upstream Mesurer and leaves room for other renderers later.

## Tooling

The workspace is Bun-first (`bun@1.3.14`). Workspace scripts use Bun filters, while Vite/Vitest remain the build and browser-test tooling for the Solid 2 package.
