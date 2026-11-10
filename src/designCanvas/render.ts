// An artboard file is a template: literal markup, plus data (one <script type="application/json" data-dc-data>),
// repeats (<dc-for each="topics" as="t" index="i">), branches (<dc-if test="t.mine">), holes ({{t.title}}) and
// components (<dc-import src="Card.html" title="{{t.title}}">, another artboard). The server renders it when it
// serves the frame. With `tids` every element carries the tid of its tag in the source (data-tid), so all copies a
// <dc-for> made share one tid: selecting one highlights them all and a style edit written to that one tag changes
// them all. A copy also says which data item it came from (data-item), and a text made of holes carries its template
// (data-tpl) and, when it is one hole over the data, that value's path (data-path), so editing it edits the data. A component instance is one element (its root carries
// the import's tid and data-import); its insides are edited in the component's own artboard. No code ever runs:
// holes are paths, tests are `a.b`, `!a.b`, `a.b == 'x'`, `a.b != 3`.

type Val = { v: unknown; p: string | null };   // a value and its path in the data (null: not from the data)
type Scope = Record<string, Val>;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const HOLE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Renders an artboard file for its frame, an export or a screenshot: data, repeats, branches and holes expanded,
 * components (`<dc-import src="Other.html" …>`) drawn in place from `files`.
 *
 * Use to see what an artboard really shows (the HTML after templates), e.g. to check a `<dc-for>` over data.
 * With `tids: true` (the editor's frame) every element gets `data-tid` (its address), copies of a repeat get
 * `data-item` (their data path), template texts get `data-tpl`, and repeats/branches leave comment markers;
 * with `tids: false` the result is clean HTML without the data block.
 * @param opts.src The artboard's HTML source.
 * @param opts.files Every artboard file of the canvas by name — what `<dc-import>` draws from. @default {}
 * @param opts.tids Mark elements with their addresses for the editor. @default false
 * @param opts.props Values a component receives (its import's attributes); internal for components. @default {}
 */
export default function (ctx: Context, session: Session | null, opts: {
    /** The artboard's HTML source. */
    src: string;
    /** Every artboard file of the canvas by name — what `<dc-import>` draws from. */
    files?: Record<string, string>;
    /** Mark elements with their addresses for the editor. @default false */
    tids?: boolean;
    /** Values a component receives (its import's attributes). */
    props?: Record<string, unknown>;
    /** Internal: nesting depth of components. */
    depth?: number;
    /** Internal: the component files being drawn (no self-imports). */
    seen?: string[];
    /** Internal: attributes and style the root element of a component takes from its instance. */
    root?: { add: Record<string, string>; style?: string };
}): string {
    const src = String(opts.src ?? ""), files = opts.files ?? {}, tids = opts.tids === true, depth = opts.depth ?? 0, seen = opts.seen ?? [];
    const els = ctx.fns.designCanvas.parse({ src });
    const attr = (e: types.designCanvas.Element, name: string): string | null => {
        const open = src.slice(e.start, e.openEnd);
        const re = new RegExp(ATTR.source, "g"); re.lastIndex = 1 + e.tag.length;
        for (let m; (m = re.exec(open)); ) if (m[1]!.toLowerCase() === name) return m[2] ?? m[3] ?? m[4] ?? "";
        return null;
    };
    // the data block: <script type="application/json" data-dc-data>{…}</script>
    const dataEl = els.find((e) => e.tag === "script" && attr(e, "data-dc-data") !== null);
    let data: Record<string, unknown> = {};
    if (dataEl) try { const d = JSON.parse(src.slice(dataEl.openEnd, dataEl.closeStart)); if (d && typeof d === "object" && !Array.isArray(d)) data = d; } catch { /* a broken block renders as no data */ }
    const rootScope: Scope = {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { v, p: k }])),
        ...Object.fromEntries(Object.entries(opts.props ?? {}).map(([k, v]) => [k, { v, p: null }])),
    };
    const resolve = (expr: string, scope: Scope): Val => {
        const segs = expr.trim().split(".").filter(Boolean);
        if (!segs.length) return { v: undefined, p: null };
        let cur: Val = scope[segs[0]!] ?? { v: undefined, p: null };
        for (const s of segs.slice(1)) {
            const v = cur.v as Record<string, unknown> | undefined;
            cur = { v: v == null ? undefined : s === "length" && Array.isArray(v) ? v.length : v[s], p: cur.p === null ? null : `${cur.p}.${s}` };
        }
        return cur;
    };
    const truthy = (test: string, scope: Scope): boolean => {
        const t = test.trim();
        const m = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(t);
        if (m) {
            const lit = m[3]!.trim();
            const want = /^(['"]).*\1$/.test(lit) ? lit.slice(1, -1) : lit === "true" ? true : lit === "false" ? false : Number.isFinite(Number(lit)) ? Number(lit) : resolve(lit, scope).v;
            const eq = resolve(m[1]!, scope).v == want;   // loose on purpose: "3" == 3
            return m[2] === "==" ? eq : !eq;
        }
        if (t.startsWith("!")) return !truthy(t.slice(1), scope);
        const v = resolve(t, scope).v;
        return Array.isArray(v) ? v.length > 0 : !!v;
    };
    const fill = (s: string, scope: Scope) => s.replace(HOLE, (_, e: string) => { const v = resolve(e, scope).v; return v == null ? "" : escText(typeof v === "object" ? JSON.stringify(v) : String(v)); });
    // attributes put into a start tag (before its `>` or `/>`); `style` merged into an existing one
    const inject = (open: string, add: Record<string, string>, style?: string): string => {
        let o = open;
        if (style) {
            const m = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(o);
            if (m) { const cur = (m[2] ?? m[3] ?? "").trim().replace(/;\s*$/, ""); o = o.slice(0, m.index) + ` style="${cur ? `${cur}; ` : ""}${escText(style)}"` + o.slice(m.index + m[0].length); }
            else add = { ...add, style };
        }
        const tail = o.endsWith("/>") ? 2 : 1;
        return o.slice(0, o.length - tail).replace(/\s+$/, "") + Object.entries(add).map(([k, v]) => ` ${k}="${escText(v)}"`).join("") + o.slice(o.length - tail);
    };

    let rootLeft = opts.root;
    const out: string[] = [];
    const range = (from: number, to: number, kids: number[], sc: Scope, item: string | null) => {
        let at = from;
        for (const k of kids) { const c = els[k]!; out.push(fill(src.slice(at, c.start), sc)); el(c, sc, item); at = c.end; }
        out.push(fill(src.slice(at, to), sc));
    };
    const el = (e: types.designCanvas.Element, sc: Scope, item: string | null): void => {
        if (e.tag === "dc-for") {
            const list = resolve(attr(e, "each") ?? "", sc), as = attr(e, "as") || "item", index = attr(e, "index");
            const items = Array.isArray(list.v) ? list.v : [];
            // no element of its own (a wrapper would break the page's CSS: "> div", ":nth-child"); the markers are comments
            if (tids) out.push(`<!--dc:for ${e.tid} ${items.length}-->`);
            items.forEach((it, i) => {
                const s2: Scope = { ...sc, [as]: { v: it, p: list.p === null ? null : `${list.p}.${i}` } };
                if (index) s2[index] = { v: i, p: null };
                range(e.openEnd, e.closeStart, e.children, s2, s2[as]!.p);
            });
            if (tids) out.push(`<!--/dc:for ${e.tid}-->`);
            return;
        }
        if (e.tag === "dc-if") {
            const on = truthy(attr(e, "test") ?? "", sc);
            if (tids) out.push(`<!--dc:if ${e.tid} ${on ? "on" : "off"}-->`);
            if (on) range(e.openEnd, e.closeStart, e.children, sc, item);
            if (tids) out.push(`<!--/dc:if ${e.tid}-->`);
            return;
        }
        let add: Record<string, string> = { ...(tids ? { "data-tid": String(e.tid) } : {}), ...(item && tids ? { "data-item": item } : {}) };
        let style: string | undefined;
        // the first element of a component carries the instance (its tid, its style)
        if (rootLeft && !RAW.has(e.tag) && e.tag !== "dc-import") { add = { ...add, ...rootLeft.add }; style = rootLeft.style; rootLeft = undefined; }
        if (e.tag === "dc-import") return component(e, sc, add);
        if (!tids && e.tag === "script" && attr(e, "data-dc-data") !== null) return;
        if (RAW.has(e.tag)) { out.push(inject(src.slice(e.start, e.openEnd), add, style) + src.slice(e.openEnd, e.end)); return; }
        const inner = src.slice(e.openEnd, e.closeStart);
        if (!e.children.length && tids && inner.includes("{{")) {
            add["data-tpl"] = inner.replace(/<br\s*\/?>/gi, "\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
            // a text that is one hole over the data: editing it in place edits that data value
            const one = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(inner), path = one ? resolve(one[1]!, sc).p : null;
            if (path) add["data-path"] = path;
        }
        out.push(inject(fill(src.slice(e.start, e.openEnd), sc), add, style));
        if (VOID.has(e.tag) || e.openEnd === e.end) return;
        range(e.openEnd, e.closeStart, e.children, sc, null);
        out.push(src.slice(e.closeStart, e.end));
    };
    const component = (e: types.designCanvas.Element, sc: Scope, add: Record<string, string>) => {
        const file = attr(e, "src") ?? "", body = files[file];
        const own = attr(e, "style") ?? undefined;
        if (body === undefined || seen.includes(file) || depth > 4) {
            out.push(inject(`<div style="padding:8px 10px;border:1px dashed currentColor;opacity:.6;font:12px system-ui">`, add) + escText(body === undefined ? `${file} — no such artboard` : `${file} — imports itself`) + "</div>");
            return;
        }
        // props: every other attribute; a lone hole passes the value itself (an object, a list)
        const props: Record<string, unknown> = {};
        const open = src.slice(e.start, e.openEnd);
        for (const m of open.slice(1 + e.tag.length).matchAll(new RegExp(ATTR.source, "g"))) {
            const k = m[1]!.toLowerCase(); if (k === "src" || k === "style" || k === "class") continue;
            const raw = m[2] ?? m[3] ?? m[4] ?? "", lone = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(raw);
            props[k] = lone ? resolve(lone[1]!, sc).v : fill(raw, sc).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        }
        out.push(ctx.fns.designCanvas.render({ src: body, files, props, tids: false, depth: depth + 1, seen: [...seen, file],
            root: { add: { ...add, ...(tids ? { "data-import": file } : {}) }, style: own } }) as unknown as string);
    };
    range(0, src.length, els.filter((e) => e.parent < 0).map((e) => e.tid), rootScope, null);
    return out.join("");
}
