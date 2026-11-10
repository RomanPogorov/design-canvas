import { defineRoute, z } from "speca/sdk";
import { FILE, version, placeNew, sheetOf, type DesignState } from "./lib/model.ts";
import { apply, applyMany, group, parse, type Op } from "./lib/dom.ts";
import { setData, itemOp, detached, renderKey } from "./lib/template.ts";
import { makeRepeat, repeatAll } from "./lib/repeat.ts";

// The person's edit of an artboard by address — a splice of its source that goes to the canvas draft:
// - one or several elements (`tids`): style from the panel, text in place, delete, duplicate, move, drag to a place,
//   wrap, an attribute (a link's target, an image), paste what was copied (after it, inside it, or in its place);
// - one copy of a repeat: its text edits its data value (`data`), delete / duplicate / move edit its data item (`item`);
// - components: make one from an element, or detach an instance back into markup;
// - hand-written copies: make them one repeat (data + a template).
// `v` is the version of the file the person was looking at: if it changed since, nothing is written (409).
const body = z.object({
  file: z.string().regex(FILE), v: z.string(), tid: z.number().int().min(0).optional(), tids: z.array(z.number().int().min(0)).max(500).optional(),
  op: z.enum(["style", "text", "delete", "duplicate", "move", "wrap", "group", "unwrap", "zorder", "reorder", "attr", "data", "item", "detach", "componentize", "repeat", "repeatAll", "styles", "paste"]),
  changes: z.record(z.string().regex(/^-?-?[a-z][a-z0-9-]*$/), z.string().max(400_000).nullable()).optional(),
  text: z.string().max(20_000).optional(), html: z.string().max(60_000).optional(), z: z.enum(["front", "back"]).optional(), template: z.boolean().optional(), dir: z.enum(["up", "down"]).optional(), layout: z.enum(["stack", "row", "grid"]).optional(), to: z.number().int().min(0).optional(),
  name: z.enum(["href", "src", "alt", "placeholder", "aria-label", "title"]).optional(), value: z.string().max(400_000).nullable().optional(),
  path: z.string().regex(/^[\w$-]+(\.[\w$-]+)*$/).max(200).optional(), action: z.enum(["delete", "duplicate", "up", "down"]).optional(),
  title: z.string().trim().min(1).max(60).optional(),
  snippet: z.string().min(1).max(4_000_000).optional(), mode: z.enum(["after", "inside", "replace"]).optional(),
  batch: z.array(z.object({ tids: z.array(z.number().int().min(0)).min(1).max(500), changes: z.record(z.string().regex(/^-?-?[a-z][a-z0-9-]*$/), z.string().max(2000).nullable()) }).strict()).max(20).optional(), w: z.number().min(40).max(4000).optional(), h: z.number().min(40).max(20000).optional(),
}).strict();

const slug = (s: string) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "Component";

export default defineRoute({
  method: "POST",
  path: "edit/:tab",
  async handler(req, params, api) {
    const p = body.safeParse(await req.json().catch(() => null));
    const tab = await api.canvas.view(params.tab!);
    if (!p.success || !tab || tab.kind !== "design-canvas.board" || !tab.canAct) return new Response("forbidden", { status: 403 });
    const a = p.data, st = tab.state as DesignState;
    const src = st.files?.[a.file];
    if (src === undefined) return new Response("not found", { status: 404 });
    if (version(src) !== a.v) return Response.json({ error: "stale", v: version(src) }, { status: 409 });
    const title = st.boards[a.file]?.title ?? a.file;
    const files = { ...st.files }, boards = { ...st.boards }, order = [...st.order];
    let note = "", out: Record<string, unknown> = {};

    if (a.op === "data" || a.op === "item") {
      if (!a.path) return Response.json({ error: "bad" }, { status: 400 });
      const r = a.op === "data" ? setData(src, a.path, a.text ?? "") : itemOp(src, a.path, a.action ?? "delete");
      if ("error" in r) return Response.json(r, { status: r.error === "stale" ? 409 : 422 });
      files[a.file] = r.html; note = a.op === "data" ? `data ${a.path}` : `${a.action} item ${a.path}`;
      if ("item" in r) out.item = r.item;
    } else if (a.op === "styles") {
      // several style edits at once (a colour replaced everywhere it paints): style keeps every tid where it is
      let html = src;
      for (const g of a.batch ?? []) { const r = applyMany(html, { op: "style", tid: g.tids[0]!, changes: g.changes }, g.tids); if ("error" in r) { if (r.error === "edge") continue; return Response.json(r, { status: 409 }); } html = r.html; }
      files[a.file] = html; note = `recoloured ${(a.batch ?? []).reduce((n, g) => n + g.tids.length, 0)} element(s)`;
    } else if (a.op === "repeatAll") {
      const r = repeatAll(src);
      if (!r.made.length && r.html === src) return Response.json({ error: "no_twins" }, { status: 422 });
      files[a.file] = r.html; note = `made repeats (${r.made.map((m) => `${m.count} × ${m.tag}`).join(", ")})`; out.made = r.made.length;
    } else if (a.op === "repeat") {
      const r = makeRepeat(src, a.tid ?? -1);
      if ("error" in r) return Response.json(r, { status: r.error === "stale" ? 409 : 422 });
      files[a.file] = r.html; note = `made ${r.count} copies one repeat (${r.key})`; Object.assign(out, { select: r.tid, key: r.key });
    } else if (a.op === "detach" || a.op === "componentize") {
      const els = parse(src), el = a.tid === undefined ? undefined : els[a.tid];
      if (!el) return Response.json({ error: "stale" }, { status: 409 });
      if (a.op === "detach") {
        if (el.tag !== "dc-import") return Response.json({ error: "not_instance" }, { status: 422 });
        const html = detached(src, el, st.files);
        if (html === null) return Response.json({ error: "missing" }, { status: 422 });
        files[a.file] = src.slice(0, el.start) + html + src.slice(el.end); note = `detached #${el.tid}`;
      } else {
        const outer = src.slice(el.start, el.end);
        for (let x = el.parent; x; x = x.parent) if (x.tag === "dc-for" || x.tag === "dc-if") return Response.json({ error: "in_repeat" }, { status: 422 });
        if (outer.includes("{{") || ["html", "head", "body"].includes(el.tag)) return Response.json({ error: "bound" }, { status: 422 });
        const base = slug(a.title ?? "Component");
        let file = `${base}.html`, n = 1;
        while (files[file]) file = `${base}-${++n}.html`;
        const w = Math.round(a.w ?? 320), h = Math.round(a.h ?? 120);
        files[file] = outer;
        // on the page of the board it came from
        const sheet = st.boards[a.file]?.sheet;
        boards[file] = { ...placeNew(st, w, h, sheetOf(st, st.boards[a.file] ?? {})), w, h, title: a.title ?? base, ...(sheet ? { sheet } : {}) };
        order.push(file);
        files[a.file] = src.slice(0, el.start) + `<dc-import src="${file}"></dc-import>` + src.slice(el.end);
        note = `made #${el.tid} a component (${file})`; out.component = file;
      }
      out.select = a.tid;
    } else {
      const tids = a.tids?.length ? a.tids : a.tid !== undefined ? [a.tid] : [];
      if (!tids.length) return Response.json({ error: "bad" }, { status: 400 });
      const t0 = tids[0]!;
      // several siblings into one group
      if (a.op === "group") {
        const r = group(src, tids, a.layout === "row" ? "row" : "stack");
        if ("error" in r) return Response.json(r, { status: 422 });
        files[a.file] = r.html;
        await api.canvas.write(tab.id, { state: { ...st, files, boards, order }, note: `${title}: ${r.note}` });
        return Response.json({ v: version(r.html), k: renderKey(a.file, files), select: r.select });
      }
      const op: Op = a.op === "style" ? { op: "style", tid: t0, changes: a.changes ?? {} } : a.op === "text" ? { op: "text", tid: t0, text: a.text ?? "", template: a.template, ...(a.html !== undefined ? { html: a.html } : {}) }
        : a.op === "zorder" ? { op: "zorder", tid: t0, dir: a.z ?? "front" } : a.op === "unwrap" ? { op: "unwrap", tid: t0 }
        : a.op === "move" ? { op: "move", tid: t0, dir: a.dir ?? "down" } : a.op === "wrap" ? { op: "wrap", tid: t0, layout: a.layout ?? "stack" }
        : a.op === "paste" ? { op: "paste", tid: t0, html: a.snippet ?? "", mode: a.mode ?? "after" }
        : a.op === "reorder" ? { op: "reorder", tid: t0, to: a.to ?? 0 } : a.op === "attr" ? { op: "attr", tid: t0, name: a.name ?? "title", value: a.value ?? null }
        : { op: a.op, tid: t0 };
      const r = tids.length > 1 && op.op !== "paste" ? applyMany(src, op, tids) : apply(src, op);
      if ("error" in r) return Response.json(r, { status: r.error === "stale" ? 409 : 422 });
      files[a.file] = r.html; note = r.note; out.select = r.select;
    }
    await api.canvas.write(tab.id, { state: { ...st, files, boards, order }, note: `${title}: ${note}` });
    return Response.json({ v: version(files[a.file]!), k: renderKey(a.file, files), ...out });
  },
});
