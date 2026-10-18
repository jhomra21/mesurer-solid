export const RESPONSIVE_FRAME_SANDBOX = "allow-scripts allow-same-origin";

/** Best-effort behavior guard for a live, same-origin responsive preview. */
export function installPreviewGuard(contentWindow: Window): () => void {
  const original = {
    open: contentWindow.open,
    alert: contentWindow.alert,
    confirm: contentWindow.confirm,
    prompt: contentWindow.prompt,
  };

  const blockSubmit = (event: Event) => event.preventDefault();

  const blockDownload = (event: Event) => {
    const target = event.target;
    const ElementConstructor = contentWindow.document.defaultView?.Element;

    if (ElementConstructor && target instanceof ElementConstructor && target.closest("a[download]")) event.preventDefault();
  };

  const blockOpen = () => null;
  const blockConfirm = () => false;
  const blockPrompt = () => null;
  contentWindow.addEventListener("submit", blockSubmit, true);
  contentWindow.addEventListener("click", blockDownload, true);
  contentWindow.open = blockOpen;
  contentWindow.alert = blockConfirm;
  contentWindow.confirm = blockConfirm;
  contentWindow.prompt = blockPrompt;

  return () => {
    // After a cross-origin navigation the WindowProxy is no longer accessible,
    // and the guarded document (with its listeners) is already gone.
    try {
      contentWindow.removeEventListener("submit", blockSubmit, true);
      contentWindow.removeEventListener("click", blockDownload, true);
      contentWindow.open = original.open;
      contentWindow.alert = original.alert;
      contentWindow.confirm = original.confirm;
      contentWindow.prompt = original.prompt;
    } catch {
      // Cross-origin access throws SecurityError; nothing remains to restore.
    }
  };
}
