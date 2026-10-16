# Responsive inspector

Responsive opens one iPhone 15 preview at 393 × 852 CSS pixels. The preview is a live same-origin iframe; this frames-only foundation does not yet route Select, X-ray, guides, or Context inspection into the preview.

The page must allow itself to load in a same-origin iframe. Cross-origin frames, `X-Frame-Options`, CSP `frame-ancestors`, and frame-busting code can prevent that. Mesurer shows a refusal message when it cannot access the loaded document.

Previews reload the live page in same-origin iframes and run its JavaScript. Requests, analytics, and other page side effects repeat for each preview. The iframe sandbox suppresses some browser actions, but it is not a security boundary. Use Responsive only on pages whose scripts you are willing to run again.

Entering Responsive exits Edit, clears the current selection, and closes the preview when Edit, Rulers, Screenshot, or Recording is activated. B is ignored by editable controls, including open Shadow DOM inputs in the preview. Turning off global shortcuts disables B without disabling Escape.

Responsive is on by default. Turn it off in **Settings > Plugins**, or omit it with `excludeBuiltins: ["responsive"]`. Press **B** to open or close it; Escape and a click on the empty stage also close it.
