// The artboard source as a flat list of elements with their offsets in the text, numbered in preorder exactly as the
// frame numbers them (data-tid). A tolerant HTML tokenizer: comments, doctype, raw-text elements (script, style,
// textarea…), void and self-closed tags, and the common implied end tags (li, td, tr, option…).

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
// a start tag of the key closes an open element of these tags
const CLOSES: Record<string, string[]> = { li: ["li"], dt: ["dt", "dd"], dd: ["dt", "dd"], tr: ["tr", "td", "th"], td: ["td", "th"], th: ["td", "th"], option: ["option"] };

/**
 * Parses an artboard's HTML into its elements, each with its tid (preorder index), tag and offsets in the source.
 *
 * Use to resolve an address like `Main.html#12` to the markup it names: `src.slice(el.start, el.end)` is element 12.
 * The tids match the `data-tid` attributes of the rendered frame and the outline of designCanvas.read.
 * @param opts.src The artboard's HTML source.
 */
export default function (_ctx: Context, _session: Session | null, opts: {
    /** The artboard's HTML source. */
    src: string;
}): types.designCanvas.Element[] {
    const src = String(opts.src ?? "");
    const all: types.designCanvas.Element[] = [];
    const stack: types.designCanvas.Element[] = [];
    const close = (el: types.designCanvas.Element, at: number, end: number) => { el.closeStart = at; el.end = end; };
    const tagEnd = (lt: number) => {
        let q = "";
        for (let j = lt + 1; j < src.length; j++) {
            const c = src[j]!;
            if (q) { if (c === q) q = ""; continue; }
            if (c === '"' || c === "'") q = c;
            else if (c === ">") return j + 1;
        }
        return src.length;
    };
    let i = 0;
    while (i < src.length) {
        const lt = src.indexOf("<", i);
        if (lt < 0) break;
        if (src.startsWith("<!--", lt)) { const e = src.indexOf("-->", lt + 4); i = e < 0 ? src.length : e + 3; continue; }
        if (src[lt + 1] === "!" || src[lt + 1] === "?") { const e = src.indexOf(">", lt); i = e < 0 ? src.length : e + 1; continue; }
        if (src[lt + 1] === "/") {
            const m = /^<\/([a-zA-Z][^\s/>]*)[^>]*>/.exec(src.slice(lt, lt + 200));
            if (!m) { i = lt + 1; continue; }
            const tag = m[1]!.toLowerCase(), end = lt + m[0].length;
            const at = stack.map((e) => e.tag).lastIndexOf(tag);
            if (at >= 0) { while (stack.length > at + 1) close(stack.pop()!, lt, lt); close(stack.pop()!, lt, end); }
            i = end; continue;
        }
        if (!/[a-zA-Z]/.test(src[lt + 1] ?? "")) { i = lt + 1; continue; }
        const openEnd = tagEnd(lt);
        const tag = /^<([^\s/>]+)/.exec(src.slice(lt, lt + 100))![1]!.toLowerCase();
        const closes = CLOSES[tag];
        if (closes && stack.length && closes.includes(stack[stack.length - 1]!.tag)) close(stack.pop()!, lt, lt);
        const parent = stack[stack.length - 1];
        const el: types.designCanvas.Element = { tid: all.length, tag, start: lt, openEnd, closeStart: openEnd, end: openEnd, parent: parent ? parent.tid : -1, children: [] };
        all.push(el); parent?.children.push(el.tid);
        i = openEnd;
        if (VOID.has(tag) || src[openEnd - 2] === "/") continue;
        if (RAW.has(tag)) {
            const re = new RegExp(`</${tag}\\s*>`, "ig"); re.lastIndex = openEnd;
            const m = re.exec(src);
            close(el, m ? m.index : src.length, m ? m.index + m[0].length : src.length);
            i = el.end; continue;
        }
        stack.push(el);
    }
    while (stack.length) close(stack.pop()!, src.length, src.length);
    return all;
}
