// The editor's side through Hyper's router: the editor page, its state, an artboard's frame, the person's edits
// (CSRF, stale versions, undo), layout and versions; the browser assets; the canvas kind and its view.
import { expect, test, beforeAll } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testCtx } from "hyper:test";

let ctx: any, dc: any, cookie: string, csrf: string;
const http = (method: string, url: string, body?: unknown, token = csrf) => ctx.fns.procs.http.dispatch({ method, url, body, headers: { cookie, "x-csrf-token": token } });
beforeAll(async () => {
  ctx = await testCtx({ env: { DESIGN_CANVAS_ROOT: await mkdtemp(join(tmpdir(), "dc-routes-")) } });
  dc = ctx.fns.designCanvas;
  const user = await ctx.fns.auth.createUser({ name: "Roman", email: "roman@example.test", password: "correct-horse-1" });
  cookie = `${ctx.fns.procs.auth.cookieName({})}=${await ctx.fns.procs.auth.sign({ sub: user.id, name: "Roman", days: 1 })}`;
  csrf = await ctx.fns.auth.csrfToken({ req: new Request("http://localhost/designCanvas/x", { headers: { cookie } }) });
  await dc.open({ name: "shop", title: "Shop", show: false, rows: [{ title: "Flow", boards: [
    { file: "Card.html", title: "Card", w: 320, h: 120, html: `<article style="padding:8px"><script type="application/json" data-dc-data>{"title":"Item"}</script><h3>{{title}}</h3></article>` },
    { file: "Home.html", title: "01 Home", w: 390, h: 844, html: `<main><script type="application/json" data-dc-data>{"items":[{"name":"Tea"},{"name":"Cake"}]}</script><h1 style="color: red">Shop</h1><dc-for each="items" as="it"><p>{{it.name}}</p></dc-for><dc-import src="Card.html" title="Sale"></dc-import></main>` },
  ] }] });
});

test("the editor page frames the canvas with its state, csrf and the plugin's assets", async () => {
  const r = await http("GET", "/designCanvas/shop");
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain('id="dc"');
  expect(html).toContain(`data-csrf="${csrf}"`);
  expect(html).toMatch(/\/designCanvas\/editor\.js\?v=\w+/);
  const state = JSON.parse(html.match(/<script type="application\/json" id="dc-state">([\s\S]*?)<\/script>/)![1]!);
  expect(state.order).toEqual(["Card.html", "Home.html"]);
  expect(state.files).toBeUndefined();
  expect(Object.keys(state.v)).toEqual(["Card.html", "Home.html"]);
  expect((await http("GET", "/designCanvas/nope")).status).toBe(404);
  expect((await http("GET", "/designCanvas/sh..op")).status).toBe(400);
  const list = await (await http("GET", "/designCanvas")).text();
  expect(list).toContain("Shop");
});

test("the browser assets are served by Hyper's script loader", async () => {
  for (const [path, type] of [["/designCanvas/editor.js", "javascript"], ["/designCanvas/picker.js", "javascript"], ["/designCanvas/editor.css", "css"]]) {
    const r = await http("GET", path);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain(type);
    expect((await r.text()).length).toBeGreaterThan(500);
  }
});

test("an artboard frame: rendered with tids and the picker, sandboxed by CSP; play and static modes", async () => {
  const r = await http("GET", "/designCanvas/shop/board/Home.html");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
  const html = await r.text();
  expect(html).toContain('<h1 style="color: red" data-tid="2">Shop</h1>');
  expect(html).toContain('data-item="items.1"');
  expect(html).toContain('data-import="Card.html"');
  expect(html).toContain("<h3>Sale</h3>");
  expect(html).toContain("__dc");
  const st = await (await http("GET", "/designCanvas/shop/board/Home.html?mode=static")).text();
  expect(st).not.toContain("data-tid");
  expect(st).not.toContain("__dc");
  expect((await http("GET", "/designCanvas/shop/board/Nope.html")).status).toBe(404);
  expect((await http("GET", "/designCanvas/shop/board/..%2Fcanvas.json")).status).toBe(404);
});

test("the person's edits: style and text by tid, a copy's text as data, stale versions refused, undo by set", async () => {
  const state = async () => (await http("GET", "/designCanvas/shop/state")).json();
  let s = await state();
  expect((await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: s.v["Home.html"], op: "style", tids: [2], changes: { color: "#111" } }, "bad")).status).toBe(403);
  const r1 = await (await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: s.v["Home.html"], op: "style", tids: [2], changes: { color: "#111" } })).json();
  expect(r1).toMatchObject({ ok: true, select: 2 });
  expect(r1.before).toContain("color: red");
  const stale = await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: s.v["Home.html"], op: "text", tids: [2], text: "x" });
  expect(stale.status).toBe(409);
  const r2 = await (await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: r1.v, op: "text", tids: [2], html: "Our <b>shop</b>" })).json();
  const r3 = await (await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: r2.v, op: "data", action: "set", path: "items.1.name", value: "Pie" })).json();
  let c = await dc.load({ name: "shop" });
  expect(c.files["Home.html"]).toContain('<h1 style="color: #111">Our <b>shop</b></h1>');
  expect(c.files["Home.html"]).toContain('"name": "Pie"');
  const bound = await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: r3.v, op: "text", tids: [4], text: "x" });
  expect(bound.status).toBe(422);
  expect((await bound.json()).error).toBe("bound");
  await http("POST", "/designCanvas/shop/edit", { file: "Home.html", v: r3.v, op: "set", html: r3.before });
  c = await dc.load({ name: "shop" });
  expect(c.files["Home.html"]).not.toContain("Pie");
  s = await state();
  expect(s.rev).toBe(c.rev);
});

test("layout and versions from the editor; comments carry the person's name", async () => {
  const r = await (await http("POST", "/designCanvas/shop/layout", { ops: [{ op: "comment", file: "Home.html", tid: 2, fx: 0.5, fy: 0.05, label: "h1 «Shop»", text: "Warmer colour" }, { op: "note", kind: "sticky", text: "Hi", x: 0, y: -200 }] })).json();
  expect(r.ok).toBe(true);
  const c = await dc.load({ name: "shop" });
  expect(c.comments[r.made[0]]).toMatchObject({ by: "Roman", text: "Warmer colour", tid: 2 });
  expect((await http("POST", "/designCanvas/shop/layout", { ops: [{ op: "move", file: "x.html", x: 1, y: 1 }] })).status).toBe(400);
  const v = await (await http("POST", "/designCanvas/shop/versions", { label: "First" })).json();
  expect(v).toEqual({ version: 1, label: "First" });
  expect(await (await http("GET", "/designCanvas/shop/versions")).json()).toMatchObject([{ version: 1, label: "First", boards: 2 }]);
  expect((await http("GET", "/designCanvas/shop/board/Home.html?ver=1&mode=static")).status).toBe(200);
  const exp = await http("GET", "/designCanvas/shop/export");
  expect(exp.headers.get("content-disposition")).toContain("shop.html");
});

test("the canvas kind is the view designCanvas.page: a frame of the editor", async () => {
  const kind = (await import(new URL("./$canvas_board.ts", import.meta.url).href)).default;
  expect(kind.view).toBe("designCanvas.page");
  expect(kind.prepare(ctx, { agentId: "a", args: { name: "shop" } })).toEqual({ args: { name: "shop" }, title: "Design · shop" });
  expect(() => kind.prepare(ctx, { agentId: "a", args: { name: "../x" } })).toThrow();
  const html = await dc.page({ name: "shop" });
  expect(html).toContain('src="/designCanvas/shop"');
  expect(html).toContain("data-rpc-frame");
  const viaRpc = await http("GET", `/rpc/designCanvas.page?${encodeURIComponent(JSON.stringify({ name: "shop" }))}`);
  expect(await viaRpc.text()).toContain('src="/designCanvas/shop"');
});
