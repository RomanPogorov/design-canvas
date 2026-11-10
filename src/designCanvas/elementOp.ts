// The person's edit of an artboard by address — a splice of its source: the file stays the agent's file, no
// reformatting, nothing it did not ask for. Several tids: the same edit on each (from the last to the first, so a
// change keeps the tids before it); an element inside another target goes with the outer one.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const INLINE = new Set(["b", "strong", "i", "em", "u", "s", "br", "a", "code", "mark", "sub", "sup", "small", "span"]);
const ATTRS = new Set(["href", "src", "alt", "placeholder", "aria-label", "title"]);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Applies one editor operation to elements of an artboard's source by their tids and returns the new source.
 *
 * Use for the editor's direct manipulation (the canvas routes call it) or for a precise structural change by
 * address: `style` sets or removes inline CSS properties (`changes: { color: "#111", padding: null }`), `text`
 * replaces the text of a text-only element (inline b/i/u/a markup allowed via `html`), `delete`, `duplicate`,
 * `move` (`dir` up/down among its siblings), `attr` (`name` href|src|alt|placeholder|aria-label|title, `value`
 * null removes it), `wrap` (into a stack/row/grid group), `unwrap` (children take the group's place).
 * A text with `{{holes}}` is a template: only `template: true` may replace it. Returns `{ error }` with
 * stale (no such tid), bound (template text), children (not a text-only element), edge (nothing to do) or bad.
 * @param opts.src The artboard's HTML source.
 * @param opts.op The operation.
 * @param opts.tids The elements (tids from designCanvas.parse / the outline / the frame's data-tid).
 * @param opts.changes For `style`: property → value; null or "" removes the property.
 * @param opts.text For `text`: the new plain text (newlines become <br>).
 * @param opts.html For `text`: the new text with inline markup (b, i, u, a href…); other tags are dropped.
 * @param opts.template For `text`: the text replaces a template with holes. @default false
 * @param opts.dir For `move`: up or down.
 * @param opts.name For `attr`: the attribute.
 * @param opts.value For `attr`: the value; null removes it.
 * @param opts.layout For `wrap`: stack (column), row or grid. @default "stack"
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The artboard's HTML source. */
    src: string;
    /** The operation. */
    op: "style" | "text" | "delete" | "duplicate" | "move" | "attr" | "wrap" | "unwrap";
    /** The elements by tid. */
    tids: number[];
    /** For `style`: property → value; null or "" removes the property. */
    changes?: Record<string, string | null>;
    /** For `text`: the new plain text (newlines become <br>). */
    text?: string;
    /** For `text`: the new text with inline markup. */
    html?: string;
    /** For `text`: the text replaces a template with holes. @default false */
    template?: boolean;
    /** For `move`: up or down. */
    dir?: "up" | "down";
    /** For `attr`: the attribute. */
    name?: string;
    /** For `attr`: the value; null removes it. */
    value?: string | null;
    /** For `wrap`: stack (column), row or grid. @default "stack" */
    layout?: "stack" | "row" | "grid";
}): { html: string; select?: number; note: string } | { error: string } {
    const parse = (src: string) => ctx.fns.designCanvas.parse({ src });
    const attrOf = (src: string, el: types.designCanvas.Element, name: string): string | null => {
        const open = src.slice(el.start, el.openEnd);
        const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g; re.lastIndex = 1 + el.tag.length;
        for (let m; (m = re.exec(open)); ) if (m[1]!.toLowerCase() === name) return m[2] ?? m[3] ?? m[4] ?? "";
        return null;
    };
    const parseStyle = (s: string): Array<[string, string]> => {
        const out: Array<[string, string]> = [];
        let buf = "", depth = 0, q = "";
        const flush = () => { const k = buf.indexOf(":"); if (k > 0) { const p = buf.slice(0, k).trim().toLowerCase(), v = buf.slice(k + 1).trim(); if (p && v) out.push([p, v]); } buf = ""; };
        for (const c of s) {
            if (q) { buf += c; if (c === q) q = ""; continue; }
            if (c === '"' || c === "'") q = c;
            if (c === "(") depth++;
            if (c === ")") depth = Math.max(0, depth - 1);
            if (c === ";" && !depth) { flush(); continue; }
            buf += c;
        }
        flush();
        return out;
    };
    const restyle = (src: string, el: types.designCanvas.Element, changes: Record<string, string | null>) => {
        const open = src.slice(el.start, el.openEnd);
        const decl = parseStyle(unesc(attrOf(src, el, "style") ?? ""));
        for (const [p, v] of Object.entries(changes)) {
            const k = p.toLowerCase(), at = decl.findIndex(([q]) => q === k);
            if (v === null || v === "") { if (at >= 0) decl.splice(at, 1); continue; }
            if (at >= 0) decl[at] = [k, v]; else decl.push([k, v]);
        }
        const value = decl.map(([p, v]) => `${p}: ${v}`).join("; ");
        const m = /\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i.exec(open);
        if (m) return value ? open.slice(0, m.index) + ` style="${esc(value)}"` + open.slice(m.index + m[0].length) : open.slice(0, m.index) + open.slice(m.index + m[0].length);
        if (!value) return open;
        const tail = open.endsWith("/>") ? 2 : 1;
        return `${open.slice(0, open.length - tail).replace(/\s+$/, "")} style="${esc(value)}"${open.slice(open.length - tail)}`;
    };
    const inlineHtml = (raw: string) => {
        let out = "";
        const open: string[] = [];
        for (const m of raw.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g)) {
            if (m[4] !== undefined) { out += m[4].replace(/&(?!(amp|lt|gt|quot|nbsp|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/>/g, "&gt;"); continue; }
            if (m[0] === "<") { out += "&lt;"; continue; }
            const tag = m[2]!.toLowerCase(), closing = m[1] === "/";
            if (!INLINE.has(tag)) continue;
            if (tag === "br") { if (!closing) out += "<br>"; continue; }
            if (closing) { const i = open.lastIndexOf(tag); if (i >= 0) while (open.length > i) out += `</${open.pop()}>`; continue; }
            const href = tag === "a" ? /\bhref\s*=\s*"([^"]*)"/i.exec(m[3] ?? "")?.[1] : undefined;
            out += `<${tag}${href && /^(https?:|mailto:|#|\/|[A-Za-z0-9_][A-Za-z0-9_.-]*\.html)/i.test(unesc(href)) ? ` href="${esc(unesc(href))}"` : ""}>`;
            open.push(tag);
        }
        while (open.length) out += `</${open.pop()}>`;
        return out;
    };
    const countIn = (els: types.designCanvas.Element[], el: types.designCanvas.Element): number => 1 + el.children.reduce((n, c) => n + countIn(els, els[c]!), 0);
    const inPage = (els: types.designCanvas.Element[], el: types.designCanvas.Element) => {
        const body = els.find((e) => e.tag === "body");
        return body ? el.start > body.start && el.end <= body.closeStart : !["html", "head"].includes(el.tag);
    };

    const one = (src: string, tid: number): { html: string; select?: number; note: string } | { error: string } => {
        const els = parse(src), el = els[tid];
        if (!el) return { error: "stale" };
        if (opts.op !== "style" && opts.op !== "text" && !inPage(els, el)) return { error: "edge" };
        const outer = src.slice(el.start, el.end);
        const sibs = (el.parent >= 0 ? els[el.parent]!.children : els.filter((e) => e.parent < 0).map((e) => e.tid)).map((t) => els[t]!);
        switch (opts.op) {
            case "style":
                if (!opts.changes || !Object.keys(opts.changes).length) return { error: "bad" };
                if (Object.keys(opts.changes).some((k) => !/^-?-?[a-z][a-z0-9-]*$/i.test(k))) return { error: "bad" };
                return { html: src.slice(0, el.start) + restyle(src, el, opts.changes) + src.slice(el.openEnd), select: tid, note: `style of #${tid} (${Object.keys(opts.changes).join(", ")})` };
            case "text": {
                if (src.slice(el.openEnd, el.closeStart).includes("{{") && !opts.template) return { error: "bound" };
                if (VOID.has(el.tag) || el.children.some((c) => !INLINE.has(els[c]!.tag))) return { error: "children" };
                const text = opts.html !== undefined && !opts.template ? inlineHtml(opts.html)
                    : String(opts.text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                return { html: src.slice(0, el.openEnd) + text + src.slice(el.closeStart), select: tid, note: `text of #${tid}` };
            }
            case "delete":
                return { html: src.slice(0, el.start) + src.slice(el.end), note: `removed #${tid} ${el.tag}` };
            case "duplicate": {
                const gap = /\s*$/.exec(src.slice(0, el.start))![0].replace(/^[^\n]*\n/, "\n");
                return { html: src.slice(0, el.end) + (gap.includes("\n") ? gap : "") + outer + src.slice(el.end), select: tid + countIn(els, el), note: `duplicated #${tid} ${el.tag}` };
            }
            case "move": {
                const at = sibs.indexOf(el), other = sibs[opts.dir === "up" ? at - 1 : at + 1];
                if (!other) return { error: "edge" };
                const [a, b] = opts.dir === "up" ? [other, el] : [el, other];
                const html = src.slice(0, a.start) + src.slice(b.start, b.end) + src.slice(a.end, b.start) + src.slice(a.start, a.end) + src.slice(b.end);
                return { html, select: opts.dir === "up" ? other.tid : tid + countIn(els, other), note: `moved #${tid} ${el.tag} ${opts.dir}` };
            }
            case "attr": {
                const name = String(opts.name ?? "").toLowerCase();
                if (!ATTRS.has(name)) return { error: "bad" };
                const open = src.slice(el.start, el.openEnd);
                const re = new RegExp(`\\s${name.replace(/-/g, "\\-")}(?:\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?(?=[\\s/>])`, "i");
                const m = re.exec(open);
                let next = m ? open.slice(0, m.index) + open.slice(m.index + m[0].length) : open;
                if (opts.value != null) { const tail = next.endsWith("/>") ? 2 : 1; next = `${next.slice(0, next.length - tail).replace(/\s+$/, "")} ${name}="${esc(opts.value)}"${next.slice(next.length - tail)}`; }
                return { html: src.slice(0, el.start) + next + src.slice(el.openEnd), select: tid, note: `${name} of #${tid}` };
            }
            case "wrap": {
                const style = opts.layout === "grid" ? "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px" : `display: flex; flex-direction: ${opts.layout === "row" ? "row" : "column"}; gap: 12px`;
                return { html: `${src.slice(0, el.start)}<div style="${style}">${outer}</div>${src.slice(el.end)}`, select: tid, note: `wrapped #${tid} ${el.tag} in a ${opts.layout ?? "stack"}` };
            }
            case "unwrap":
                if (!el.children.length || el.tag.startsWith("dc-")) return { error: "edge" };
                return { html: src.slice(0, el.start) + src.slice(el.openEnd, el.closeStart).replace(/^\s*\n|\n\s*$/g, "") + src.slice(el.end), select: tid, note: `ungrouped #${tid} ${el.tag}` };
            default:
                return { error: "bad" };
        }
    };

    const src = String(opts.src ?? "");
    const els = parse(src);
    const uniq = [...new Set(opts.tids ?? [])].filter((t) => els[t]);
    if (!uniq.length) return { error: "stale" };
    const inside = (t: number) => uniq.some((u) => u !== t && els[u]!.start <= els[t]!.start && els[t]!.end <= els[u]!.end);
    const list = opts.op === "style" ? uniq : uniq.filter((t) => !inside(t));
    if (opts.op === "text" || list.length === 1) return one(src, list[0]!);
    const primary = list[0]!;
    const order = [...list].sort((a, b) => (opts.op === "move" && opts.dir === "up" ? a - b : b - a));
    let html = src, select: number | undefined, picked = false;
    const notes: string[] = [];
    for (const t of order) {
        const before = parse(html).length;
        const r = one(html, t);
        if ("error" in r) { if (r.error === "stale") return r; continue; }
        const delta = parse(r.html).length - before;
        if (picked && select !== undefined && t < select) select += delta;
        if (t === primary) { select = r.select; picked = true; }
        html = r.html; notes.push(r.note);
    }
    if (html === src) return { error: "edge" };
    return { html, select, note: notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0] ?? "" };
}
