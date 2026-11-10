import tool from "../../speca/plugins/design-canvas/read.tool.ts";
import { runTool, notesFor } from "../../sdk/agent.ts";

/**
 * Reads a design canvas: without `file` — the index (artboards with titles, sizes and positions, row titles, open
 * comments with the element they are pinned to); with `file` — that artboard's HTML and an outline of its elements
 * with tids, to resolve an address like "Main.html#12:0/1/3" (tid 12) the person points at. Also says what the
 * person changed by hand since you last looked. Speca's design-canvas_read, as is.
 * @param opts.tabId The design canvas id.
 * @param opts.file One artboard.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** One artboard. */ file?: string;
}): Promise<{ text: string }> {
    const r = await runTool(ctx, tool, opts as any);
    return { text: r.text + notesFor(ctx, String(opts.tabId)) };
}
