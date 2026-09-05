# @jhomra21/mesurer-solid-core

Framework-neutral Mesurer state and plugin primitives. This workspace has no Solid, React, Vue, Electron, DOM, or browser dependency.

It owns observable state, events, plugin registration, commands, hooks, services, history-enabled state slices, scoped disposal, and shared domain contracts used by renderer and host adapters.

Plugins can register tools, settings, overlays, commands, hooks, state, services, and lifecycle cleanup. Registrations are disposable, and asynchronous plugin setup can be cancelled so late registrations are cleaned up instead of leaking after their owner is gone. Cancellation is scoped to the load that owns those registrations; unrelated plugins on a shared host are not disposed.

This is an internal workspace dependency of the public `mesurer-solid` package. Application users normally import the public package instead.
