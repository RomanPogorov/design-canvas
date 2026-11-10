/**
 * Finds things of one kind on an artboard that will not be edited as one: a run of 3+ siblings of one tag and class
 * whose inline styles differ in only one or two properties.
 *
 * Use after drawing an artboard: the person selects and restyles elements together when tag, class and style match,
 * so uneven copies should get the same style (or become a `<dc-for>` over data). Returns up to 4 notes, each naming
 * the file, the first tid and the differing properties; [] when everything is consistent.
 * @param opts.file The artboard file name (for the notes).
 * @param opts.src The artboard's HTML source.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The artboard file name (for the notes). */
    file: string;
    /** The artboard's HTML source. */
    src: string;
}): string[] {
    const src = String(opts.src ?? "");
    const els = ctx.fns.designCanvas.parse({ src });
    const attr = (e: types.designCanvas.Element, name: string): string | null => {
        const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
        const m = re.exec(src.slice(e.start, e.openEnd));
        return m ? m[1] ?? m[2] ?? m[3] ?? "" : null;
    };
    const decls = (s: string | null) => new Map((s ?? "").split(";").map((d) => d.split(":")).filter((d) => d.length > 1 && d[0]!.trim())
        .map((d) => [d[0]!.trim().toLowerCase(), d.slice(1).join(":").trim().replace(/\s+/g, " ")] as [string, string]));
    const canon = (s: string | null) => [...decls(s)].map(([k, v]) => `${k}:${v}`).sort().join(";");
    const groups = new Map<string, types.designCanvas.Element[]>();
    for (const e of els) {
        if (e.parent < 0 || ["script", "style", "br", "svg", "path", "dc-for", "dc-if"].includes(e.tag)) continue;
        let inRepeat = false;
        for (let p = e.parent; p >= 0; p = els[p]!.parent) if (els[p]!.tag === "dc-for") inRepeat = true;
        if (inRepeat) continue;
        const k = `${e.parent}|${e.tag}|${(attr(e, "class") ?? "").trim()}`;
        groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const notes: string[] = [];
    for (const list of groups.values()) {
        if (list.length < 3) continue;
        const kinds = new Set(list.map((e) => canon(attr(e, "style"))));
        if (kinds.size < 2 || kinds.size > Math.ceil(list.length / 2)) continue;
        const ds = list.map((e) => decls(attr(e, "style")));
        const props = new Set(ds.flatMap((d) => [...d.keys()]));
        const diff = [...props].filter((p) => ds.some((d) => d.get(p) !== ds[0]!.get(p)));
        if (diff.length > 2) continue;   // different things, not one kind written unevenly
        const e0 = list[0]!, cls = attr(e0, "class");
        notes.push(`${opts.file}: ${list.length} <${e0.tag}${cls ? ` class="${cls}"` : ""}> side by side (from #${e0.tid}) differ in ${diff.join(", ") || "style"} — if they are one kind, write the same style on each (or a <dc-for> over data), so the person selects and restyles them together`);
        if (notes.length >= 4) break;
    }
    return notes;
}
