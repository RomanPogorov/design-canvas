// A design canvas as a canvas tab (kind designCanvas.board): the plugin's own editor page for one canvas, in a
// frame. The kind is an alias of the view designCanvas.page, so the tab has an address
// (/rpc/designCanvas.page?{"name":…}) and opens in a browser tab too. The editor polls the canvas, so what the agent
// draws with designCanvas.write / edit / layout appears in the open tab within a couple of seconds.

export const hint = "a design canvas — artboards of screens and their states in rows by flow — args `{ name }` (from designCanvas.open); the person selects elements, edits text in place, comments; the agent reads it with designCanvas.read({ name }) and draws with designCanvas.write / edit / layout";

export default {
    view: "designCanvas.page",
    icon: "pen-nib",
    live: true,
    prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) {
        const name = String(opts.args.name ?? "").trim();
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error("canvas designCanvas.board: args.name is the canvas name from designCanvas.open (letters, digits, - and _)");
        return { args: { name }, title: typeof opts.args.title === "string" && opts.args.title.trim() ? opts.args.title.trim() : `Design · ${name}` };
    },
    render(ctx: Context, opts: { agentId: string; item: types.canvas.Item }) {
        const esc = (text: string) => ctx.fns.w.escape({ text });
        const src = `/designCanvas/${encodeURIComponent(String(opts.item.args.name))}`;
        return `<iframe data-canvas-frame="${opts.item.id}" src="${esc(src)}" title="${esc(opts.item.title)}" allow="clipboard-write" class="block h-full w-full border-0 bg-base-100"></iframe>`;
    },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) {
        const name = String(opts.item.args?.name ?? opts.item.args?.params?.name ?? "");
        return `Design canvas "${name}" — read it with designCanvas.read({ name: "${name}" }), draw with designCanvas.write / edit / layout`;
    },
} satisfies types.canvas.Kind;
