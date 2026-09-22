# @jhomra21/mesurer-solid-dom

Browser/DOM boundary for Mesurer. It contains host detection, mounting, storage, element identity, point hit testing, and DOM inspection helpers while keeping `@jhomra21/mesurer-solid-core` free of browser globals.

Point inspection works with general DOM `Element` targets, including SVG. The visual hit resolver also handles pointer-transparent descendants without scanning the full document.

Electron renderer processes use this same DOM boundary. Mesurer does not import Electron or require Electron APIs for inspection; privileged application behavior belongs behind an application-owned preload bridge or plugin adapter.

Application users normally install `mesurer-solid` rather than importing this internal workspace directly.
