import { defineRoute } from "speca/sdk";
import { FILE, type DesignState } from "./lib/model.ts";
import { render } from "./lib/template.ts";

// An artboard as it was at a version (ver) or a moment of the journal (at), or as it is (the draft): a still picture
// for the comparison of versions — rendered, no editor, no scripts.
export default defineRoute({
  method: "GET",
  path: "snapshot/:tab/:file",
  async handler(req, params, api) {
    const tab = await api.canvas.view(params.tab!);
    if (!tab || tab.kind !== "design-canvas.board" || !FILE.test(params.file!)) return new Response("not found", { status: 404 });
    const q = new URL(req.url).searchParams, ver = Number(q.get("ver")) || null, at = Number(q.get("at")) || null;
    const st = ((ver || at) ? await api.canvas.stateAt(params.tab!, { v: ver, at }) : tab.state) as DesignState | null;
    const src = st?.files?.[params.file!];
    if (!st || src === undefined) return new Response("not found", { status: 404 });
    const body = render(src, st.files, undefined, { tids: false, depth: 0, seen: new Set() }).replace(/<script\b(?![^>]*type="application\/json")[\s\S]*?<\/script>/gi, "");
    const origin = new URL(req.url).origin;
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}html,body{height:100%}body>:is(div,section,main,article,header,footer,aside,nav,form){width:100%!important;max-width:100%!important;box-sizing:border-box}body:not(:has(>:is(div,section,main,article,header,footer,aside,nav,form)~:is(div,section,main,article,header,footer,aside,nav,form)))>:is(div,section,main,article,header,footer,aside,nav,form){height:100%!important}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}</style></head><body>${body}</body></html>`, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "content-security-policy": `sandbox; default-src 'none'; style-src 'unsafe-inline' ${origin}/canvas-libs/; font-src data:; img-src data: blob:; frame-ancestors 'self'` },
    });
  },
});
