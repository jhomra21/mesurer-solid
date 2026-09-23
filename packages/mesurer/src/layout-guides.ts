import {
  MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID as rendererActiveStateId,
  MESURER_LAYOUT_GUIDES_PLUGIN_ID as rendererPluginId,
  MESURER_LAYOUT_GUIDES_SERVICE_ID as rendererServiceId,
  MESURER_LAYOUT_GUIDES_STATE_ID as rendererStateId,
  layoutGuidesPlugin as rendererLayoutGuidesPlugin,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_LAYOUT_GUIDES_PLUGIN_ID: string = rendererPluginId;

export const MESURER_LAYOUT_GUIDES_SERVICE_ID: string = rendererServiceId;

export const MESURER_LAYOUT_GUIDES_STATE_ID: string = rendererStateId;

export const MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID: string = rendererActiveStateId;

export type LayoutGuideKind = "columns" | "rows" | "grid";

export type LayoutGuideAlign = "stretch" | "min" | "center" | "max";

export type LayoutGuide = {
  id: string;
  kind: LayoutGuideKind;
  visible: boolean;
  color: string;
  opacity: number;
  count: number;
  size: number;
  gutter: number;
  offset: number;
  align: LayoutGuideAlign;
};

export type LayoutGuideInput = Partial<Omit<LayoutGuide, "id">> & { id?: string };

export type MesurerLayoutGuidesService = {
  list(): LayoutGuide[];
  add(input?: LayoutGuideInput): Promise<LayoutGuide>;
  update(id: string, patch: Partial<Omit<LayoutGuide, "id">>): Promise<LayoutGuide>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

export const layoutGuides = (): MesurerPlugin => ({
  ...rendererLayoutGuidesPlugin(),
  version: MESURER_VERSION,
});
