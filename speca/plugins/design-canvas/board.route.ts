import { defineRoute, sandboxCsp, sandboxShim } from "speca/sdk";
import { FILE, type DesignState } from "./lib/model.ts";
import { render } from "./lib/template.ts";

// One artboard, served into a sandboxed iframe: the file rendered (repeats, branches, data, components; every element
// numbered by its tag in the source — data-tid) and the picker.
// No network: only the libraries installed for canvases (/canvas-libs/) may load.
// read per request: an asset changes without the plugin reloading
const picker = () => Bun.file(new URL("./assets/picker.js", import.meta.url)).text();

export default defineRoute({
  method: "GET",
  path: "board/:tab/:file",
  async handler(req, params, api) {
    const tab = await api.canvas.view(params.tab!);
    if (!tab || tab.kind !== "design-canvas.board" || !FILE.test(params.file!)) return new Response("not found", { status: 404 });
    // a version (ver) or a moment of the journal (at) being looked at; else the draft
    const q = new URL(req.url).searchParams, ver = Number(q.get("ver")) || null, at = Number(q.get("at")) || null;
    const st = ((ver || at) ? await api.canvas.stateAt(params.tab!, { v: ver, at }) : tab.state) as DesignState | null;
    if (!st) return new Response("not found", { status: 404 });
    const src = st.files?.[params.file!];
    if (src === undefined) return new Response("not found", { status: 404 });
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const page = render(src, st.files);
    const body = (api.canvas.inlineFiles ? await api.canvas.inlineFiles(params.tab!, page) : page).replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
    const origin = new URL(req.url).origin;
    return new Response(`<!doctype html><html><head><meta charset="utf-8">${sandboxShim(nonce)}<style>html,body{margin:0}html,body{height:100%}body>:is(div,section,main,article,header,footer,aside,nav,form){width:100%!important;max-width:100%!important;box-sizing:border-box}body:not(:has(>:is(div,section,main,article,header,footer,aside,nav,form)~:is(div,section,main,article,header,footer,aside,nav,form)))>:is(div,section,main,article,header,footer,aside,nav,form){height:100%!important}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}body{user-select:none;-webkit-user-select:none}[contenteditable]{outline:none;cursor:text;user-select:text;-webkit-user-select:text}*{cursor:default}</style></head><body>${body}<script nonce="${nonce}">${await picker()}</script></body></html>`, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": sandboxCsp(nonce, origin),
        "cache-control": "no-store",
      },
    });
  },
});
