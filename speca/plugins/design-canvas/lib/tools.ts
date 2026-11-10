// Shared bits of the design-canvas tools.
import type { PluginApi } from "speca/sdk";
import { stateSchema, type DesignState } from "./model.ts";

export async function loadBoard(api: PluginApi, tabId: string): Promise<{ id: string; state: DesignState } | { error: string }> {
  const tab = await api.canvas.view(tabId);
  if (!tab || tab.kind !== "design-canvas.board") return { error: "No such design canvas (use the tab id from design-canvas_open or canvas_list)." };
  if (!tab.canAct) return { error: "This design canvas is read-only for you." };
  const parsed = stateSchema.safeParse(tab.state);
  if (!parsed.success) return { error: "The canvas state is broken." };
  return { id: tab.id, state: parsed.data };
}

export const sizes = { phone: { w: 390, h: 844 }, tablet: { w: 834, h: 1194 }, desktop: { w: 1440, h: 900 }, slide: { w: 1280, h: 720 } } as const;
