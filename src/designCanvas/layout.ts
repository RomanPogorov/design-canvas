const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;
const ID = /^[\w-]{1,40}$/;

type Op =
    | { op: "move"; file: string; x: number; y: number }
    | { op: "moveMany"; items: Array<{ file?: string; note?: string; x: number; y: number }> }
    | { op: "resize"; file: string; w: number; h: number }
    | { op: "rename"; file: string; title: string }
    | { op: "remove"; file: string }
    | { op: "duplicate"; file: string; x?: number; y?: number }
    | { op: "note"; id?: string; kind?: "title" | "sticky"; text?: string; x?: number; y?: number; w?: number; sheet?: string }
    | { op: "removeNote"; id: string }
    | { op: "toSheet"; file: string; sheet: string }
    | { op: "sheet"; id?: string; title: string }
    | { op: "removeSheet"; id: string }
    | { op: "comment"; file: string; tid: number; fx?: number; fy?: number; label?: string; text: string }
    | { op: "replyComment"; id: string; text: string }
    | { op: "resolveComment"; id: string; reply?: string }
    | { op: "removeComment"; id: string };

/**
 * Changes the layout of a design canvas and its comments, several operations at once (all or nothing).
 *
 * Use to arrange artboards and notes and to answer the person's comments. Operations:
 * `move {file, x, y}`, `moveMany {items:[{file|note, x, y}]}`, `resize {file, w, h}`, `rename {file, title}`,
 * `remove {file}`, `duplicate {file, x?, y?}`, `note {id?, kind: title|sticky, text, x, y, w?, sheet?}` (adds or
 * changes a row title or sticky), `removeNote {id}`, `toSheet {file, sheet}` (move an artboard to a page by title,
 * made if missing), `sheet {id?, title}` (add or rename a page), `removeSheet {id}` (an empty page),
 * `comment {file, tid, fx?, fy?, label?, text}` (pin a comment to an element; tid -1: the artboard),
 * `replyComment {id, text}`, `resolveComment {id, reply?}` (after acting on a comment), `removeComment {id}`.
 * Boards in a row sit 80px apart, rows 120px apart; a row title sits 300px above its row with w = the row width.
 * Returns what changed and the ids it made (new notes, comments, duplicated files).
 * @param opts.name The canvas name.
 * @param opts.ops 1–60 operations.
 * @param opts.by Who makes the change (comments' author). @default "agent"
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** 1–60 operations. */
    ops: Op[];
    /** Who makes the change (comments' author). @default "agent" */
    by?: string;
}): Promise<{ applied: number; rev: number; made: string[]; note: string }> {
    const c = await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.layout: no canvas "${opts.name}"`);
    const ops = Array.isArray(opts.ops) ? opts.ops : [];
    if (!ops.length || ops.length > 60) throw new Error("designCanvas.layout: give 1–60 ops");
    const by = String(opts.by ?? "agent").slice(0, 120), now = new Date().toISOString();
    const made: string[] = [], notes: string[] = [];
    const num = (v: unknown, what: string) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`designCanvas.layout: ${what} must be a number`); return Math.round(n); };
    const board = (f: unknown) => { const b = c.boards[String(f)]; if (!b) throw new Error(`designCanvas.layout: no artboard ${f}. Nothing was changed.`); return b; };
    const comment = (id: unknown) => { const k = c.comments[String(id)]; if (!k) throw new Error(`designCanvas.layout: no comment ${id}. Nothing was changed.`); return k; };
    const sheets = () => (c.sheets.length ? c.sheets : [{ id: "main", title: "" }]);
    const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const o of ops) {
        switch (o?.op) {
            case "move": Object.assign(board(o.file), { x: num(o.x, "x"), y: num(o.y, "y") }); notes.push(`moved ${o.file}`); break;
            case "moveMany":
                for (const it of o.items ?? []) {
                    const t = it.file ? board(it.file) : it.note ? c.notes[it.note] : undefined;
                    if (t) Object.assign(t, { x: num(it.x, "x"), y: num(it.y, "y") });
                }
                notes.push(`moved ${(o.items ?? []).length} item(s)`); break;
            case "resize": {
                const w = num(o.w, "w"), h = num(o.h, "h");
                if (w < 80 || h < 80 || w > 4000 || h > 20000) throw new Error("designCanvas.layout: w 80–4000, h 80–20000");
                Object.assign(board(o.file), { w, h }); notes.push(`resized ${o.file} to ${w}×${h}`); break;
            }
            case "rename": board(o.file).title = String(o.title ?? "").trim().slice(0, 120) || board(o.file).title; notes.push(`renamed ${o.file}`); break;
            case "remove": board(o.file); delete c.boards[o.file]; delete c.files[o.file]; c.order = c.order.filter((f) => f !== o.file); notes.push(`removed ${o.file}`); break;
            case "duplicate": {
                const b = board(o.file), base = o.file.replace(/(-copy\d*)?\.html$/, "");
                let n = 1, file = `${base}-copy.html`;
                while (c.boards[file] || c.files[file] !== undefined) file = `${base}-copy${++n}.html`;
                if (!FILE.test(file)) throw new Error(`designCanvas.layout: cannot name a copy of ${o.file}`);
                c.boards[file] = { ...b, x: Math.round(o.x ?? b.x + b.w + 80), y: Math.round(o.y ?? b.y), title: `${b.title} copy`.slice(0, 120) };
                if (c.files[o.file] !== undefined) c.files[file] = c.files[o.file]!;
                c.order.splice(c.order.indexOf(o.file) + 1, 0, file);
                made.push(file); notes.push(`duplicated ${o.file}`); break;
            }
            case "note": {
                const id = o.id && ID.test(o.id) ? o.id : uid("n");
                const prev = c.notes[id];
                const next: types.designCanvas.Note = { kind: o.kind ?? prev?.kind ?? "sticky", text: String(o.text ?? prev?.text ?? "").slice(0, 2000),
                    x: num(o.x ?? prev?.x ?? 0, "x"), y: num(o.y ?? prev?.y ?? 0, "y") };
                const w = o.w ?? prev?.w; if (w) next.w = num(w, "w");
                const sheet = o.sheet ?? prev?.sheet; if (sheet && sheets().some((s) => s.id === sheet) && sheet !== sheets()[0]!.id) next.sheet = sheet;
                c.notes[id] = next; if (!prev) made.push(id); notes.push(`${prev ? "changed" : "added"} note ${id}`); break;
            }
            case "removeNote": delete c.notes[o.id]; notes.push(`removed note ${o.id}`); break;
            case "toSheet": {
                const b = board(o.file), id = ctx.fns.designCanvas.findSheet({ canvas: c, title: o.sheet });
                delete b.sheet;
                const others = { ...c, boards: Object.fromEntries(Object.entries(c.boards).filter(([f]) => f !== o.file)) };
                Object.assign(b, ctx.fns.designCanvas.placeNew({ canvas: others, sheet: id }));
                if (id) b.sheet = id;
                notes.push(`moved ${o.file} to page "${o.sheet}"`); break;
            }
            case "sheet": {
                const title = String(o.title ?? "").trim().slice(0, 80);
                if (!title) throw new Error("designCanvas.layout: a page needs a title");
                const hit = o.id ? sheets().find((s) => s.id === o.id) : undefined;
                if (hit) { c.sheets = sheets().map((s) => (s.id === hit.id ? { ...s, title } : s)); notes.push(`renamed page to "${title}"`); }
                else { const id = ctx.fns.designCanvas.findSheet({ canvas: c, title }); made.push(id ?? sheets()[0]!.id); notes.push(`added page "${title}"`); }
                break;
            }
            case "removeSheet": {
                const list = sheets(), at = list.findIndex((s) => s.id === o.id);
                if (at < 0 || list.length < 2) throw new Error("designCanvas.layout: no such page, or it is the only one");
                const used = Object.values(c.boards).some((b) => (b.sheet ?? list[0]!.id) === o.id) || Object.values(c.notes).some((n) => (n.sheet ?? list[0]!.id) === o.id);
                if (used) throw new Error("designCanvas.layout: the page is not empty — move or remove its artboards first");
                c.sheets = list.filter((s) => s.id !== o.id);
                if (at === 0) for (const x of [...Object.values(c.boards), ...Object.values(c.notes)]) if (x.sheet === c.sheets[0]!.id) delete x.sheet;
                if (c.sheets.length === 1 && !c.sheets[0]!.title) c.sheets = [];
                notes.push("removed a page"); break;
            }
            case "comment": {
                board(o.file);
                const text = String(o.text ?? "").trim().slice(0, 4000);
                if (!text) throw new Error("designCanvas.layout: a comment needs text");
                const id = uid("c");
                c.comments[id] = { file: o.file, tid: Math.max(-1, Math.floor(Number(o.tid ?? -1))), fx: Math.min(1, Math.max(0, Number(o.fx ?? 0.5))), fy: Math.min(1, Math.max(0, Number(o.fy ?? 0.5))),
                    label: String(o.label ?? (Number(o.tid) >= 0 ? `#${o.tid}` : c.boards[o.file]!.title)).slice(0, 240), text, by, at: now };
                made.push(id); notes.push(`commented on ${o.file}`); break;
            }
            case "replyComment": { const k = comment(o.id); const text = String(o.text ?? "").trim().slice(0, 4000); if (!text) throw new Error("designCanvas.layout: a reply needs text"); (k.replies ??= []).push({ by, text, at: now }); notes.push(`replied to ${o.id}`); break; }
            case "resolveComment": { const k = comment(o.id); if (o.reply?.trim()) (k.replies ??= []).push({ by, text: o.reply.trim().slice(0, 4000), at: now }); k.resolved = true; notes.push(`resolved ${o.id}`); break; }
            case "removeComment": comment(o.id); delete c.comments[o.id]; notes.push(`removed comment ${o.id}`); break;
            default: throw new Error(`designCanvas.layout: unknown op ${(o as any)?.op}. Nothing was changed.`);
        }
    }
    const note = notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0] ?? "";
    const r = await ctx.fns.designCanvas.save({ canvas: c, note: `layout: ${note}` });
    return { applied: ops.length, rev: r.rev, made, note };
}
