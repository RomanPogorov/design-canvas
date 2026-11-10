import { defineRoute, z } from "speca/sdk";
import { FILE, GAP_X, placeNew, sheetOf, sheetsOf, type DesignState } from "./lib/model.ts";
import { boardsClipSchema, pasteBoards } from "./lib/boards-clip.ts";

// The person arranging the canvas by hand: drag boards (one or several) and notes, rename, duplicate or delete boards,
// add, edit and delete stickies. Same index the agent's design-canvas_layout changes. (Comments are the core's:
// /canvas/:tab/comments, like every canvas.)
const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), file: z.string().regex(FILE), x: z.number(), y: z.number() }).strict(),
  z.object({ op: z.literal("moveMany"), items: z.array(z.object({ file: z.string().regex(FILE).optional(), note: z.string().optional(), x: z.number(), y: z.number() }).strict()).min(1).max(200) }).strict(),
  z.object({ op: z.literal("removeMany"), files: z.array(z.string().regex(FILE)).max(200), notes: z.array(z.string()).max(200).optional() }).strict(),
  z.object({ op: z.literal("rename"), file: z.string().regex(FILE), title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ op: z.literal("resize"), file: z.string().regex(FILE), w: z.number().int().min(40).max(4000), h: z.number().int().min(40).max(20000) }).strict(),
  z.object({ op: z.literal("duplicate"), file: z.string().regex(FILE), x: z.number().optional(), y: z.number().optional() }).strict(),
  z.object({ op: z.literal("remove"), file: z.string().regex(FILE) }).strict(),
  z.object({ op: z.literal("note"), id: z.string().regex(/^[\w-]{1,40}$/).optional(), text: z.string().max(2000).optional(), x: z.number().optional(), y: z.number().optional(), sheet: z.string().regex(/^[\w-]{1,40}$/).optional() }).strict(),
  z.object({ op: z.literal("removeNote"), id: z.string() }).strict(),
  // pages: add or rename one, remove an empty one, move artboards (and notes) to one
  z.object({ op: z.literal("sheet"), id: z.string().regex(/^[\w-]{1,40}$/).optional(), title: z.string().trim().min(1).max(80) }).strict(),
  z.object({ op: z.literal("removeSheet"), id: z.string() }).strict(),
  // artboards copied on this or another design canvas (copy route, { files }): centred on `at`, on the page shown
  z.object({ op: z.literal("pasteBoards"), clip: boardsClipSchema, at: z.object({ x: z.number(), y: z.number() }).strict().optional(), sheet: z.string().optional() }).strict(),
  z.object({ op: z.literal("toSheet"), files: z.array(z.string().regex(FILE)).max(200), notes: z.array(z.string()).max(200).optional(), sheet: z.string() }).strict(),
]);

export default defineRoute({
  method: "POST",
  path: "layout/:tab",
  async handler(req, params, api) {
    const p = op.safeParse(await req.json().catch(() => null));
    const tab = await api.canvas.view(params.tab!);
    if (!p.success || !tab || tab.kind !== "design-canvas.board" || !tab.canAct) return new Response("forbidden", { status: 403 });
    const o = p.data, s = structuredClone(tab.state as DesignState);
    s.notes ??= {};
    let note = "", out: Record<string, unknown> = {};
    if ("file" in o && !s.boards[o.file]) return new Response("not found", { status: 404 });
    if (o.op === "move") { Object.assign(s.boards[o.file]!, { x: Math.round(o.x), y: Math.round(o.y) }); note = `moved ${s.boards[o.file]!.title}`; }
    if (o.op === "moveMany") {
      for (const it of o.items) {
        const t = it.file ? s.boards[it.file] : it.note ? s.notes[it.note] : undefined;
        if (t) Object.assign(t, { x: Math.round(it.x), y: Math.round(it.y) });
      }
      note = `moved ${o.items.length} item(s)`;
    }
    if (o.op === "removeMany") {
      for (const f of o.files) { delete s.boards[f]; delete s.files[f]; }
      s.order = s.order.filter((f) => s.boards[f]);
      for (const n of o.notes ?? []) delete s.notes[n];
      note = `removed ${o.files.length + (o.notes?.length ?? 0)} item(s)`;
    }
    if (o.op === "resize") { Object.assign(s.boards[o.file]!, { w: o.w, h: o.h }); note = `resized ${s.boards[o.file]!.title} to ${o.w}×${o.h}`; }
    if (o.op === "rename") { note = `renamed ${s.boards[o.file]!.title} → ${o.title}`; s.boards[o.file]!.title = o.title; }
    if (o.op === "remove") { note = `removed ${s.boards[o.file]!.title}`; delete s.boards[o.file]; delete s.files[o.file]; s.order = s.order.filter((f) => f !== o.file); }
    if (o.op === "duplicate") {
      const b = s.boards[o.file]!, base = o.file.replace(/(-copy\d*)?\.html$/, "");
      let n = 1, file = `${base}-copy.html`;
      while (s.boards[file] || s.files[file]) file = `${base}-copy${++n}.html`;
      s.boards[file] = { ...b, x: Math.round(o.x ?? b.x + b.w + GAP_X), y: Math.round(o.y ?? b.y), title: `${b.title} copy` };
      s.files[file] = s.files[o.file] ?? "";
      s.order.splice(s.order.indexOf(o.file) + 1, 0, file);
      note = `duplicated ${b.title}`; out = { file };
    }
    if (o.op === "pasteBoards") {
      const r = pasteBoards(s, o.clip, { at: o.at, sheet: o.sheet });
      note = `pasted ${r.files.length} artboard(s)`; out = { files: r.files };
    }
    if (o.op === "note") {
      const id = o.id ?? `n${Date.now().toString(36)}`, cur = s.notes[id];
      if (!cur && (o.x === undefined || o.y === undefined)) return new Response("bad request", { status: 400 });
      const sheet = cur?.sheet ?? (o.sheet && sheetsOf(s).some((p) => p.id === o.sheet) && o.sheet !== sheetsOf(s)[0]!.id ? o.sheet : undefined);
      s.notes[id] = { kind: cur?.kind ?? "sticky", text: o.text ?? cur?.text ?? "", x: Math.round(o.x ?? cur!.x), y: Math.round(o.y ?? cur!.y), ...(cur?.w ? { w: cur.w } : {}), ...(sheet ? { sheet } : {}) };
      note = cur ? (o.text !== undefined ? "edited a note" : "moved a note") : "added a note"; out = { id };
    }
    if (o.op === "removeNote") { if (!s.notes[o.id]) return new Response("not found", { status: 404 }); delete s.notes[o.id]; note = "removed a note"; }
    if (o.op === "sheet") {
      // the first page is named the first time there are two: what was there stays on it
      s.sheets = [...sheetsOf(s)].map((p) => (p.title ? p : { ...p, title: o.id === p.id ? o.title : api.t.locale === "ru" ? "Страница 1" : "Page 1" }));
      const cur = o.id ? s.sheets.find((p) => p.id === o.id) : null;
      if (cur) { note = `renamed page ${cur.title} → ${o.title}`; cur.title = o.title; out = { id: cur.id }; }
      else { const id = `p${Date.now().toString(36)}`; s.sheets.push({ id, title: o.title }); note = `added page ${o.title}`; out = { id }; }
    }
    if (o.op === "removeSheet") {
      const list = sheetsOf(s);
      if (list.length < 2 || !list.some((p) => p.id === o.id)) return new Response("not found", { status: 404 });
      if (Object.values(s.boards).some((b) => sheetOf(s, b) === o.id) || Object.values(s.notes).some((n) => sheetOf(s, n) === o.id)) return Response.json({ error: "not_empty" }, { status: 409 });
      s.sheets = list.filter((p) => p.id !== o.id); note = "removed a page";
      if (s.sheets.length === 1 && s.sheets[0]!.id === "main") delete s.sheets;
    }
    if (o.op === "toSheet") {
      if (!sheetsOf(s).some((p) => p.id === o.sheet)) return new Response("not found", { status: 404 });
      for (const f of o.files) { const b = s.boards[f]; if (!b) continue; const pos = placeNew(s, b.w, b.h, o.sheet); Object.assign(b, pos, { sheet: o.sheet }); }
      for (const n of o.notes ?? []) { const x = s.notes[n]; if (x) x.sheet = o.sheet; }
      note = `moved ${o.files.length + (o.notes?.length ?? 0)} item(s) to page ${sheetsOf(s).find((p) => p.id === o.sheet)?.title ?? o.sheet}`;
    }
    await api.canvas.write(tab.id, { state: s, note });
    return Response.json(out);
  },
});
