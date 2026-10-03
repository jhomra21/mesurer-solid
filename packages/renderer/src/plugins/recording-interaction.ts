export type RecordingInteractionController = {
  setActive(active: boolean): void;
};

export const createRecordingInteractionController = (
  rendererRoot: HTMLElement | null,
): RecordingInteractionController => {
  let previousStyle: {
    element: HTMLElement;
    pointerEvents: string;
    pointerEventsPriority: string;
    cursor: string;
    cursorPriority: string;
  } | null = null;

  const restore = () => {
    const previous = previousStyle;

    if (!previous) return;
    previousStyle = null;

    if (previous.pointerEvents || previous.pointerEventsPriority) {
      previous.element.style.setProperty(
        "pointer-events",
        previous.pointerEvents,
        previous.pointerEventsPriority,
      );
    } else {
      previous.element.style.removeProperty("pointer-events");
    }

    if (previous.cursor || previous.cursorPriority) {
      previous.element.style.setProperty(
        "cursor",
        previous.cursor,
        previous.cursorPriority,
      );
    } else {
      previous.element.style.removeProperty("cursor");
    }
  };

  return {
    setActive(active) {
      rendererRoot?.toggleAttribute("data-mesurer-recording-active", active);

      if (!active) {
        restore();

        return;
      }

      const interactionOverlay = rendererRoot?.querySelector<HTMLElement>(
        "[data-mesurer-interaction-overlay='true']",
      );

      if (!interactionOverlay) return;

      if (!previousStyle || previousStyle.element !== interactionOverlay) {
        restore();
        previousStyle = {
          element: interactionOverlay,
          pointerEvents: interactionOverlay.style.getPropertyValue("pointer-events"),
          pointerEventsPriority: interactionOverlay.style.getPropertyPriority("pointer-events"),
          cursor: interactionOverlay.style.getPropertyValue("cursor"),
          cursorPriority: interactionOverlay.style.getPropertyPriority("cursor"),
        };
      }

      interactionOverlay.style.setProperty("pointer-events", "none", "important");
      interactionOverlay.style.setProperty("cursor", "default", "important");
    },
  };
};
