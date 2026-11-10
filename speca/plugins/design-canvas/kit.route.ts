import { defineRoute } from "speca/sdk";
import { C } from "./lib/strings.ts";

// The canvas kit, live: every component of assets/dck.css built by its dck.js builder, in the app's own styles —
// the place to look before adding a control to the canvas (COMPONENTS.md describes them).
export default defineRoute({
  method: "GET",
  path: "kit",
  async handler(_req, _params, api) {
    const lang = api.t.locale === "ru" ? "ru" : "en";
    return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Design canvas kit</title>
<link rel="stylesheet" href="/assets/vendor/basecoat.css"><link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/assets/css/product.css">
<link rel="stylesheet" href="/p/design-canvas/assets/dck.css"><style>body{background:var(--app);color:var(--foreground);font-family:"Golos Text",system-ui,sans-serif;font-size:13px;padding:32px}
.k-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;align-items:start}.k-card{background:var(--popover);border:1px solid var(--line-strong);border-radius:var(--r-lg);overflow:hidden}
.k-card>h2{margin:0;padding:10px 12px;font-size:12px;font-weight:600;border-bottom:1px solid var(--line);color:var(--fg-2)}.k-card>.k-b{padding:12px;display:flex;flex-direction:column;gap:8px}
h1{font-size:20px;margin:0 0 6px}p.k-lead{color:var(--fg-2);margin:0 0 24px}</style></head>
<body class="dk-scope" data-l="${JSON.stringify(C[lang]).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><h1>Design canvas kit</h1><p class="k-lead">plugins/design-canvas/assets/dck.css · dck.js · COMPONENTS.md</p><div class="k-grid" id="kit"></div>
<script src="/p/design-canvas/assets/dck.js"></script><script src="/p/design-canvas/assets/kit.js"></script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  },
});
