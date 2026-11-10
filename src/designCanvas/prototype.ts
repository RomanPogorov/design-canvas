import { prototype } from "../../sdk/agent.ts";

/**
 * Opens (or updates) the clickable prototype of a design canvas: ONE self-contained html page with every screen of the
 * design (same look, same copy), its links and controls working, as an html canvas tab linked to the design — the
 * design then shows «Прототип» and, once its artboards change, «Обновить прототип». Call it again with the whole page
 * to update it (build in steps: the shell and first screen, then one screen per call). Speca's canvas_open {kind: "html",
 * from} / canvas_write {synced: true}.
 * @param opts.tabId The design canvas id it is built from.
 * @param opts.html The whole prototype page (scripts allowed; no network).
 * @param opts.title The prototype tab's title.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** The whole prototype page. */ html: string;
    /** Tab title. */ title?: string;
}): Promise<{ itemId: number; text: string }> {
    if (!String(opts.html ?? "").trim()) throw new Error("designCanvas.prototype: html is required");
    return prototype(ctx, { tabId: String(opts.tabId ?? ""), html: String(opts.html), title: opts.title });
}
