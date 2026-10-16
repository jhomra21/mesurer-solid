# Responsive inspector

Responsive opens one iPhone 15 preview at 393 × 852 CSS pixels. The preview is a live same-origin iframe. Select, measurement, X-ray, and Typography inspection route into its accessible same-origin documents; Guides and Context annotation mapping are not included in this increment.

While the stage is open, its same-origin preview is the active inspection source. Select hover, click and marquee selection, measurements, X-ray, and Typography inspect elements in the preview, including accessible nested same-origin frames. Evidence is projected into Mesurer's root overlay at the scaled preview position. The original page and the stage chrome are not inspection sources while the stage is open. Closing the stage clears preview selection and hover state.

Context annotations are intentionally unavailable for preview selections in this increment. The Add Note trigger is hidden and its toolbar command is disabled while a preview target is selected. The `context.add-note` command and annotation runtime also reject preview selections, because annotation storage and source-linked panels are page-scoped; creating one with projected root coordinates would bind it incorrectly. `window.__MESURER__` keeps its existing API and continues inspecting/selecting the root document rather than implicitly switching to the preview.

The page must allow itself to load in a same-origin iframe. Cross-origin frames, `X-Frame-Options`, CSP `frame-ancestors`, and frame-busting code can prevent that. Mesurer shows a refusal message when it cannot access the loaded document; inspection then finds nothing in that refused preview.

Previews reload the live page in same-origin iframes and run its JavaScript. Requests, analytics, and other page side effects repeat for each preview. The iframe sandbox suppresses some browser actions, but it is not a security boundary. Use Responsive only on pages whose scripts you are willing to run again.

Entering Responsive exits Edit, clears the current selection, and closes the preview when Edit, Rulers, Screenshot, or Recording is activated. B is ignored by editable controls, including open Shadow DOM inputs in the preview. Turning off global shortcuts disables B without disabling Escape.

Responsive is on by default. Turn it off in **Settings > Plugins**, or omit it with `excludeBuiltins: ["responsive"]`. Press **B** to open or close it; Escape and a click on the empty stage also close it.
