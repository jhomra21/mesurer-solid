# Third-Party Notices

## Mesurer

Portions of this repository are adapted from [`ibelick/mesurer`](https://github.com/ibelick/mesurer), including framework-neutral measurement/runtime logic and the user-facing visual design system ported to Solid JSX.

Mesurer is licensed under the MIT License:

> MIT License
>
> Copyright (c) 2026 Julien Thibeaut
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Phosphor Icons

The context, annotation, and send-action glyph paths added by Mesurer Solid use the Regular icon set from [`phosphor-icons/core`](https://github.com/phosphor-icons/core) to match the visual language of the upstream Mesurer toolbar.

Phosphor Icons is licensed under the MIT License:

> MIT License
>
> Copyright (c) 2023 Phosphor Icons
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.


## MediaBunny

Mesurer Solid uses [MediaBunny 1.59.0](https://github.com/Vanilagy/mediabunny/tree/v1.59.0) for browser video encoding, inspection, trimming, resizing, conversion, and export.

MediaBunny is licensed under the Mozilla Public License 2.0 (MPL-2.0). Mesurer keeps MediaBunny on a separate distribution boundary:

- ESM consumers install exact `mediabunny@1.59.0` as a runtime dependency instead of receiving MediaBunny code folded into Mesurer's MIT-licensed bundles.
- Classic browser injection and the Chromium extension load `mediabunny-vendor.js` as a separate MPL-labeled artifact before the Mesurer injector.
- The MediaBunny npm package includes its `LICENSE` and `src` directories. The corresponding source is also available from the upstream repository and tag linked above.

The full MPL-2.0 license is included with the MediaBunny dependency.
