const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/**
 * A readable outline of an artboard file: one line per element — `#tid tag "first words of its text"`, indented by depth.
 *
 * Use to find the tid of the element a person points at (`Main.html#12`) or the snippet to change with
 * designCanvas.edit. Lists at most 400 elements; scripts and styles show no text.
 * @param opts.src The artboard's HTML source.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The artboard's HTML source. */
    src: string;
}): string {
    const src = String(opts.src ?? "");
    const els = ctx.fns.designCanvas.parse({ src });
    const depthOf = (e: types.designCanvas.Element) => { let d = 0; for (let p = e.parent; p >= 0; p = els[p]!.parent) d++; return d; };
    const textOf = (e: types.designCanvas.Element) => {
        if (VOID.has(e.tag) || ["script", "style", "svg", "path"].includes(e.tag)) return "";
        // own text only: what is between its start tag and its first child, and between its children
        let t = "", at = e.openEnd;
        for (const c of e.children) { t += src.slice(at, els[c]!.start); at = els[c]!.end; }
        t += src.slice(at, e.closeStart);
        return t.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    };
    return els.slice(0, 400).map((e) => { const t = textOf(e); return `${"  ".repeat(Math.min(depthOf(e), 8))}#${e.tid} ${e.tag}${t ? ` "${t}"` : ""}`; }).join("\n")
        + (els.length > 400 ? `\n… ${els.length - 400} more elements` : "");
}
