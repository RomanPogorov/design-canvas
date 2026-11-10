// A design canvas as a canvas tab (kind designCanvas.board): Speca's design canvas, whole, in a frame — the plugin's
// page /designCanvas/t/<tabId>. The kind is an alias of the view designCanvas.page, so the tab has an address and
// opens in a browser tab too. What the agent draws (designCanvas.write / edit / layout) appears in it as it happens
// (live updates: the page follows the signal canvas:<tabId>).

export const hint = "a design canvas — Speca's editor: artboards of screens and their states in rows by flow — args `{ tabId }` (designCanvas.open opens it for you); the person selects elements, edits in place, comments, saves versions; read it with designCanvas.read({ tabId }), draw with designCanvas.write / edit / layout";

export default {
    view: "designCanvas.page",
    icon: "pen-nib",
    live: true,
    prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) {
        const tabId = String(opts.args.tabId ?? opts.args.id ?? "").trim();
        if (!/^dc_[A-Za-z0-9]{1,40}$/.test(tabId)) throw new Error("canvas designCanvas.board: args.tabId is the design canvas id from designCanvas.open");
        return { args: { tabId }, title: typeof opts.args.title === "string" && opts.args.title.trim() ? opts.args.title.trim() : "Design canvas" };
    },
    render(ctx: Context, opts: { agentId: string; item: types.canvas.Item }) {
        const esc = (text: string) => ctx.fns.w.escape({ text });
        const id = String(opts.item.args.tabId ?? opts.item.args.params?.tabId ?? "");
        return `<iframe data-canvas-frame="${opts.item.id}" src="/designCanvas/t/${esc(encodeURIComponent(id))}" title="${esc(opts.item.title)}" allow="clipboard-write" class="block h-full w-full border-0 bg-base-100"></iframe>`;
    },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) {
        const id = String(opts.item.args?.tabId ?? opts.item.args?.params?.tabId ?? "");
        return `Design canvas ${id} — designCanvas.read({ tabId: "${id}" }) for its artboards and the person's comments; draw with designCanvas.write / edit / layout`;
    },
} satisfies types.canvas.Kind;
