/**
 * Shows a design canvas — its artboards in rows by flow, pages, notes and comments — as a running editor in a frame.
 *
 * Use for the address of a design canvas: `/rpc/designCanvas.page?{"name":"onboarding"}` — what the
 * `designCanvas.board` canvas kind opens, a chat link or a browser tab. The editor is the plugin's own page
 * (/designCanvas/<name>); it saves the person's edits and follows the agent's.
 * @view
 * @param opts.name The canvas name (from designCanvas.open or designCanvas.list).
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
}): Promise<string> {
    const name = String(opts.name ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error("designCanvas.page: name is a canvas name (letters, digits, - and _)");
    return ctx.fns.rpc.frame({ src: `/designCanvas/${encodeURIComponent(name)}`, title: `Design canvas ${name}` });
}
