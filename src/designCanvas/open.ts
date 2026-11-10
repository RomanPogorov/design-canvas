import tool from "../../speca/plugins/design-canvas/open.tool.ts";
import { runTool } from "../../sdk/agent.ts";

/**
 * Opens a design canvas with the plan: every screen and state as an artboard (file, title, size), in rows by flow
 * (one row per flow or screen family, its title above it; boards 80px apart, rows 120px apart — computed). Leave out
 * `html`: the canvas opens at once with each artboard waiting, and the person watches them appear as you draw them one
 * by one with designCanvas.write, in the plan's order. Put html here only for one or two small boards. Opens the canvas
 * tab (kind designCanvas.board) beside the chat. Speca's design-canvas_open, as is.
 * @param opts.title The canvas title.
 * @param opts.rows Rows by flow: `{ title?, boards: [{ file: "01-welcome.html", title: "01 Welcome", w: 390, h: 844, page?, html? }] }`.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas title. */
    title: string;
    /** Rows by flow, each with its boards (file, title, w, h, page?, html?). */
    rows: Array<{ title?: string; boards: Array<{ file: string; title: string; w: number; h: number; page?: boolean; html?: string }> }>;
}): Promise<{ text: string; tabId?: string }> {
    return runTool(ctx, tool, opts as any);
}
