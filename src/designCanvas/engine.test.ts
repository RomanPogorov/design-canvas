// The template engine and the edits by address: parse, render (data, dc-for, dc-if, dc-import), outline,
// elementOp, dataOp, alikeNotes — pure functions over an artboard's source, through ctx.fns as the agent calls them.
import { expect, test } from "bun:test";
import { testCtx } from "hyper:test";

const ctx: any = await testCtx();
const dc = ctx.fns.designCanvas;

const LIST = `<main style="display:flex;flex-direction:column;gap:8px">
  <script type="application/json" data-dc-data>{"topics":[{"title":"Rent","mine":true},{"title":"Food","mine":false}]}</script>
  <h1>Topics</h1>
  <dc-for each="topics" as="t" index="i"><article class="card"><h3>{{t.title}}</h3><dc-if test="t.mine"><span>mine</span></dc-if></article></dc-for>
</main>`;

test("parse numbers elements in preorder with offsets that slice back to the source", () => {
  const els = dc.parse({ src: `<div><p>a<br>b</p><img src="x"><ul><li>1<li>2</ul></div>` });
  expect(els.map((e: any) => e.tag)).toEqual(["div", "p", "br", "img", "ul", "li", "li"]);
  expect(els[1].parent).toBe(0);
  expect(els[0].children).toEqual([1, 3, 4]);
  expect(els[5].children).toEqual([]);
  const src = `<section><p class="x">Hi</p></section>`;
  const p = dc.parse({ src })[1];
  expect(src.slice(p.start, p.end)).toBe(`<p class="x">Hi</p>`);
});

test("render expands data, repeats, branches and holes; copies share a tid and name their data item", () => {
  const html = dc.render({ src: LIST, tids: true });
  const h3 = dc.parse({ src: LIST }).find((e: any) => e.tag === "h3").tid;
  expect(html.match(new RegExp(`<h3 data-tid="${h3}"`, "g"))).toHaveLength(2);
  expect(html).toContain('data-item="topics.0"');
  expect(html).toContain('data-item="topics.1"');
  expect(html).toContain('data-tpl="{{t.title}}" data-path="topics.1.title"');
  expect(html).toContain(">Rent</h3>");
  expect(html.match(/>mine</g)).toHaveLength(1);
  expect(html).toContain("<!--dc:for");
  const clean = dc.render({ src: LIST });
  expect(clean).not.toContain("data-tid");
  expect(clean).not.toContain("data-dc-data");
  expect(clean).not.toContain("{{");
});

test("dc-if comparisons and negation; holes are escaped and never run code", () => {
  const src = `<div><script type="application/json" data-dc-data>{"s":"done","n":3,"x":"<b>"}</script><dc-if test="s == 'done'"><i>ok</i></dc-if><dc-if test="!s"><i>no</i></dc-if><dc-if test="n != 3"><i>bad</i></dc-if><p>{{x}}{{constructor.constructor}}</p></div>`;
  const html = dc.render({ src });
  expect(html).toContain("<i>ok</i>");
  expect(html).not.toContain("no</i>");
  expect(html).not.toContain("bad");
  expect(html).toContain("<p>&lt;b&gt;</p>");
});

test("dc-import draws another artboard with props; the instance root carries the import's tid and style", () => {
  const files = { "Tab.html": `<nav style="display:flex"><script type="application/json" data-dc-data>{"active":"home"}</script><a>{{active}}</a></nav>`,
    "Home.html": `<div><dc-import src="Tab.html" active="topics" style="margin-top:8px"></dc-import><dc-import src="Nope.html"></dc-import></div>` };
  const html = dc.render({ src: files["Home.html"], files, tids: true });
  expect(html).toContain('data-import="Tab.html"');
  expect(html).toContain("<a>topics</a>");
  expect(html).toMatch(/<nav style="display:flex; margin-top:8px" data-tid="1"/);
  expect(html).toContain("Nope.html — no such artboard");
  const self = { "A.html": `<div><dc-import src="A.html"></dc-import></div>` };
  expect(dc.render({ src: self["A.html"], files: self })).toContain("imports itself");
  expect(dc.renderKey({ file: "Home.html", files })).not.toBe(dc.renderKey({ file: "Home.html", files: { ...files, "Tab.html": "<nav>x</nav>" } }));
});

test("outline lists tids, tags and own text", () => {
  const o = dc.outline({ src: `<main><h1>Welcome back</h1><button aria-label="Close"><svg><path d="M0"/></svg></button></main>` });
  expect(o).toContain('#1 h1 "Welcome back"');
  expect(o).toContain("#2 button");
  expect(o.split("\n")[1].startsWith("  #1")).toBe(true);
});

test("elementOp edits by address and keeps the rest of the source byte for byte", () => {
  const src = `<div>\n  <p style="color: red; margin: 0">One</p>\n  <p>Two</p>\n</div>`;
  const styled = dc.elementOp({ src, op: "style", tids: [1], changes: { color: "#111", padding: "4px", margin: null } });
  expect(styled.html).toBe(`<div>\n  <p style="color: #111; padding: 4px">One</p>\n  <p>Two</p>\n</div>`);
  expect(dc.elementOp({ src, op: "text", tids: [2], text: "2 < 3" }).html).toContain("<p>2 &lt; 3</p>");
  expect(dc.elementOp({ src, op: "text", tids: [2], html: `<b>Bold</b><script>x</script> <img src=x onerror=1>` }).html).toContain("<p><b>Bold</b>x </p>");
  const dup = dc.elementOp({ src, op: "duplicate", tids: [2] });
  expect(dup.html.match(/<p>Two<\/p>/g)).toHaveLength(2);
  expect(dup.select).toBe(3);
  expect(dc.elementOp({ src, op: "move", tids: [2], dir: "up" }).html.indexOf("Two")).toBeLessThan(dc.elementOp({ src, op: "move", tids: [2], dir: "up" }).html.indexOf("One"));
  expect(dc.elementOp({ src, op: "delete", tids: [1, 2] }).html).toBe(`<div>\n  \n  \n</div>`);
  expect(dc.elementOp({ src, op: "attr", tids: [2], name: "title", value: 'a "q"' }).html).toContain(`<p title="a &quot;q&quot;">`);
  expect(dc.elementOp({ src, op: "attr", tids: [2], name: "onclick", value: "x" })).toEqual({ error: "bad" });
  expect(dc.elementOp({ src, op: "wrap", tids: [2], layout: "row" }).html).toContain(`<div style="display: flex; flex-direction: row; gap: 12px"><p>Two</p></div>`);
  expect(dc.elementOp({ src, op: "move", tids: [1], dir: "up" })).toEqual({ error: "edge" });
  expect(dc.elementOp({ src, op: "text", tids: [0], text: "x" })).toEqual({ error: "children" });
  expect(dc.elementOp({ src, op: "delete", tids: [99] })).toEqual({ error: "stale" });
  expect(dc.elementOp({ src: `<p>{{t.title}}</p>`, op: "text", tids: [0], text: "x" })).toEqual({ error: "bound" });
  expect(dc.elementOp({ src: `<p>{{t.title}}</p>`, op: "text", tids: [0], text: "{{t.name}}!", template: true }).html).toBe("<p>{{t.name}}!</p>");
});

test("dataOp edits a copy's value and its list item, keeping kinds", () => {
  const set = dc.dataOp({ src: LIST, action: "set", path: "topics.1.title", value: "Groceries" });
  expect(dc.render({ src: set.html })).toContain(">Groceries</h3>");
  const flag = dc.dataOp({ src: LIST, action: "set", path: "topics.1.mine", value: "true" });
  expect(flag.html).toContain('"mine": true');
  const dup = dc.dataOp({ src: LIST, action: "duplicate", path: "topics.0" });
  expect(dup.item).toBe("topics.1");
  expect(dc.render({ src: dup.html }).match(/>Rent</g)).toHaveLength(2);
  expect(dc.dataOp({ src: LIST, action: "down", path: "topics.0" }).item).toBe("topics.1");
  expect(dc.dataOp({ src: LIST, action: "up", path: "topics.0" })).toEqual({ error: "edge" });
  expect(dc.dataOp({ src: LIST, action: "set", path: "topics.9.title", value: "x" })).toEqual({ error: "stale" });
  expect(dc.dataOp({ src: "<p>x</p>", action: "delete", path: "a.0" })).toEqual({ error: "nodata" });
  expect(dc.dataOp({ src: LIST, action: "set", path: "topics.0.title", value: "</script><b>" }).html).toContain("\\u003c/script>");
});

test("alikeNotes flags siblings of one kind written unevenly", () => {
  const src = `<ul><li style="color: red; padding: 4px">a</li><li style="color: red; padding: 4px">b</li><li style="color: blue; padding: 4px">c</li><li style="color: red; padding: 4px">d</li></ul>`;
  const notes = dc.alikeNotes({ file: "L.html", src });
  expect(notes).toHaveLength(1);
  expect(notes[0]).toContain("L.html: 4 <li>");
  expect(notes[0]).toContain("differ in color");
  expect(dc.alikeNotes({ file: "L.html", src: LIST })).toEqual([]);
});

test("the browser scripts are valid JavaScript", async () => {
  for (const f of ["$script_editor.js", "$script_picker.js"]) {
    const text = await Bun.file(new URL(`./${f}`, import.meta.url)).text();
    expect(() => new Function(text)).not.toThrow();
  }
});
