// The agent's side: Speca's tools as designCanvas.* — open with a plan, draw, read, edit, layout, comments, versions,
// the prototype link and a screenshot.
import { expect, test, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { testCtx } from "hyper:test";

let ctx: any, dc: any, tabId = "";
const QUIZ = `<main style="display:flex;flex-direction:column;gap:12px;padding:24px"><script type="application/json" data-dc-data>{"options":[{"text":"Каждый день"},{"text":"Реже"}]}</script><h1 style="font-size:24px">Как часто?</h1><ul style="list-style:none;padding:0"><dc-for each="options" as="o"><li style="padding:12px;border:1px solid #ccc">{{o.text}}</li></dc-for></ul><div style="padding:8px;background:#eef">Блок 1</div><div style="padding:8px;background:#eef">Блок 2</div></main>`;
beforeAll(async () => { ctx = await testCtx({}); dc = ctx.fns.designCanvas; });

test("open: the plan opens with the artboards waiting, in rows with titles", async () => {
  const r = await dc.open({ title: "Квиз", rows: [{ title: "Квиз", boards: [{ file: "01-q.html", title: "01 Вопрос", w: 390, h: 844 }, { file: "02-r.html", title: "02 Результат", w: 390, h: 844 }] }] });
  tabId = r.tabId;
  expect(tabId).toMatch(/^dc_/);
  expect(r.text).toContain("draw each with designCanvas.write");
  const idx = (await dc.read({ tabId })).text;
  expect(idx).toContain("01-q.html");
  expect(idx).toMatch(/waiting|pending|planned/i);
});

test("write, read with tids, edit by snippet, a stale/missing snippet refused", async () => {
  const w = await dc.write({ tabId, file: "01-q.html", html: QUIZ });
  expect(w.text).toContain("01-q.html");
  const r = (await dc.read({ tabId, file: "01-q.html" })).text;
  expect(r).toContain("#");
  expect(r).toContain("dc-for");
  const e = await dc.edit({ tabId, file: "01-q.html", edits: [{ old: "Как часто?", new: "Как часто вы тренируетесь?" }] });
  expect(e.text).toContain("1 edit(s) applied");
  await expect(dc.edit({ tabId, file: "01-q.html", edits: [{ old: "нет такого", new: "x" }] })).rejects.toThrow(/not found/);
  const v = await dc.versions({ tabId });
  expect(v.current).toBe(1);
  expect(v.draftEdits).toBe(2);
});

test("layout: a sticky, a move; commit names a version; the draft starts again", async () => {
  await dc.layout({ tabId, ops: [{ op: "note", id: "s1", kind: "sticky", text: "Проверить тексты", x: 0, y: -200 }, { op: "move", file: "02-r.html", x: 900, y: 0 }] });
  expect((await dc.read({ tabId })).text).toContain("Проверить тексты");
  const c = await dc.commit({ tabId, name: "Первый вариант" });
  expect(c).toEqual({ version: 2, committed: true });
  const v = await dc.versions({ tabId });
  expect(v.versions.map((x: any) => x.name)).toEqual(["created", "Первый вариант"]);
  expect(v.draftEdits).toBe(0);
  expect(await dc.commit({ tabId })).toEqual({ version: 2, committed: false });
});

test("comments: listed for the agent with their element, replied, resolved", async () => {
  const st = await import("../../sdk/store.ts");
  const cm = await st.addComment(ctx, { tabId, author: "user:u1", name: "Роман", anchor: { path: "01-q.html#5:0/3/0", text: "Блок 1", fx: 0.5, fy: 0.5, design: { file: "01-q.html", tid: 5, path: "0/3/0", fp: "Блок 1" } }, label: "01 Вопрос › Блок «Блок 1»", body: "Крупнее" });
  const l = await dc.comments({ tabId });
  expect(l.text).toContain("Крупнее");
  expect(l.text).toContain("01-q.html#5:0/3/0");
  expect((await dc.read({ tabId })).text).toContain("Крупнее");
  await dc.resolveComment({ commentId: cm.id, reply: "Сделал" });
  expect((await dc.comments({ tabId })).comments).toEqual([]);
  const all = (await dc.comments({ tabId, all: true })).comments;
  expect(all[0].resolved).toBe(true);
  expect(all[0].replies[0].text).toBe("Сделал");
});

test("list and show", async () => {
  const l = await dc.list({ all: true });
  expect(l.some((x: any) => x.tabId === tabId && x.boards === 2 && x.waiting === 1)).toBe(true);
  expect(await dc.show({ tabId, focus: "01 Вопрос" })).toEqual({ shown: true });
});

test.skipIf(!existsSync("/Applications/Google Chrome.app") && !process.env.CHROME_PATH)("screenshot: an artboard, one element of it, the canvas page", async () => {
  const a = await dc.screenshot({ tabId, part: "01-q.html" });
  expect([a.width, a.height]).toEqual([390, 844]);
  expect(existsSync(a.path)).toBe(true);
  const el = await dc.screenshot({ tabId, part: "01-q.html#3" });
  expect(el.width).toBeLessThan(390);
  const all = await dc.screenshot({ tabId });
  expect(all.width).toBeGreaterThan(390);
}, 60_000);
