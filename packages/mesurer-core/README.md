# @jhomra21/mesurer-solid-core

Framework-neutral Mesurer state and plugin contracts. This workspace has no Solid, React, Vue, Electron, DOM, or browser dependency.

It owns observable state, events, plugin registration, commands, hooks, services, history-enabled state slices, scoped disposal, and shared domain contracts used by renderer and host adapters.

Plugins can register tools, settings, overlays, commands, hooks, state, services, and lifecycle cleanup. Registrations are disposable, and asynchronous plugin setup can be cancelled so late registrations are cleaned up instead of leaking after their owner is gone. Cancellation is scoped to the load that owns those registrations; unrelated plugins on a shared host are not disposed.

Use `createMesurerRuntime({ plugins })` when one owner should create a host and load an initial plugin set in one operation. The input accepts readonly plugin lists. If initial loading fails, the partial host is disposed before the error is rethrown. Use `createMesurerPluginHost()` directly when the caller needs to own incremental loading itself.

## Command and state values

Plugin state, command arguments, command results, hook events, and command-source metadata use `PluginValue`: strings, numbers, booleans, null, arrays of those values, or objects containing those values.

A command handler may return a `PluginValue`. `command.execute()` resolves that value instead of discarding it. The browser agent's `command(id, args?)` path preserves the same JSON-safe result, so generic automation can use the command registry without a feature-specific transport.

Opaque runtime objects do not belong in command results or persisted state. Put richer host or renderer capabilities behind a typed service instead. Public mounted consumers resolve those through `MountedMesurer.service<T>(id)`.

This is an internal workspace dependency of the public `mesurer-solid` package. Application users normally import the public package instead.
