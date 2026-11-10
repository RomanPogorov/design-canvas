import { readdir } from "node:fs/promises";

/**
 * Lists the design canvases in the designs directory: name, title, artboard count, open comments, last change.
 *
 * Use to find a canvas to continue (pass its name to designCanvas.read / write) or to show the person what exists.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<Array<{ name: string; title: string; boards: number; waiting: number; comments: number; updatedAt: string; url: string }>> {
    const root = await ctx.fns.designCanvas.dir({});
    const out = [];
    for (const n of await readdir(root).catch(() => [] as string[])) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(n)) continue;
        const c = await ctx.fns.designCanvas.load({ name: n }).catch(() => null);
        if (!c) continue;
        out.push({ name: c.name, title: c.title, boards: c.order.length, waiting: c.order.filter((f) => c.boards[f]?.pending).length,
            comments: Object.values(c.comments).filter((k) => !k.resolved).length, updatedAt: c.updatedAt ?? "", url: `/designCanvas/${c.name}` });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
