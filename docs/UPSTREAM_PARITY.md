# Upstream parity

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. Upstream audits keep adopted behavior source-faithful and product differences explicit.

## Current audit

| Reference | Commit |
| --- | --- |
| Historical visual baseline | `605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`) |
| Previous upstream audit | `ca432288b8d803a2c134dba51da971f54931db8f` (`main`, verified 2026-10-01) |
| Current upstream audit | `7f3f0a49ca538fea3d4bdeb8dc0d830a51678270` (`v0.2.4`, verified 2026-10-07) |

The current audit advances from upstream `26110edbbd8cd9c22c32a82b1b91073912fbdfc2` (`v0.2.3`) to `7f3f0a49ca538fea3d4bdeb8dc0d830a51678270` (`v0.2.4`). The meaningful runtime delta adds Motion inspection/playback, same-origin iframe-aware selection/geometry/X-ray/comment targeting, and smaller control, keyboard, floating-surface, and extension hardening. Mesurer Solid adopts the Motion and same-origin frame capabilities through its Solid/plugin architecture, keeps its Context note model instead of upstream threaded comments, and does not copy React-only or extension-specific implementation shapes when equivalent behavior already exists.

For each meaningful upstream change, decide whether Mesurer Solid should **adopt**, **intentionally diverge**, or treat it as **not applicable**.


## Visual parity baselines

The historical `605d202a4cd0404bb7a4808a11b574174bb14d1a` suite still protects the accepted shared renderer behavior that Mesurer Solid inherited before the current toolbar and Settings work. It is not evidence that a newly ported component matches current React Mesurer.

When Mesurer Solid adopts or materially updates an upstream UI component, add a focused browser comparison against the current audited upstream commit. The comparison should isolate that component from intentional product differences around it and check rendered pixels plus its control, layout, style, and icon contract.

Layout Guides follows this rule. Its initial, list, editor, aligned-editor, and grid states compare directly with the current audited upstream `26110edbbd8cd9c22c32a82b1b91073912fbdfc2` (`v0.2.3`), including the shared floating-menu hairline/radius tokens adopted during stable readiness. Mesurer Solid keeps its one-toolbar plugin architecture outside that component comparison.

Current React Settings is a separate migration. Upstream now uses a sectioned Settings panel with additional React-owned sections, while Mesurer Solid still has the accepted tabbed Settings contract plus Solid plugin settings and presentation controls. This change shares the control implementation but keeps Settings on its historical presentation through the explicit `legacy` control variant. Do not partially restyle Settings. A future migration must move the whole panel and its Solid-owned additions together, with its own current-source parity coverage.

These dated sections record when each decision was audited. Their decision text describes the current product boundary; version history belongs in `CHANGELOG.md`.

### 2026-10-07 upstream 0.2.4 audit

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Motion discovery, preview, playback, scrubbing, speed controls, keyframe inspection, and observed JavaScript motion | **Adopted** | Mesurer Solid ports the framework-neutral motion engine and a Solid-owned Motion surface. A real Chromium contract covers CSS animations, Web Animations API targets, pause/play, scrubbing, playback rate, keyframes, target switching, static-target hiding, and clean Solid 1/2 host behavior. Motion stays out of active Recording so the capture interaction retains host-page pointer ownership. |
| Same-origin iframe selection and frame geometry projection | **Adopted** | Select now listens across accessible same-origin document trees, projects pointer coordinates and measurement rectangles through scaled/transformed frame ancestry, keeps selection chrome in the top Mesurer overlay, and fails closed for inaccessible/cross-origin frames. Chromium physically clicks an iframe child and verifies projected selection geometry. |
| Iframe-aware X-ray and annotation/comment targeting | **Adopted with Context mapping** | Mesurer Solid maps upstream comment targeting to its own Context annotations. X-ray propagates through accessible same-origin documents, Context rebinding/watchers include frame documents, and Context evidence/markers/highlights use top-level projected geometry. The iframe contract covers X-ray plus selection/annotation Context rather than importing upstream threaded comments. |
| Native color input live updates | **Already adopted** | Mesurer Solid's native color control already handles the browser `input` event, so drag/live picker updates do not require another port. |
| Keyboard event propagation/ownership hardening | **Already equivalent or stricter** | Mesurer Solid resolves editable/Mesurer ownership before shortcut dispatch and already stops or preserves propagation at the appropriate boundary. The upstream patch does not add a missing product behavior. |
| Floating-surface viewport placement refinements | **Already equivalent in owned surfaces** | Toolbar menus, Settings, Color Picker, Context, Typography, and Motion use viewport-aware placement/clamping under Mesurer Solid's one-toolbar ownership model. Focused contracts protect their occlusion and anchor behavior. |
| Extension recording/content-script fallback changes | **Not applicable as a direct port** | Upstream's fallback belongs to its React extension mount/player-url architecture. Mesurer Solid uses its private capture adapter and MediaBunny recording pipeline with browser/native/extension capability selection and existing fallback coverage. |
| Upstream release metadata for v0.2.4 | **Not applicable** | Versioning and publication metadata are repository-specific. |

### 2026-10-03 upstream 0.2.3 stable-readiness audit

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Dependency-free GIF recording export | **Intentional divergence** | Mesurer Solid's Recording contract is encoded video through MediaBunny, with WebM and capability-gated MP4. The public package does not claim GIF export, so adding a separate GIF encoder would widen the media surface without serving the current product contract. |
| Capability-gated MP4 export | **Already adopted by equivalent MediaBunny capability checks** | `supportedRecordingFormats()` exposes MP4 only when the runtime has a compatible MediaBunny encoder, and the Recording browser contract exercises real WebM/MP4 export. |
| Recording preview transparency, theme handoff, iframe identity, and pointer-blocking fixes | **Adopted outcomes; iframe mechanics not applicable** | Mesurer Solid's preview is Mesurer-owned DOM rather than an iframe. It follows Mesurer theme tokens, owns its hit-testing directly, and has browser coverage for repeated preview interaction, export menus, dismissal, and Screenshot handoff. |
| Shortcuts enabled by default in persistence and extension storage | **Already adopted** | Mesurer Solid's persisted global Shortcuts setting defaults on; disabling it gates global built-in/plugin shortcuts while preserving toolbar and local Escape/editor behavior. |
| Toolbar submenus portal above the Recording card | **Adopted through the one-toolbar stacking boundary** | Mesurer Solid does not need a separate React portal. The toolbar now owns a stacking level above the Recording preview, so Settings, Guide, Edit, and plugin menus cannot be painted underneath the card. The Recording browser contract guards that ordering. |
| Floating-menu shadow hairline and radius polish | **Adopted** | Mesurer Solid now matches the upstream floating-menu hairline, dark-theme shadow recipe, and 9px menu/color-picker radius. Current-source Layout Guides parity covers the shared floating surface. |
| Upstream release metadata for v0.2.3 | **Not applicable** | Versioning and package publication are repository-specific and do not change the Mesurer Solid runtime contract. |

### 2026-10-01 post-0.2.2 follow-up

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Extension recording preview reports its live card size, follows toolbar top/bottom anchoring, carries the active theme into the iframe, and gives export menus room outside the base frame | **Adopted as equivalent first-party Recording behavior** | Mesurer Solid keeps Recording out of renderer core but now ships `recording()`. Its preview is viewport-owned, theme-token based, toolbar-anchored, expandable, and export-menu safe without reproducing the upstream iframe protocol. |
| Recording editor adds frame-fill presentation and a stricter `playerUrl` boundary | **Adopted by equivalent owned boundaries** | Mesurer Solid does not expose a `playerUrl` seam. The Recording controller owns Blob URLs, playback, trim state, expand/shrink, cleanup, and export state directly, and browser acceptance covers the real encoded clip. |
| Upstream Settings moves to a fixed portal while the recording iframe/menu work lands | **Current outcome already covered; re-audit with Recording** | Mesurer Solid Settings is already viewport-owned in the protected outer host, clamps horizontally and vertically to the viewport, and has dedicated Settings/toolbar occlusion contracts. Recording deliberately stays in that same owned paint domain instead of adding an iframe. Do not import the React portal shape only for structural parity; keep Settings and Recording occlusion coverage explicit in the Solid host architecture. |

### 2026-10-01 upstream 0.2.2 audit

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Repeated Inspect clicks cycle into labels, icons, and nested control parts | **Adopted with broader nested-target cycling** | Mesurer Solid keeps its existing first-click visual resolver, then repeated clicks at the same rendered point while remaining in Select cycle through nested and overlapping page targets. Edit deliberately does not inherit that cycle state; its movement overlay owns nested drill-down instead. The implementation preserves pointer-transparent paint recovery, open Shadow DOM traversal, Mesurer UI occlusion, and scoped `pageTarget` ownership. |
| Inspect nested content inside an already-selected Edit parent | **Adopted as an Edit usability extension** | Descendants now retain hover feedback instead of being hidden merely because an ancestor is selected. A stationary click through the Edit movement box can drill into the highlighted nested target; moving beyond the 4px drag threshold keeps normal parent/group dragging. Exact selected targets still suppress redundant hover. |
| Keep the wrapping/layout container for Alt-distance and CSS spacing evidence | **Partially already equivalent; continue source-first where applicable** | Mesurer Solid already measures ordinary container spacing from padding boxes and keeps richer pairwise/guide geometry. Upstream's new text-anchor-specific wrapper metadata belongs to its React Inspect info-card/text-range path, which Mesurer Solid does not expose as the same UI surface. |
| Typography-first Inspect info card, expanded CSS rows, and copy-tooltip portaling | **Intentional presentation divergence** | Mesurer Solid uses its separate Typography inspection/direct-edit card and existing selection chrome. The underlying typography and DOM evidence remain available through Context/agent inspection; importing only the React card would create a competing inspector surface. |
| Preserve Inspect/Annotate group while opening Comments | **Not applicable** | Mesurer Solid intentionally uses Context annotations and pins Context/Codex outside the Select/Edit lane, so opening Context does not switch the active mode group. |
| Selected-region screen recording, trimming, scaling, and WebM/MP4 export from upstream 0.2.1 | **Adopted as a dedicated first-party plugin** | `recording()` owns selection, lifecycle, preview, and the typed `recording:v1` service. MediaBunny owns all encoded-media work. Browser and extension capture are private acquisition paths, and a real Chromium contract covers moving frames, trim, scaling, format export, and cleanup. |
| Upstream recording resize, first-frame, color-picker, export-duration, and Chrome-tab fixes | **Adopted by the first Recording implementation where applicable** | The MediaBunny pipeline validates first-frame timing, exact coded dimensions, trimmed duration, and current-tab acquisition from its initial beta. Extension acquisition uses `tabCapture` only for the stream and never introduces a second recorder. |

### 2026-09-30 Edit control consolidation

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Annotate/drawing glyph in the second grouped-mode button | **Intentional divergence** | Mesurer Solid's second mode is Edit, not upstream Annotate. The button now uses the existing four-way movement glyph so the icon describes the page-editing action users actually enter. |
| Separate Edit mode button plus an Edit action inside the Edit lane | **Removed** | The mode control and the movement action represented the same state and command. The Edit half now owns the `arrange` tool id, toggles the real command in both directions, and the redundant `edit-action` control no longer renders. |
| Edit settings/options | **Moved onto the mode control** | The existing chevron remains a separate hit target beside Edit. Opening it does not change modes, and its plugin menu remains usable in Select, Edit, expanded, and compact toolbar states. |

### 2026-09-29 Select/Edit mode adoption

Upstream `03c0581837c01325ce4a8fa18bc893955335eb21` still uses the grouped toolbar introduced before the previous audit. The switch component, group-motion helper, toolbar-motion core, and both group icons have identical blobs to `547634086b1317b48e5cd23cafb477a9cdb807c3`.

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Two-button grouped toolbar switch with moving selection pill | **Adopted with product mapping** | Mesurer Solid maps upstream's Inspect/Annotate switch to Select/Edit. It keeps the upstream 28px buttons, 2px gap/padding, 3px active pill radius, neutral ink states, focus treatment, and Select inspection icon. Edit intentionally uses Mesurer Solid's movement glyph instead of upstream Annotate, with the Edit options chevron owned by the same split control. |
| Group content slides while the active lane changes width | **Adopted with 150 ms motion** | Mesurer Solid keeps the same grouped-toolbar structure and interruptible width/translate transition, but uses the project's existing 150 ms motion instead of upstream timing. Reduced motion disables the transition. |
| Inspect-owned versus Annotate-owned tool lanes | **Adopted as Select/Edit ownership** | Select owns selection-first inspection/capture tools. Edit owns movement and direct text/style editing. Typography stays in Select as inspection-only, while Rulers, ordinary Guides, and Layout Guides deliberately remain available in both Mesurer Solid modes. |
| Persistent controls outside the changing group | **Adopted with Mesurer Solid plugin ownership** | Context and Codex remain visible in both modes. Third-party tools without mode metadata retain the historical always-visible behavior so existing plugin surfaces do not disappear after upgrade. |
| Existing Arrange ids and agent APIs | **Preserved compatibility layer** | The public UI and new plugin factory use Edit, but `mesurer.arrange.*` state, service ids, persisted movement intent, `arrange()`, and agent methods remain valid. |
| Upstream post-audit ColorField event cleanup, Mesurer mark refresh, toolbar-restore offset, and marketing/site work | **Not part of this mode port** | None of these changes alter the grouped mode switch or its icons/motion. They remain separate audit items rather than being bundled into the Select/Edit feature. |

### 2026-09-28 stable-readiness follow-up

Upstream `547634086b1317b48e5cd23cafb477a9cdb807c3` is two commits ahead of the previously audited 0.2.0 release commit. The changes affect extension recovery, one upstream toolbar persistence field, Inspect hit testing, and focused regression fixtures.

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Keep a tab closed when navigation races the extension's initial active-tab storage read, and serialize later active-tab writes | **Adopted** | Mesurer Solid keeps the temporary `activeTab` permission model. Its extension now tracks pending tab state before the session read settles, checks that state again before recovery injects, and serializes storage writes. A Chromium contract covers close-during-read and concurrent state changes and writes a retained JSON result. |
| Persist upstream's `minimized` toolbar flag across navigation when `persistSession` is enabled | **Not applicable** | Mesurer Solid does not use upstream's minimized-toolbar state. It keeps one toolbar with its own compact presentation and stores toolbar position as tab-session UI while page evidence remains route-scoped. Adopting a separate minimized flag would add a second chrome state that the public Mesurer Solid contract does not expose. |
| Resolve pointer-transparent sibling overlays above video, canvas, and other native hits by checking browser paint order | **Adopted** | The shared DOM resolver now considers transparent descendants and sibling branches, rejects hidden and non-painted candidates, and confirms candidates against the browser hit stack. Select and agent point inspection share that path. Chromium covers transparent text and SVG overlays, clipping, lower painted overlays, and competing transparent stacking layers. |
| Add upstream benchmark fixtures for the overlay cases | **Not applicable** | Mesurer Solid keeps focused browser fixtures instead of copying upstream's site benchmark. The adopted cases run through its existing Select and agent APIs. |

### 2026-09-25 upstream 0.2.0 release audit

Upstream `33ffecfa7682b25dff5ada2a507feedfa18c745b` is the 0.2.0 release commit. Compared with the previously audited `d47fd6056a01da9c442ae04840ec4d0dd46a1257`, it changes release metadata and documentation only. No renderer or library source file changed, so the adopted runtime decisions from the 2026-09-24 audit remain current.

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Package version and 0.2.0 changelog | **Adopt as release context** | The changelog names the feature set already audited from upstream source. It does not introduce a new runtime implementation to port. Mesurer Solid is also preparing a 0.2.0 release, but keeps its own public API, plugin model, agent features, and Electron/native-host support. |
| README wording for Color Picker and browser requirements | **Intentional extension** | Upstream documents the browser `EyeDropper` path. Mesurer Solid keeps that browser fallback and also uses `window.__MESURER_HOST__.captureScreenshot` for application-local sampling in Electron/native hosts. |
| Extension, store, privacy, and site documentation changes | **Not applicable to library parity** | These changes do not alter the upstream Mesurer runtime. Mesurer Solid keeps its own extension, documentation, and release files. |

### 2026-09-24 Select lifecycle follow-up

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Invoking Select clears the current selection before toggling the tool | **Adopted** | Current React calls its shared `clearSelection()` before switching Select on or off. Mesurer Solid now clears element and Guide selection at the same boundary, so turning Select off cannot leave latent selection that reappears later. Chromium covers off → reload → on and requires no current selection throughout. |
| Shift-click adds or removes rendered Select targets | **Adopted and browser-covered** | Physical held-Shift pointer input now has an explicit Chromium contract that requires two selection Context targets and visible per-target outlines. This distinguishes product behavior from automation/input-channel uncertainty. |

### 2026-09-23 Layout Guides and page-state follow-up

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Layout Guides with columns, rows, grid, visibility, color, opacity, count/size/gutter/offset/alignment controls | **Adopted through the plugin architecture** | Mesurer Solid exposes `layoutGuides()` as a first-party plugin with page-scoped persisted state, history-aware JSON commands, a typed `layout-guides:v1` service, plugin-owned panel, and evidence overlay. The panel uses the current React control and icon presentation and has a focused current-source visual parity gate. Pure normalization and geometry stay in core; the mounted root API does not gain one method per guide operation. |
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
| General `Element` / SVG Inspect targets | **Adopted with explicit HTML-only mutation boundaries** | Renderer selection, measurement references, Context, and annotation geometry accept DOM `Element`, including SVG. Direct text editing, Edit movement transforms, and native CSS-anchor mutation still narrow to `HTMLElement`. Chromium covers physical SVG selection, point inspection, Context, and programmatic `select()`. |
| Upstream stress-bench/site fixture growth | **Not library parity by itself** | Mesurer Solid keeps its own focused browser fixtures. Relevant hit-testing and geometry cases are covered there instead of copying upstream site/demo content. |
| Dragging the toolbar from controls or chrome | **Adopted with the existing Solid drag engine** | Drag starts remain thresholded. Crossing the threshold closes an open Settings, Guide, or plugin surface, while real menus, dialogs, form controls, contenteditable regions, and slider surfaces retain pointer ownership. |
| Settings and toolbar-menu trigger re-click | **Already equivalent; now browser-covered** | Settings, Guide orientation, and plugin split-menu triggers already toggle their own surface. The toolbar drag contract protects that behavior while also checking post-drag click suppression. |
| Theme-aware ruler fade color | **Already adopted** | Ruler gradients already use `--msr-surface`, including Dark and System-dark themes. |
| Inspect/Annotate group switching used by upstream toolbar tests | **Adopted with Select/Edit mapping** | Mesurer Solid uses the upstream grouped-toolbar presentation for Select/Edit and keeps the upstream Select inspection icon. Edit intentionally uses Mesurer Solid's movement glyph and integrated options chevron. Tool ownership also differs intentionally: Typography stays in Select, editing belongs to Edit, and Context/Codex remain visible across both modes when enabled. |

### 2026-09-22 theme delta classification

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Persisted `system | light | dark` appearance and public theme option | **Adopted** | Mesurer Solid now exposes `theme` on the public mount API and the Settings Appearance control. The value persists with normal Mesurer settings. |
| Theme-aware light and dark colors, controls, shadows, and system color-scheme handling | **Adopted with Solid ownership adaptation** | The upstream palette is mapped to Mesurer theme tokens. The owning theme is also propagated to document-backed Context, Typography, direct-edit, and portaled selection UI so isolated mounts do not split into mixed themes. |
| Dark-surface browser coverage | **Adopted with broader coverage** | The Chromium contract checks explicit Light and Dark modes, System changes through `prefers-color-scheme`, persistence, the isolated renderer, document Context, and document Typography. |
| Copy only unresolved threaded comments and bulk Resolve all | **Intentional divergence** | Mesurer Solid uses Context annotations rather than upstream threaded comments. Codex completion already removes only the exact delivered annotations when that behavior is enabled. |
| Comment overflow-menu and delete-confirmation anchor fixes | **Not applicable as a direct port** | Upstream preserves the clicked overflow action anchor while its comment menu closes. Context annotation deletion is a direct action and does not use that menu-to-confirmation path. |

### 2026-09-21 delta classification

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| Resolved-comment state, filtering, reopen/delete flows, and all-comments search | **Intentional divergence** | These changes extend upstream's threaded-comment model. Mesurer Solid intentionally uses Context annotations with target identity, immutable baselines, review APIs, and optional Codex queue delivery. The public package does not claim threaded-comment parity. |
| Viewport context in copied review evidence | **Adopted outcome; independently implemented** | `MesurerContextV1` already records viewport width/height, device pixel ratio, and `scrollX`/`scrollY` for workspace, selection, and annotation Context, so agents receive equivalent page-position evidence without importing upstream's comment serializer. |
| Comment-card/list action menus and delete-confirmation anchoring | **Not applicable as a direct port** | The behavior belongs to upstream comment surfaces that Mesurer Solid does not ship. Context annotation cards have their own ownership, scroll attachment, and interaction contracts. |
| Closing transient surfaces when another toolbar menu opens or an outside pointer takes ownership | **Adopted outcome; independently implemented and validated** | Mesurer Solid's Settings, plugin split menus, Typography dropdowns, Context cards, and other inspector surfaces already have explicit ownership and dismissal contracts covered by browser/manual acceptance tests. No React-specific upstream implementation is required. |
| Toolbar drag/collapse interruption hardening and tooltip suppression during motion | **Adopted outcome where it matches Mesurer Solid's one-toolbar model** | Mesurer Solid independently validates toolbar dragging, compact/expanded state, reduced-motion-aware transitions, and stable active-tool ownership. Upstream's Inspect/Annotate grouping remains outside the product model. |
| Centralized floating-surface shadow/radius polish | **Partially adopted, with shared menus current** | Mesurer Solid now matches upstream 0.2.3 for shared menu and Color Picker hairline/radius tokens. Context, Typography, Settings panel geometry, and toolbar chrome keep their accepted contracts unless a focused parity migration covers those surfaces too. |

These decisions remain the current product boundary. The threaded-comment work is an explicit product divergence, while the shared interaction outcomes relevant to Mesurer Solid are covered by its own browser and host contracts.

### 2026-09-15 delta classification

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| DOM-attached comment threads, replies, all-comments panel, persistence, and agent copy/export | **Intentional divergence** | Mesurer Solid ships the separately designed Context annotation model: target- or region-bound review notes with machine-readable baselines and agent APIs. The public package does not claim upstream threaded-comment parity. |
| Iframe-aware selection, X-ray, and comment targeting | **Adopted in the 2026-10-07 0.2.4 audit** | The earlier divergence is closed for accessible same-origin frames. Mesurer Solid maps upstream comment targeting to Context annotations and keeps cross-origin frames fail-closed. |
| Configurable Inspect info card, copyable values, and upstream Typography presentation changes | **Intentional divergence** | Mesurer Solid has its own Typography/direct-edit UI and inspection presentation. The public package does not claim the upstream card UI. |
| Guide context menus, multi-guide removal, guide-linked measurements, and the refined `Option+S` pin workflow | **Intentional divergence** | Mesurer Solid retains its Guides/Distance workflow and does not claim `Option+S` pinning. These interactions should be adopted together, with their own browser contracts, rather than as partial behavior. |
| Configurable upstream feature flags and unified initial workspace/menu state | **Not applicable as a direct port** | Mesurer Solid exposes tools through its plugin runtime, mount options, and persisted workspace/settings contracts instead of upstream's React component feature-flag API. Equivalent product needs should be evaluated through those public APIs. |
| Keyboard ownership, shortcut gating, host-menu protection, scoped styles, and page-focus isolation fixes | **Adopted outcome; independently implemented and validated** | These are release requirements in Mesurer Solid's host-isolation architecture. Current host compatibility, browser contracts, plugin persistence, toolbar, and Trusted Types coverage validate the behavior without importing upstream's React-specific implementation. |
| Live overlay positioning, animated-layout tracking, tooltip/card collision handling, and selection geometry hardening | **Adopted outcome; independently implemented and validated** | Mesurer Solid's document/native anchoring, cached scroll compensation, renderer-root ownership, and selection contracts cover the same class of adopted behavior. Window and nested-scroll contracts, Typography anchoring, visual parity, and annotation tracking validate the current implementation. |
| Extension screenshot capture bridge removal | **Intentional divergence** | Mesurer Solid keeps its own private Chromium extension adapter because the extension still captures with the temporary `activeTab` grant. The same Screenshot implementation can also use an application-owned native host capability or browser `getDisplayMedia()`. No upstream bridge compatibility is claimed. |
| Upstream visual polish such as floating-card radii, cursor behavior, and hover-lightening | **Intentional divergence unless separately adopted** | Mesurer Solid keeps source-first shared behavior where it is part of the adopted contract, but its plugin-owned Context/Typography/Edit surfaces have independent visual ownership and parity tests. Cosmetic upstream changes are not silently treated as stable requirements. |

These classifications define the current product boundary. A newer upstream feature is not automatically a blocker when the product difference is explicit and the public package does not claim the capability.

### 2026-09-13 delta classification

The previous audit covered `b14c2bed...`, **"feat: pin option measurements with option+s (#25)"**.

| Upstream delta | Decision | Reason |
| --- | --- | --- |
| `Option+S` pins the current Option-distance preview | **Intentional divergence** | Mesurer Solid exposes persisted held distances through its own measurement/workspace model and documents `Alt` / `Option` as the Distance overlay modifier. The public shortcut contract does not include `Option+S`; adopting it requires the full pin interaction and dedicated browser coverage. |
| Upstream stops Alt-click distance holding from consuming Guide clicks | **Intentional divergence** | The behavior belongs to the same pinned-distance interaction redesign. Mesurer Solid keeps its held-distance interaction rather than importing one side of the upstream pin model by itself. |
| Cursor/element attachment and live refresh for the new pins | **Not applicable until pinning is adopted** | Mesurer Solid should adopt these geometry rules together with the pin interaction if/when the feature is ported, not as detached internal machinery. |

## Product decisions

| Upstream area | Mesurer Solid decision |
| --- | --- |
| Core measurement, X-ray, guides, rulers, settings | Source-first port with historical visual/interaction validation |
| System, Light, and Dark appearance | Adopted from upstream `c20ad51`; theme state also follows Mesurer Solid document-backed UI |
| SVG and general DOM `Element` selection | Adopted from the post-theme Inspect work; Select, point inspection, Context, and annotation geometry accept SVG while HTML-only Edit mutation paths stay explicit |
| Color Picker | Adopt the operational browser `EyeDropper` path; native application hosts use their existing `captureScreenshot` capability for application-local sampling |
| Text Inspector | Adopt inspection behavior; visible label is **Typography**, internal id stays `text-inspector` |
| Layout Guides | Adopt as optional `layoutGuides()` plugin with page-scoped state, history-aware commands, typed service, Context evidence, and current-source panel presentation |
| Screenshot region selection | Adopt as optional `screenshot()` from `mesurer-solid/plugins`; Mesurer Solid adds preview/viewer plus automatic native-host, Chromium-extension, and browser capture selection |
| Global Shortcuts setting | Adopt the persisted master on/off switch; no per-command remapping UI is added |
| Compact toolbar | Adopt presentation: one stable toolbar, full-height separators, active-tool retention, 150ms motion, reduced-motion support |
| Option-distance pinning (`Option+S`) | Intentionally not adopted; Mesurer Solid retains its existing held-distance workflow |
| DOM-attached threaded comments | Intentionally not adopted; Mesurer Solid uses Context annotations instead |
| Same-origin iframe selection/Context targeting | **Adopted** with projected geometry, document-tree pointer ownership, X-ray propagation, and Context mapping; cross-origin frames remain intentionally inaccessible |
| Inspect/Annotate group switching | **Presentation adopted with different semantics.** Mesurer Solid uses the upstream grouped switch structure, icons, and width-changing motion for Select/Edit, but does not adopt upstream threaded Annotate behavior. |
| Select/Edit mode semantics | **Mesurer Solid extension.** Select owns selection-first inspection/capture tools; Edit owns movement and direct text/style changes. Rulers, ordinary Guides, and Layout Guides remain usable in both modes, while Context and Codex remain pinned across both. Existing Arrange ids and agent contracts stay as compatibility surfaces. |
| Arrow, pen, and freeform drawing annotations | Intentionally not adopted |
| Site, analytics, footer, and repository-only changes | Not library parity |

Framework-neutral mounting, the plugin runtime, Context, Edit movement and direct text editing, host isolation, and the private Solid 2 renderer are Mesurer Solid-specific architecture.

## Toolbar boundary

Upstream has continued evolving its grouped Inspect/Annotate toolbar, floating cards, and comment controls. Mesurer Solid adopts the grouped switch presentation for its own Select/Edit product model without inheriting upstream comment-mode behavior.

The shipping toolbar has Select and Edit groups. Select contains selection-first inspection/capture tools; Edit contains movement and direct text/style editing. Rulers, ordinary Guides, and Layout Guides remain available in both groups. Context and Codex stay pinned across both groups. Compact presentation preserves the active mode and active controls. Mode changes use a 150ms interruptible transition and respect reduced motion.

The historical `605d202` parity suite still covers shared page/result and Settings behavior, but it predates the current toolbar shell. Toolbar chrome is excluded only from that historical geometry comparison and is covered by a dedicated current Chromium toolbar contract instead.

## Keyboard boundary

Upstream exposes a persisted shortcuts switch and continues hardening keyboard ownership around page editors, overlays, and comment inputs.

Mesurer Solid adopts the global shortcut product contract across both built-in and plugin-contributed shortcuts. Keyboard ownership is resolved before the shortcut gate: deep active-element lookup follows open Shadow DOM focus, host-page inputs/selects/textareas/contenteditable retain normal typing, Mesurer-owned editable controls retain their local keyboard behavior, and Escape is left to lifecycle/cancel handling instead of being swallowed by the configurable shortcut gate.

Upstream does not define Mesurer Solid's plugin shortcut model, direct-edit model, or Context composer lifecycle, so those remain governed by Mesurer Solid's own ownership tests. The upstream distance-pin shortcut remains deliberately excluded from the public shortcut contract, so the shortcut table does not imply parity that is not present.

## Mesurer Solid extensions

### Typography and direct editing

Mesurer Solid exposes the upstream Text Inspector concept as **Typography** and adds reversible direct copy/type editing. The internal `text-inspector` id, `A` shortcut, icon, and coordination contract remain compatible.

Direct editing follows native browser editability and records Before/Desired copy and style intent. If the application changes the value, Mesurer stops managing that preview value. It also owns one visible edit/selection lane: duplicate ordinary selected chrome is paint-suppressed, the dimensions pill remains measurable, source-linked Typography stays stable under pointer motion and follows the source through scroll/offscreen movement, and the transient selection annotation trigger is hidden only for the active edit. See [Direct text editing and Typography](./TEXT_EDITING.md).

### Edit

Edit records movement, direct text, and text-style intent without changing application source. Movement activates Select as its targeting prerequisite and previews Desired geometry with ownership-aware temporary transforms. The movement state and agent APIs retain their existing Arrange names for compatibility. See [Edit](./EDIT.md) and [Arrange compatibility](./ARRANGE.md).

### Context annotations

Upstream now ships DOM-attached threaded comments. Mesurer Solid intentionally keeps its separate target- or region-bound Context note model with machine-readable target identity, geometry, measurements, styles, and review baselines. An unsaved composer belongs to the selection that opened it and is abandoned when another selection takes ownership; saved notes remain durable review objects.

Context annotation presentation is source-linked. Add Note, the composer, saved markers and panels, and the ownership edge stay attached to their page target through window and nested scrolling. Saved panels keep a target-relative page point, repeated-note markers stay nearby and separate, and Add Note remains available while another note is open. Context cards also occlude Select hover and selection evidence, including when Mesurer's outer host is in the browser top layer, so page evidence cannot paint through a saved card or the new-note composer.

Direct text editing covers exact copy/type intent; screenshots remain visual evidence. See [Context](./CONTEXT_WORKFLOW.md).

### Screenshots

Mesurer Solid keeps the upstream region-capture interaction behind optional `screenshot()` from `mesurer-solid/plugins`. Capture-source selection is private to the plugin. Application-native hosts can expose `window.__MESURER_HOST__.captureScreenshot`, the Chromium extension uses its own adapter, and ordinary browser pages use `getDisplayMedia()`. The native host capability also powers application-local Color Picker sampling, while browser-only hosts retain the operational `EyeDropper` path. Mesurer Solid owns output preferences, HiDPI cropping, preview/viewer behavior, and cleanup. See [Screenshots](./SCREENSHOTS.md).

## Release rule

A newer upstream feature is not automatically a Mesurer Solid release blocker. A stable release is blocked when an adopted behavior has drifted, a public capability claim is false, or an important product difference is undocumented.

Before each stable release, compare upstream `main` with the current audited SHA and classify meaningful deltas as **adopt**, **intentional divergence**, or **not applicable**. Do not turn unrelated upstream repository churn into an automatic feature backlog.