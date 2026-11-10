/**
 * Shows a design canvas — its artboards in rows by flow, pages, notes, comments, the properties panel, the version chip
 * and the prototype buttons — as Speca's running editor in a frame.
 *
 * The address of a design canvas: `/rpc/designCanvas.page?{"tabId":"dc_…"}` — what the `designCanvas.board` canvas
 * kind opens, a chat link or a browser tab. The editor is the plugin's page /designCanvas/t/<tabId>.
 * @view
 * @param opts.tabId The design canvas id.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */
    tabId: string;
}): Promise<string> {
    const id = String(opts.tabId ?? "").trim();
    if (!/^dc_[A-Za-z0-9]{1,40}$/.test(id)) throw new Error("designCanvas.page: tabId is a design canvas id (dc_…, from designCanvas.open)");
    // rpc.frame's markup, made to fill the tab whatever the panel's own rules (an unlayered `iframe` rule left it 150px
    // tall, the view's wrapper its content's height)
    const esc = (text: string) => ctx.fns.w.escape({ text });
    return `<style>:has(> .rpc-view > [data-dc-host]), .rpc-view:has(> [data-dc-host]) { height: 100%; }</style><div class="rpc-frame" data-rpc-frame data-dc-host style="height:100%;min-height:480px"><iframe src="/designCanvas/t/${esc(encodeURIComponent(id))}" title="Design canvas" loading="eager" allow="clipboard-read; clipboard-write" style="display:block;width:100%;height:100%;border:0"></iframe></div>`;
}
