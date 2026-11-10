// The agent's API end to end on a throwaway designs directory: plan, draw, read, edit, arrange, comment, versions,
// export — and what is written on disk.
import { expect, test, beforeAll } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testCtx } from "hyper:test";

let ctx: any, dc: any, root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dc-api-"));
  ctx = await testCtx({ env: { DESIGN_CANVAS_ROOT: root } });
  dc = ctx.fns.designCanvas;
});

const HOME = `<main style="display:flex;flex-direction:column;gap:16px;padding:24px">
  <script type="application/json" data-dc-data>{"items":[{"t":"Rent"},{"t":"Food"}]}</script>
  <h1 style="font-size:28px">Budget</h1>
  <dc-for each="items" as="it"><p class="row">{{it.t}}</p></dc-for>
  <a href="02-add.html">Add</a>
</main>`;

test("open lays the plan out in rows with titles; boards wait until drawn", async () => {
  expect(await dc.dir({})).toBe(root);
  const r = await dc.open({ title: "Budget app", show: false, rows: [
    { title: "Onboarding", boards: [{ file: "01-home.html", title: "01 Home", w: 390, h: 844 }, { file: "02-add.html", title: "02 Add", w: 390, h: 844 }] },
    { title: "Admin", boards: [{ file: "10-admin.html", title: "10 Admin", w: 1440, h: 900, html: "<div><h1>Admin</h1></div>" }] },
  ] });
  expect(r).toMatchObject({ name: "budget-app", url: "/designCanvas/budget-app", boards: 3, waiting: ["01-home.html", "02-add.html"] });
  const c = await dc.load({ name: "budget-app" });
  expect(c.notes.row1).toMatchObject({ kind: "title", text: "Onboarding", x: 0, y: 0, w: 860 });
  expect(c.boards["01-home.html"]).toMatchObject({ x: 0, y: 300, pending: true });
  expect(c.boards["02-add.html"]).toMatchObject({ x: 470, y: 300 });
  expect(c.boards["10-admin.html"]).toMatchObject({ x: 0, y: 300 + 844 + 120 + 300 });
  expect((await readdir(join(root, "budget-app"))).sort()).toEqual(["10-admin.html", "canvas.json"]);
  // a second canvas of the same title gets its own name; a taken explicit name is refused
  expect((await dc.open({ title: "Budget app", show: false, rows: [{ boards: [{ file: "a.html", title: "A", w: 390, h: 844 }] }] })).name).toBe("budget-app-2");
  await expect(dc.open({ name: "budget-app", title: "X", show: false, rows: [{ boards: [{ file: "a.html", title: "A", w: 390, h: 844 }] }] })).rejects.toThrow(/exists/);
  await expect(dc.open({ title: "X", show: false, rows: [{ boards: [{ file: "../x.html", title: "A", w: 390, h: 844 }] }] })).rejects.toThrow(/bad file name/);
});

test("write draws planned boards in order, adds new ones to the right, and puts boards on named pages", async () => {
  const w1 = await dc.write({ name: "budget-app", file: "01-home.html", html: HOME });
  expect(w1).toMatchObject({ did: "drew", w: 390, h: 844, waiting: ["02-add.html"] });
  await dc.write({ name: "budget-app", file: "02-add.html", html: `<form><label>Amount<input placeholder="0"></label><button>Save</button></form>` });
  const w3 = await dc.write({ name: "budget-app", file: "03-done.html", html: "<div><p>Saved</p></div>", title: "03 Done" });
  expect(w3.did).toBe("added");
  const c = await dc.load({ name: "budget-app" });
  expect(c.boards["03-done.html"]).toMatchObject({ x: 1440 + 80, y: c.boards["10-admin.html"].y });
  await dc.write({ name: "budget-app", file: "20-variant.html", html: "<div>B</div>", sheet: "Variants" });
  const c2 = await dc.load({ name: "budget-app" });
  expect(c2.sheets.map((s: any) => s.title)).toEqual(["Page 1", "Variants"]);
  expect(c2.boards["20-variant.html"]).toMatchObject({ x: 0, y: 0, sheet: c2.sheets[1].id });
  expect(c2.rev).toBeGreaterThan(3);
});

test("read gives the index and a file's outline with tids", async () => {
  const index = await dc.read({ name: "budget-app" });
  expect(index).toContain('Design canvas "Budget app"');
  expect(index).toContain('- 01-home.html · "01 Home" · 390×844');
  expect(index).toContain('Pages: "Page 1", "Variants"');
  expect(index).toContain("note row1 (title)");
  const file = await dc.read({ name: "budget-app", file: "01-home.html" });
  expect(file).toContain('h1 "Budget"');
  expect(file).toContain("<dc-for each=\"items\"");
  expect(await dc.read({ name: "budget-app", file: "01-home.html", rendered: true })).toContain(">Food</p>");
  await expect(dc.read({ name: "budget-app", file: "nope.html" })).rejects.toThrow(/no artboard/);
});

test("edit applies exact snippets all or nothing", async () => {
  await expect(dc.edit({ name: "budget-app", file: "01-home.html", edits: [{ old: "Budget</h1>", new: "Money</h1>" }, { old: "not there", new: "x" }] })).rejects.toThrow(/nothing was changed[\s\S]*edit 2/);
  expect((await dc.load({ name: "budget-app" })).files["01-home.html"]).toContain("Budget</h1>");
  await expect(dc.edit({ name: "budget-app", file: "01-home.html", edits: [{ old: "16px", new: "8px" }] })).resolves.toMatchObject({ applied: 1 });
  await expect(dc.edit({ name: "budget-app", file: "01-home.html", edits: [{ old: "px", new: "rem" }] })).rejects.toThrow(/occurs/);
  const r = await dc.edit({ name: "budget-app", file: "01-home.html", edits: [{ old: "Budget</h1>", new: "Money</h1>" }], note: "renamed heading" });
  expect(r.applied).toBe(1);
  expect(await Bun.file(join(root, "budget-app", "01-home.html")).text()).toContain("Money</h1>");
  expect((await dc.load({ name: "budget-app" })).note).toBe("renamed heading");
});

test("layout moves, notes, pages and comments; an unknown board changes nothing", async () => {
  const rev = (await dc.load({ name: "budget-app" })).rev;
  await expect(dc.layout({ name: "budget-app", ops: [{ op: "move", file: "01-home.html", x: 5, y: 5 }, { op: "move", file: "zz.html", x: 0, y: 0 }] })).rejects.toThrow(/no artboard zz.html/);
  expect((await dc.load({ name: "budget-app" })).rev).toBe(rev);
  const r = await dc.layout({ name: "budget-app", ops: [
    { op: "move", file: "03-done.html", x: 1000, y: 300 },
    { op: "note", kind: "sticky", text: "Ask about currency", x: -300, y: 300 },
    { op: "duplicate", file: "02-add.html" },
    { op: "comment", file: "01-home.html", tid: 2, fx: 0.5, fy: 0.1, label: "h1 «Money»", text: "Bigger title?" },
  ] });
  expect(r.made).toHaveLength(3);
  const [noteId, copy, commentId] = r.made;
  let c = await dc.load({ name: "budget-app" });
  expect(c.notes[noteId]).toMatchObject({ kind: "sticky", text: "Ask about currency" });
  expect(copy).toBe("02-add-copy.html");
  expect(c.files[copy]).toBe(c.files["02-add.html"]);
  expect(await dc.read({ name: "budget-app" })).toContain(`comment ${commentId} on [h1 «Money»](01-home.html#2)`);
  await dc.layout({ name: "budget-app", ops: [{ op: "replyComment", id: commentId, text: "Made it 32px" }, { op: "resolveComment", id: commentId }, { op: "toSheet", file: copy, sheet: "Variants" }, { op: "remove", file: "03-done.html" }] });
  c = await dc.load({ name: "budget-app" });
  expect(c.comments[commentId]).toMatchObject({ resolved: true, replies: [{ by: "agent", text: "Made it 32px" }] });
  expect(await dc.read({ name: "budget-app" })).not.toContain("Open comments");
  expect(c.boards[copy].sheet).toBe(c.sheets[1].id);
  expect(c.boards[copy].x).toBe(390 + 80);
  expect(c.boards["03-done.html"]).toBeUndefined();
  expect(await Bun.file(join(root, "budget-app", "03-done.html")).exists()).toBe(false);
  await expect(dc.layout({ name: "budget-app", ops: [{ op: "removeSheet", id: c.sheets[1].id }] })).rejects.toThrow(/not empty/);
});

test("versions: commit, list, read a version, restore keeps the replaced state", async () => {
  const v1 = await dc.commit({ name: "budget-app", label: "Cards" });
  expect(v1).toEqual({ version: 1, label: "Cards" });
  await dc.edit({ name: "budget-app", file: "01-home.html", edits: [{ old: "Money</h1>", new: "Spending</h1>" }] });
  expect(await dc.read({ name: "budget-app", file: "01-home.html", version: 1 })).toContain("Money</h1>");
  const r = await dc.restore({ name: "budget-app", version: 1 });
  expect(r).toMatchObject({ restored: 1, saved: 2 });
  expect((await dc.load({ name: "budget-app" })).files["01-home.html"]).toContain("Money</h1>");
  const list = await dc.versions({ name: "budget-app" });
  expect(list.map((v: any) => v.version)).toEqual([2, 1]);
  expect(list[0].label).toBe('Before restoring "Cards"');
  expect(await dc.read({ name: "budget-app", file: "01-home.html", version: 2 })).toContain("Spending</h1>");
});

test("export, list and the static page of an artboard", async () => {
  const html = await dc.exportHtml({ name: "budget-app" });
  expect(html).toContain("<h1>Budget app</h1>");
  expect(html).toContain("01 Home");
  expect(html).toContain("&gt;Food&lt;/p&gt;");
  expect(html).toContain('<h2 class="pg">Variants</h2>');
  const list = await dc.list({});
  expect(list.map((x: any) => x.name).sort()).toEqual(["budget-app", "budget-app-2"]);
  const c = await dc.load({ name: "budget-app" });
  const page = await dc.boardPage({ canvas: c, file: "01-home.html", mode: "static" });
  expect(page).not.toContain("data-tid");
  expect(page).not.toContain("<script");
  const edit = await dc.boardPage({ canvas: c, file: "01-home.html" });
  expect(edit).toContain('data-tid="2"');
  expect(edit).toContain("__dc");
  const ov = await dc.overviewHtml({ canvas: c });
  expect(ov.width).toBeGreaterThan(390);
  expect(ov.html).toContain("Ask about currency");
});

test("names never escape the designs directory", async () => {
  for (const name of ["../x", "a/b", "", ".hidden", "x".repeat(81)]) await expect(dc.paths({ name })).rejects.toThrow(/invalid canvas name/);
});

test("screenshot needs the Browser plugin and says so when it is missing", async () => {
  if ((ctx.fns as any).cdp?.send) return;   // mounted with the browser plugin: covered by the mount check
  await expect(dc.screenshot({ name: "budget-app" })).rejects.toThrow(/Browser plugin/);
});
