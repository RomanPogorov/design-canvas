// The person's side through Hyper's router: the tab page (Speca's markup and assets), an artboard frame, the person's
// edits by Speca's own routes, the core endpoints (draft, versions, undo, comments, prototype), CSRF, the canvas view.
import { expect, test, beforeAll } from "bun:test";
import { testCtx } from "hyper:test";

let ctx: any, cookie: string, csrf: string, tabId: string;
const http = (method: string, url: string, body?: unknown, o: { token?: string; type?: string } = {}) => ctx.fns.procs.http.dispatch({ method, url, body, headers: { cookie, "x-csrf": o.token ?? csrf, ...(o.type ? { "content-type": o.type } : {}) } });
const form = (url: string, data: Record<string, string> = {}, token?: string) => http("POST", url, new URLSearchParams(data).toString(), { type: "application/x-www-form-urlencoded", token });
const json = (url: string, data: unknown) => http("POST", url, JSON.stringify(data), { type: "application/json" });
beforeAll(async () => {
  ctx = await testCtx({});
  const user = await ctx.fns.auth.createUser({ name: "Роман", email: "roman@example.test", password: "correct-horse-1" });
  cookie = `${ctx.fns.procs.auth.cookieName({})}=${await ctx.fns.procs.auth.sign({ sub: user.id, name: "Роман", days: 1 })}`;
  csrf = await ctx.fns.auth.csrfToken({ req: new Request("http://localhost/designCanvas", { headers: { cookie } }) });
  tabId = (await ctx.fns.designCanvas.open({ title: "Квиз", rows: [{ boards: [{ file: "01-q.html", title: "01 Вопрос", w: 390, h: 844, html: `<main><script type="application/json" data-dc-data>{"options":[{"text":"Да"},{"text":"Нет"}]}</script><h1 style="color: red">Вопрос</h1><dc-for each="options" as="o"><p>{{o.text}}</p></dc-for></main>` }] }] })).tabId;
});

test("the tab page: Speca's chrome (draft chip, prototype) around Speca's canvas, its assets at the plugin's addresses", async () => {
  const r = await http("GET", `/designCanvas/t/${tabId}`);
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain(`"x-csrf":"${csrf}"`);
  expect(html).toContain('class="vp-chip "');
  expect(html).toContain("Собрать прототип");
  expect(html).toContain(`class="dcv dk-scope"`);
  expect(html).toContain(`data-tab="${tabId}"`);
  expect(html).toContain(`data-live-topic="canvas:${tabId}"`);
  expect(html).toMatch(/\/designCanvas\/p\/assets\/dcv\.js\?v=\w+/);
  expect(html).not.toContain("/p/design-canvas/");
  for (const p of ["/designCanvas/p/assets/dcv.js", "/designCanvas/p/assets/panel.js", "/designCanvas/p/assets/dck.css", "/designCanvas/web/css/product.css", "/designCanvas/web/vendor/htmx.js", "/designCanvas/web/vendor/fonts/golos-latin-400.woff2", "/designCanvas/host.js"]) {
    const a = await http("GET", p);
    expect({ p, s: a.status }).toEqual({ p, s: 200 });
  }
  expect(await (await http("GET", "/designCanvas/web/css/product.css")).text()).toContain("url(/designCanvas/web/vendor/fonts/");
  expect(await (await http("GET", "/designCanvas/p/assets/dcv-comments.js")).text()).toContain("`/designCanvas/c/${tab}/comments");
  expect((await http("GET", "/designCanvas/p/assets/..%2Fboard.canvas.ts")).status).toBe(404);
  expect((await http("GET", `/designCanvas/t/dc_nope`)).status).toBe(404);
});

test("an artboard frame: Speca's board route — rendered with tids, sandboxed by CSP", async () => {
  const r = await http("GET", `/designCanvas/p/board/${tabId}/01-q.html`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
  const html = await r.text();
  expect(html).toContain('data-tid="2"');
  expect(html).toContain('data-item="options.1"');
});

test("the person's edits: Speca's edit route writes the draft; stale versions refused; CSRF required", async () => {
  const st: any = (await import("../../sdk/store.ts"));
  const v = Bun.hash((await st.getTab(ctx, tabId)).state.files["01-q.html"]).toString(36);
  expect((await json(`/designCanvas/p/edit/${tabId}`, { file: "01-q.html", v: "old", tid: 2, op: "text", text: "x" })).status).toBe(409);
  const r = await json(`/designCanvas/p/edit/${tabId}`, { file: "01-q.html", v, tid: 2, op: "style", changes: { color: "blue" } });
  expect(r.status).toBe(200);
  const tab = await st.getTab(ctx, tabId);
  expect(tab.state.files["01-q.html"]).toContain("color: blue");
  expect(tab.draft_edits).toBe(1);
  const r2 = await json(`/designCanvas/p/edit/${tabId}`, { file: "01-q.html", v: (await r.json()).v, op: "data", path: "options.1.text", text: "Иногда" });
  expect(r2.status).toBe(200);
  expect((await st.getTab(ctx, tabId)).state.files["01-q.html"]).toContain("Иногда");
  expect((await http("POST", `/designCanvas/p/edit/${tabId}`, "{}", { token: "bad", type: "application/json" })).status).toBe(403);
  const body = await (await http("GET", `/designCanvas/c/${tabId}/in`)).text();
  expect(body).toContain("Черновик");
  expect(body).toContain("2 правки");
});

test("undo is the person's own: their last change goes back, the agent's never", async () => {
  const st: any = (await import("../../sdk/store.ts"));
  expect((await http("POST", `/designCanvas/c/${tabId}/undo`)).status).toBe(204);
  expect((await st.getTab(ctx, tabId)).state.files["01-q.html"]).not.toContain("Иногда");
  expect((await http("POST", `/designCanvas/c/${tabId}/redo`)).status).toBe(204);
  expect((await st.getTab(ctx, tabId)).state.files["01-q.html"]).toContain("Иногда");
});

test("versions: commit (toast in an ASCII header), look at one, compare, restore, rename, the journal", async () => {
  const c = await form(`/designCanvas/c/${tabId}/commit`, { name: "Синий заголовок" });
  expect(c.status).toBe(204);
  expect(JSON.parse(c.headers.get("hx-trigger")!)["dh-toast"].title).toBe("Сохранено как v2");
  const v1 = await (await http("GET", `/designCanvas/c/${tabId}/body?v=1`)).text();
  expect(v1).toContain("ver-banner");
  expect(v1).toContain("Вернуть v1");
  expect(v1).toContain("&amp;ver=1");
  const cmp = await (await http("GET", `/designCanvas/c/${tabId}/body?v=2&compare=1`)).text();
  expect(cmp).toContain("dcc-row");
  expect(cmp).toContain("blue");
  const back = await form(`/designCanvas/c/${tabId}/restore`, { v: "1" });
  expect(back.status).toBe(200);
  expect(await back.text()).toContain("Черновик · 1 правка");
  expect((await form(`/designCanvas/c/${tabId}/versions/2/name`, { name: "Синий" })).status).toBe(204);
  const j = await (await http("GET", `/designCanvas/c/${tabId}/journal`)).text();
  expect(j).toContain("Синий");
  expect(j).toContain("возврат к v1");
  const drop = await form(`/designCanvas/c/${tabId}/restore`, { v: "2" });
  expect(await drop.text()).toContain("v2");
});

test("comments: pinned to an element, a reply, resolve, clear all", async () => {
  const r = await form(`/designCanvas/c/${tabId}/comments`, { body: "Крупнее", label: "01 Вопрос › Заголовок «Вопрос»", path: "01-q.html#2:0/1", text: "Вопрос", fx: "0.5", fy: "0.5", design: JSON.stringify({ file: "01-q.html", tid: 2, path: "0/1", fp: "Вопрос" }) });
  expect(r.status).toBe(200);
  const cm = await r.json();
  expect(cm).toMatchObject({ mine: true, body: "Крупнее", anchor: { design: { file: "01-q.html", tid: 2 } } });
  expect((await form(`/designCanvas/cm/${cm.id}/reply`, { text: "И жирнее" })).status).toBe(204);
  const l = await (await http("GET", `/designCanvas/c/${tabId}/comments`)).json();
  expect(l.comments[0].replies[0].text).toBe("И жирнее");
  expect(await (await http("POST", `/designCanvas/c/${tabId}/comments/resolve`)).json()).toEqual({ resolved: 1 });
  expect((await (await http("GET", `/designCanvas/c/${tabId}/comments`)).json()).comments).toEqual([]);
  expect((await (await http("GET", `/designCanvas/c/${tabId}/comments?all=1`)).json()).comments.length).toBe(1);
});

test("presence: Speca's presence routes, the others only", async () => {
  expect((await json(`/designCanvas/p/presence/${tabId}`, { state: { x: 1, y: 2 } })).status).toBe(200);
  expect(await (await http("GET", `/designCanvas/p/presence/${tabId}`)).json()).toEqual({ people: [] });
});

test("the canvas kind is the view designCanvas.page, which fills the tab with the page", async () => {
  const html = await ctx.fns.designCanvas.page({ tabId });
  expect(html).toContain(`src="/designCanvas/t/${tabId}"`);
  expect(html).toContain("height:100%");
});
