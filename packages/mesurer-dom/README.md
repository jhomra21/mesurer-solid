# @jhomra21/mesurer-solid-dom

Browser/DOM boundary for Mesurer. It contains host detection, mounting, storage, element identity, and DOM helpers while keeping `@jhomra21/mesurer-solid-core` free of browser globals.

Electron renderer processes use this same DOM boundary. Mesurer does not import Electron or require Electron APIs for inspection; privileged application behavior belongs behind an application-owned preload bridge or plugin adapter.

Application users normally install `mesurer-solid` rather than importing this internal workspace directly.
