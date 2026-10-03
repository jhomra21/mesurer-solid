# @jhomra21/mesurer-solid-dom

This package is Mesurer's browser and DOM boundary. It contains host detection, mounting, storage, element identity, point hit testing, and DOM inspection helpers while keeping `@jhomra21/mesurer-solid-core` free of browser globals.

Point inspection works with general DOM `Element` targets, including SVG. The visual hit resolver handles pointer-transparent descendants and sibling overlays without scanning the full document. It checks candidate paint order against the browser hit stack, so clipped or lower painted overlays do not steal the target.

Electron renderer processes use this same DOM boundary. Mesurer does not import Electron or require Electron APIs for inspection. Screenshot and Codex privileges stay behind narrow host capabilities; Recording can use the package-owned `mesurer-solid/electron` bootstrap so ordinary applications do not add their own Recording preload or IPC.

Application users normally install `mesurer-solid` rather than importing this internal workspace directly.
