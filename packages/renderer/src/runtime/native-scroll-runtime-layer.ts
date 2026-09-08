import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

/**
 * Native scroll anchoring moves the direct-text runtime out of Mesurer's fixed
 * renderer root. Keep that runtime as an ordinary zero-size DOM owner rather
 * than `display: contents`: the Typography dropdown/card code relies on the
 * runtime remaining a normal layout/event ancestor, while all of its visible
 * children are independently positioned.
 *
 * This is intentionally installed after native scroll anchoring. Browsers that
 * do not activate that path leave the runtime untouched.
 */
export function stabilizeNativeScrollRuntimeLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, portalTarget } = runtime;
  const mounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const mount = mounts.item(mounts.length - 1);
  if (!mount || mount.parentElement !== ownerDocument.body) return;
  if (mount.style.getPropertyValue("display") !== "contents") return;

  const properties = ["display", "position", "inset", "width", "height"] as const;
  const previous = properties.map((property) => ({
    property,
    value: mount.style.getPropertyValue(property),
    priority: mount.style.getPropertyPriority(property),
  }));

  mount.style.setProperty("display", "block", "important");
  mount.style.setProperty("position", "static", "important");
  mount.style.setProperty("inset", "auto", "important");
  mount.style.setProperty("width", "0px", "important");
  mount.style.setProperty("height", "0px", "important");
  mount.dataset.mesurerNativeScrollRuntimeLayer = "true";

  ctx.lifecycle.onDispose(() => {
    delete mount.dataset.mesurerNativeScrollRuntimeLayer;
    if (!mount.isConnected) return;
    for (const { property, value, priority } of previous) {
      if (value) mount.style.setProperty(property, value, priority);
      else mount.style.removeProperty(property);
    }
  });
}