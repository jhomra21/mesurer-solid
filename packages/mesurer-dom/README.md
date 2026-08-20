# @jhomra21/mesurer-dom

DOM/browser host boundary for Mesurer. It contains browser environment, portal-mount, storage, and host-detection helpers while keeping `@jhomra21/mesurer-core` free of DOM globals.

Electron renderer processes use this same DOM boundary; Electron main/preload integration remains an optional adapter rather than a core dependency.
