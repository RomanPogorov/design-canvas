import tool from "../../speca/plugins/design-canvas/write.tool.ts";
import { runTool } from "../../sdk/agent.ts";

/**
 * Adds an artboard to a design canvas, or replaces one artboard's whole file (draws a planned one). New boards go to
 * the right of the last row (of their page) unless x/y are given; `sheet`: the page of the canvas by its title (made
 * if missing). For small changes use designCanvas.edit. Speca's design-canvas_write, as is.
 * @param opts.tabId The design canvas id (from designCanvas.open / designCanvas.list).
 * @param opts.file Artboard file, e.g. `01-welcome.html`.
 * @param opts.html The artboard's markup (one root element, inline styles; data in `<script type="application/json" data-dc-data>`, `<dc-for>`, `<dc-if>`, `<dc-import>`).
 * @param opts.title Artboard title, e.g. "01 Welcome".
 * @param opts.w Width, px.
 * @param opts.h Height, px.
 * @param opts.page A page root (max-width container) instead of a fixed board.
 * @param opts.sheet The page of the canvas, by title.
 * @param opts.x Position, world px.
 * @param opts.y Position, world px.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** Artboard file. */ file: string;
    /** The artboard's markup. */ html: string;
    /** Artboard title. */ title?: string;
    /** Width, px. */ w?: number;
    /** Height, px. */ h?: number;
    /** A page root. */ page?: boolean;
    /** The canvas page, by title. */ sheet?: string;
    /** Position x. */ x?: number;
    /** Position y. */ y?: number;
}): Promise<{ text: string }> {
    return runTool(ctx, tool, opts as any);
}
