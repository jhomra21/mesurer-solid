import { onCleanup } from "solid-js";
import { subscribeMesurerSelectGestureStart } from "../runtime/select-gesture-channel";
import {
  ContextActions,
  type ContextActionsController,
  type ContextActionsProps,
} from "./ContextActions";

export type ContextActionsSelectOwnershipProps = ContextActionsProps & {
  ownerWindow: Window;
};

export function ContextActionsSelectOwnership(props: ContextActionsSelectOwnershipProps) {
  let controller: ContextActionsController | null = null;

  const unsubscribe = subscribeMesurerSelectGestureStart(props.ownerWindow, () => {
    controller?.abandonNoteComposer();
  });

  onCleanup(unsubscribe);

  return (
    <ContextActions
      runtime={props.runtime}
      onCopy={props.onCopy}
      initialTriggerFallback={props.initialTriggerFallback}
      coordinateSpace={props.coordinateSpace}
      onController={(value) => {
        controller = value;
        props.onController?.(value);
      }}
    />
  );
}
