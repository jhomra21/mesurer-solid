# @jhomra21/mesurer-solid-core

Framework-neutral Mesurer primitives. This package deliberately has no Solid, React, Vue, Electron, DOM, or browser dependency.

It owns the observable state primitive, typed event bus, plugin registrations, scoped disposal, command/hook dispatch, state slices, runtime introspection, and shared domain contracts used by renderer and host adapters.

Built-in and third-party features use the same `MesurerPlugin` API. A plugin can register tools, settings sections, overlays, commands, hooks, and state slices. Registrations are ordered and disposable, and a loaded plugin can be removed or replaced without rebuilding the host application.
