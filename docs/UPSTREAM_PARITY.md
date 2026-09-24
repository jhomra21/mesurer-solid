# Upstream parity

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. Upstream audits keep adopted behavior source-faithful and product differences explicit.

## Current audit

| Reference | Commit |
| --- | --- |
| Historical visual baseline | `605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`) |
| Previous upstream audit | `bdc027e51011898a1fcc2532da1db3acf63a84a3` (`main`, audited 2026-09-22) |
| Current upstream audit | `d47fd6056a01da9c442ae04840ec4d0dd46a1257` (`main`, audited 2026-09-23) |

The current delta is the merged `feat/add-grid` series centered on `03e7606997cb8a1c3f1214f61602210142ef67da`, followed by fixes such as `89e9c322...` for extension navigation and `1fdf75dfa...` for Layout Guide visibility. It combines Layout Guides, route-scoped page state, toolbar/session persistence, extension recovery, and several Inspect/measurement refinements.

For each meaningful upstream change, decide whether Mesurer Solid should **adopt**, **intentionally diverge**, or treat it as **not applicable**.

### 2026-09-23 Layout Guides and page-state follow-up

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Layout Guides with columns, rows, grid, visibility, color, opacity, count/size/gutter/offset/alignment controls | **Adopted through the plugin architecture** | Mesurer Solid exposes `layoutGuides()` as a first-party plugin with page-scoped persisted state, history-aware JSON commands, a typed `layout-guides:v1` service, plugin-owned panel, and evidence overlay. Pure normalization/geometry stays in core; the mounted root API does not gain one method per guide operation. |
| Keep Layout Guides active after their menu closes | **Adopted** | Panel visibility and guide visibility are separate state. Closing the plugin panel leaves the saved guide overlay intact. |
| Scope overlays/workspace to URL, including query strings, and merge persisted pages | **Adopted through a shared page-identity seam** | Default workspace persistence uses pathname plus sorted query parameters (and `#/` hash routes) and stores independent page snapshots. Context annotation persistence and Layout Guides use the same page ownership model rather than feature-specific URL checks. |
| Remember toolbar position across page changes | **Adopted as tab-session UI state** | Toolbar placement survives route changes and reloads in `sessionStorage` but is deliberately excluded from page-owned workspace persistence. |
| Restore the Chrome extension after reload/in-tab navigation | **Adopted without broad host permissions** | The extension remembers explicitly opened tabs in `chrome.storage.session`, reuses a live instance, and restores a missing one when `activeTab` still authorizes injection. If navigation revokes the grant, recovery stops until another explicit click. Mesurer Solid does not adopt upstream's broad `host_permissions`. |
| Refined Inspect/container/guide measurement geometry | **Adopted with Mesurer Solid's richer distance model retained** | Container spacing measures from the padding box, separated boxes anchor within their shared overlap, and guide-line-to-box distances use the line as real geometry. Existing multi-selection, pairwise, and diagonal evidence remains intact. |
| Upstream comment-card/effect polish in the same series | **Intentional divergence / not directly applicable** | Mesurer Solid keeps Context annotations and its existing source-linked ownership contracts instead of importing upstream's threaded-comment presentation model. |

### 2026-09-22 Inspect and toolbar follow-up

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Pointer-transparent visual hit testing and native top-target preservation | **Adopted with shared DOM resolver** | Select and agent point inspection now use the same visual resolver. Browser coverage includes transparent descendants, overlapping native targets, transforms, canvas, closed shadow roots, and a 1,000-node fixture. |
| General `Element` / SVG Inspect targets | **Adopted with explicit HTML-only mutation boundaries** | Renderer selection, measurement references, Context, and annotation geometry accept DOM `Element`, including SVG. Direct text editing, Arrange transforms, and native CSS-anchor mutation still narrow to `HTMLElement`. Chromium covers physical SVG selection, point inspection, Context, and programmatic `select()`. |
| Upstream stress-bench/site fixture growth | **Not library parity by itself** | Mesurer Solid keeps its own focused browser fixtures. Relevant hit-testing and geometry cases are covered there instead of copying upstream site/demo content. |
| Dragging the toolbar from controls or chrome | **Adopted with the existing Solid drag engine** | Drag starts remain thresholded. Crossing the threshold closes an open Settings, Guide, or plugin surface, while real menus, dialogs, form controls, contenteditable regions, and slider surfaces retain pointer ownership. |
| Settings and toolbar-menu trigger re-click | **Already equivalent; now browser-covered** | Settings, Guide orientation, and plugin split-menu triggers already toggle their own surface. The toolbar drag contract protects that behavior while also checking post-drag click suppression. |
| Theme-aware ruler fade color | **Already adopted** | Ruler gradients already use `--msr-surface`, including Dark and System-dark themes. |
| Inspect/Annotate group switching used by upstream toolbar tests | **Intentional divergence** | Mesurer Solid keeps one stable toolbar and does not adopt upstream's grouped toolbar model. |

### 2026-09-22 theme delta classification

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Persisted `system | light | dark` appearance and public theme option | **Adopted** | Mesurer Solid now exposes `theme` on the public mount API and the Settings Appearance control. The value persists with normal Mesurer settings. |
| Theme-aware light and dark colors, controls, shadows, and system color-scheme handling | **Adopted with Solid ownership adaptation** | The upstream palette is mapped to Mesurer theme tokens. The owning theme is also propagated to document-backed Context, Typography, direct-edit, and portaled selection UI so isolated mounts do not split into mixed themes. |
| Dark-surface browser coverage | **Adopted with broader coverage** | The Chromium contract checks explicit Light and Dark modes, System changes through `prefers-color-scheme`, persistence, the isolated renderer, document Context, and document Typography. |
| Copy only unresolved threaded comments and bulk Resolve all | **Intentional divergence** | Mesurer Solid uses Context annotations rather than upstream threaded comments. Codex completion already removes only the exact delivered annotations when that behavior is enabled. |
| Comment overflow-menu and delete-confirmation anchor fixes | **Not applicable as a direct port** | Upstream preserves the clicked overflow action anchor while its comment menu closes. Context annotation deletion is a direct action and does not use that menu-to-confirmation path. |

### 2026-09-21 delta classification

| Upstream delta | Decision | Reason for this release |
| --- | --- | --- |
| Resolved-comment state, filtering, reopen/delete flows, and all-comments search | **Intentional divergence** for `0.1.8` | These changes extend upstream's threaded-comment model. Mesurer Solid intentionally uses Context annotations with target identity, immutable baselines, review APIs, and optional Codex queue delivery; the stable candidate does not claim threaded-comment parity. |
| Viewport context in copied review evidence | **Adopted outcome; independently implemented** | `MesurerContextV1` already records viewport width/height, device pixel ratio, and `scrollX`/`scrollY` for workspace, selection, and annotation Context, so agents receive equivalent page-position evidence without importing upstream's comment serializer. |
| Comment-card/list action menus and delete-confirmation anchoring | **Not applicable as a direct port** | The behavior belongs to upstream comment surfaces that Mesurer Solid does not ship. Context annotation cards have their own ownership, scroll attachment, and interaction contracts. |
| Closing transient surfaces when another toolbar menu opens or an outside pointer takes ownership | **Adopted outcome; independently implemented and validated** | Mesurer Solid's Settings, plugin split menus, Typography dropdowns, Context cards, and other inspector surfaces already have explicit ownership and dismissal contracts covered by browser/manual acceptance tests. No React-specific upstream implementation is required. |
| Toolbar drag/collapse interruption hardening and tooltip suppression during motion | **Adopted outcome where it matches Mesurer Solid's one-toolbar model** | Mesurer Solid independently validates toolbar dragging, compact/expanded state, reduced-motion-aware transitions, and stable active-tool ownership. Upstream's Inspect/Annotate grouping remains outside the product model. |
| Centralized floating-surface shadow/radius polish | **Adopted as design guidance after 0.1.8** | The current upstream floating shadow and control-radius language now guides new or deliberately refreshed Mesurer Solid surfaces through the design-review contract. Existing accepted Context, Typography, Settings, and toolbar chrome remains unchanged until a dedicated visual-parity migration proves the update. |

This audit adds no upstream blocker for `0.1.8`: the new comment work belongs to an explicit product divergence, while the shared interaction outcomes relevant to Mesurer Solid are already covered by its own accepted contracts.

### 2026-09-15 delta classification

| Upstream delta | Decision | Reason for this release |
| --- | --- | --- |
| DOM-attached comment threads, replies, all-comments panel, persistence, and agent copy/export | **Intentional divergence** for `0.1.7` | Mesurer Solid already ships the separately designed Context annotation model: target- or region-bound review notes with machine-readable baselines and agent APIs. The accepted stable candidate does not claim upstream threaded-comment parity, and replacing that model immediately before stable promotion would invalidate the real-consumer acceptance that just passed. |
| Iframe-aware selection, X-ray, and comment targeting | **Intentional divergence** for `0.1.7` | The stable candidate does not claim cross-frame inspection parity. Adopting upstream's shared document-tree targeting requires a separate host/isolation and browser-contract cycle rather than a release-only backport. |
| Configurable Inspect info card, copyable values, and upstream Typography presentation changes | **Intentional divergence** for `0.1.7` | Mesurer Solid has its own Typography/direct-edit UI and inspection presentation. No public docs promise the new upstream card UX. Revisit in the next source-first UI cycle. |
| Guide context menus, multi-guide removal, guide-linked measurements, and the refined `Option+S` pin workflow | **Intentional divergence** for `0.1.7` | Mesurer Solid retains its currently shipped Guides/Distance workflow and does not claim `Option+S` pinning. These interactions should be adopted together, not partially, after stable. |
| Configurable upstream feature flags and unified initial workspace/menu state | **Not applicable as a direct port** | Mesurer Solid exposes tools through its plugin runtime, mount options, and persisted workspace/settings contracts instead of upstream's React component feature-flag API. Equivalent product needs should be evaluated through those public APIs. |
| Keyboard ownership, shortcut gating, host-menu protection, scoped styles, and page-focus isolation fixes | **Adopted outcome; independently implemented and validated** | These are already stable requirements in Mesurer Solid's host-isolation architecture. The accepted candidate passed host compatibility, browser contracts, plugin persistence, toolbar, Trusted/isolated interaction, and real-consumer tests without importing upstream's React-specific implementation. |
| Live overlay positioning, animated-layout tracking, tooltip/card collision handling, and selection geometry hardening | **Adopted outcome; independently implemented and validated** | Mesurer Solid's document/native anchoring, cached scroll compensation, renderer-root ownership, and selection contracts cover the same class of adopted behavior. The accepted candidate passed window/nested scroll, Typography anchoring, visual parity, and manual 240px annotation tracking. |
| Extension screenshot capture bridge removal | **Intentional divergence** | Mesurer Solid keeps its own private Chromium extension adapter because the extension still captures with the temporary `activeTab` grant. The same Screenshot implementation can also use an application-owned native host capability or browser `getDisplayMedia()`. No upstream bridge compatibility is claimed. |
| Upstream visual polish such as floating-card radii, cursor behavior, and hover-lightening | **Intentional divergence unless separately adopted** | Mesurer Solid keeps source-first shared behavior where it is part of the adopted contract, but its plugin-owned Context/Typography/Arrange surfaces have independent visual ownership and parity tests. Cosmetic upstream changes are not silently treated as stable requirements. |

This classification satisfies the stable-readiness upstream gate without adding a large interaction model after the accepted release candidate. A newer upstream feature is not automatically a blocker when the product difference is explicit and the public package does not claim the capability.

### 2026-09-13 delta classification

The previous audit covered `b14c2bed...`, **"feat: pin option measurements with option+s (#25)"**.

| Upstream delta | Decision | Reason for this release |
| --- | --- | --- |
| `Option+S` pins the current Option-distance preview | **Intentional divergence** for the `0.1.7` release train | Mesurer Solid already exposes persisted held distances through its own measurement/workspace model and documents `Alt` / `Option` as the Distance overlay modifier. This stable candidate does not claim an `Option+S` pin shortcut, and adding a new global shortcut immediately before stable promotion would expand the manually tested interactions. Revisit in the next source-first feature cycle. |
| Upstream stops Alt-click distance holding from consuming Guide clicks | **Intentional divergence** for the `0.1.7` release train | The behavior belongs to the same pinned-distance interaction redesign. Mesurer Solid keeps its currently shipped held-distance interaction for this release rather than partially importing one side of the upstream model. |
| Cursor/element attachment and live refresh for the new pins | **Not applicable until pinning is adopted** | Mesurer Solid should adopt these geometry rules together with the pin interaction if/when the feature is ported, not as detached internal machinery. |

## Product decisions

| Upstream area | Mesurer Solid decision |
| --- | --- |
| Core measurement, X-ray, guides, rulers, settings | Source-first port with historical visual/interaction validation |
| System, Light, and Dark appearance | Adopted from upstream `c20ad51`; theme state also follows Mesurer Solid document-backed UI |
| SVG and general DOM `Element` selection | Adopted from the post-theme Inspect work; Select, point inspection, Context, and annotation geometry accept SVG while HTML-only editing/Arrange paths stay explicit |
| Native Color Picker | Adopt where `EyeDropper` is operational; hide in unsupported hosts |
| Text Inspector | Adopt inspection behavior; visible label is **Typography**, internal id stays `text-inspector` |
| Layout Guides | Adopt as optional `layoutGuides()` plugin with page-scoped state, history-aware commands, typed service, and Context evidence |
| Screenshot region selection | Adopt as optional `screenshot()` from `mesurer-solid/plugins`; Mesurer Solid adds preview/viewer plus automatic native-host, Chromium-extension, and browser capture selection |
| Global Shortcuts setting | Adopt the persisted master on/off switch; no per-command remapping UI is added |
| Compact toolbar | Adopt presentation: one stable toolbar, full-height separators, active-tool retention, 150ms motion, reduced-motion support |
| Option-distance pinning (`Option+S`) | Intentionally not adopted in the `0.1.8` stable line; Mesurer Solid retains its existing held-distance workflow |
| DOM-attached threaded comments | Intentionally not adopted; Mesurer Solid uses Context annotations instead |
| Iframe selection/comment targeting | Intentionally not adopted for `0.1.8` |
| Inspect/Annotate group switching | Intentionally not adopted |
| Arrange as a toolbar mode | Intentionally not adopted; Arrange remains an optional plugin tool |
| Arrow, pen, and freeform drawing annotations | Intentionally not adopted |
| Site, analytics, footer, and repository-only changes | Not library parity |

Framework-neutral mounting, the plugin runtime, Context, Arrange, direct text editing, host isolation, and the private Solid 2 renderer are Mesurer Solid-specific architecture.

## Toolbar boundary

Upstream has continued evolving its grouped Inspect/Annotate toolbar, floating cards, and comment controls. Mesurer Solid adopts shared presentation improvements only when they fit its one-toolbar product model; it does not adopt upstream tool-group switching or comment-mode chrome by implication.

The shipping toolbar keeps one stable tool order. Compact presentation hides inactive controls, preserves every active control and its state, and expands back to the same toolbar. Motion uses a 150ms interruptible transition and respects reduced motion. Arrange remains a normal plugin contribution.

The historical `605d202` parity suite still covers shared page/result and Settings behavior, but it predates the current toolbar shell. Toolbar chrome is excluded only from that historical geometry comparison and is covered by a dedicated current Chromium toolbar contract instead.

## Keyboard boundary

Upstream exposes a persisted shortcuts switch and continues hardening keyboard ownership around page editors, overlays, and comment inputs.

Mesurer Solid adopts the global shortcut product contract across both built-in and plugin-contributed shortcuts. Keyboard ownership is resolved before the shortcut gate: deep active-element lookup follows open Shadow DOM focus, host-page inputs/selects/textareas/contenteditable retain normal typing, Mesurer-owned editable controls retain their local keyboard behavior, and Escape is left to lifecycle/cancel handling instead of being swallowed by the configurable shortcut gate.

Upstream does not define Mesurer Solid's plugin shortcut model, direct-edit model, or Context composer lifecycle, so those remain governed by Mesurer Solid's own ownership tests. The upstream distance-pin shortcut remains deliberately excluded from this release; the public shortcut table therefore remains accurate rather than implying parity that is not present.

## Mesurer Solid extensions

### Typography and direct editing

Mesurer Solid exposes the upstream Text Inspector concept as **Typography** and adds reversible direct copy/type editing. The internal `text-inspector` id, `A` shortcut, icon, and coordination contract remain compatible.

Direct editing follows native browser editability and records Before/Desired copy and style intent. If the application changes the value, Mesurer stops managing that preview value. It also owns one visible edit/selection lane: duplicate ordinary selected chrome is paint-suppressed, the dimensions pill remains measurable, source-linked Typography stays stable under pointer motion and follows the source through scroll/offscreen movement, and the transient selection annotation trigger is hidden only for the active edit. See [Direct text editing and Typography](./TEXT_EDITING.md).

### Arrange

Arrange records layout intent without changing application source. It activates Select automatically, keeps Arrange/Select coordination explicit, and previews Desired geometry with ownership-aware temporary transforms. See [Arrange](./ARRANGE.md).

### Context annotations

Upstream now ships DOM-attached threaded comments. Mesurer Solid intentionally keeps its separate target- or region-bound Context note model with machine-readable target identity, geometry, measurements, styles, and review baselines. An unsaved composer belongs to the selection that opened it and is abandoned when another selection takes ownership; saved notes remain durable review objects.

Context annotation presentation is source-linked. Add Note, the composer, saved markers and panels, and the ownership edge stay attached to their page target through window and nested scrolling. Saved panels keep a target-relative page point, repeated-note markers stay nearby and separate, and Add Note remains available while another note is open. Context cards also occlude Select hover and selection evidence, including when Mesurer's outer host is in the browser top layer, so page evidence cannot paint through a saved card or the new-note composer.

Direct text editing covers exact copy/type intent; screenshots remain visual evidence. See [Context](./CONTEXT_WORKFLOW.md).

### Screenshots

Mesurer Solid keeps the upstream region-capture interaction behind optional `screenshot()` from `mesurer-solid/plugins`. Capture-source selection is private to the plugin. Application-native hosts can expose `window.__MESURER_HOST__.captureScreenshot`, the Chromium extension uses its own adapter, and ordinary browser pages use `getDisplayMedia()`. Mesurer Solid also owns output preferences, HiDPI cropping, preview/viewer behavior, and cleanup. See [Screenshots](./SCREENSHOTS.md).

## Release rule

A newer upstream feature is not automatically a Mesurer Solid release blocker. A stable release is blocked when an adopted behavior has drifted, a public capability claim is false, or an important product difference is undocumented.

Before a stable release, compare upstream `main` from the current audited SHA and classify meaningful deltas as **adopt**, **intentional divergence**, or **not applicable**. Do not turn unrelated upstream repository churn into an automatic feature backlog.