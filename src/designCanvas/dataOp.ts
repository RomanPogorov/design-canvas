/**
 * Changes an artboard's data block (`<script type="application/json" data-dc-data>`): one value, or one item of a list.
 *
 * Use when the person edits one copy of a `<dc-for>` repeat — its text is a data value (`set` with the value's path,
 * e.g. `topics.2.title`), and deleting, duplicating or moving the copy is an item operation on `topics.2`. A value
 * keeps its kind: a flag stays a flag, a number a number. Returns the new source (and for duplicate/up/down the
 * path of the item to select), or `{ error }`: nodata (no data block), stale (no such path), edge (cannot move).
 * @param opts.src The artboard's HTML source.
 * @param opts.action set (a value), or delete / duplicate / up / down (a list item).
 * @param opts.path Dotted path in the data, e.g. `topics.2.title` (set) or `topics.2` (item actions).
 * @param opts.value For `set`: the new value as text.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The artboard's HTML source. */
    src: string;
    /** set (a value), or delete / duplicate / up / down (a list item). */
    action: "set" | "delete" | "duplicate" | "up" | "down";
    /** Dotted path in the data, e.g. `topics.2.title`. */
    path: string;
    /** For `set`: the new value as text. */
    value?: string;
}): { html: string; item?: string } | { error: string } {
    const src = String(opts.src ?? "");
    if (!/^[\w$-]+(\.[\w$-]+)*$/.test(String(opts.path ?? ""))) return { error: "stale" };
    const els = ctx.fns.designCanvas.parse({ src });
    const el = els.find((e) => e.tag === "script" && /\sdata-dc-data\b/i.test(src.slice(e.start, e.openEnd)));
    if (!el) return { error: "nodata" };
    let data: unknown;
    try { data = JSON.parse(src.slice(el.openEnd, el.closeStart)); } catch { return { error: "nodata" }; }
    const segs = opts.path.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    const at = (path: (string | number)[]) => { let cur: unknown = data; for (const s of path) { if (cur == null || typeof cur !== "object") return undefined; cur = (cur as Record<string, unknown>)[s as string]; } return cur; };
    // "<" escaped, so a value can never close the script it lives in
    const write = () => src.slice(0, el.openEnd) + "\n" + JSON.stringify(data, null, 2).replace(/</g, "\\u003c") + "\n" + src.slice(el.closeStart);
    if (opts.action === "set") {
        const parent = at(segs.slice(0, -1)), cur = at(segs), value = String(opts.value ?? "");
        if (!parent || typeof parent !== "object" || cur === undefined || (cur !== null && typeof cur === "object")) return { error: "stale" };
        (parent as Record<string, unknown>)[segs[segs.length - 1] as string] = typeof cur === "boolean" ? value === "true"
            : typeof cur === "number" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
        return { html: write() };
    }
    const i = segs[segs.length - 1], list = at(segs.slice(0, -1));
    if (!Array.isArray(list) || typeof i !== "number" || i >= list.length) return { error: "stale" };
    const base = segs.slice(0, -1).join(".");
    if (opts.action === "delete") { list.splice(i, 1); return { html: write() }; }
    if (opts.action === "duplicate") { list.splice(i + 1, 0, structuredClone(list[i])); return { html: write(), item: `${base}.${i + 1}` }; }
    const j = opts.action === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { error: "edge" };
    [list[i], list[j]] = [list[j], list[i]];
    return { html: write(), item: `${base}.${j}` };
}
