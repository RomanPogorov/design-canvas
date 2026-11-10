---
name: design-canvas
description: Speca's Design canvas in Hyper — design screens, apps, flows, landings and slides as HTML artboards on an infinite canvas, every state its own artboard in rows by flow; the person selects, restyles, comments and saves versions in Speca's own editor, the agent plans, draws and edits through designCanvas functions.
---

# Design canvas

The same editor as in Speca (its client is carried over verbatim): the floating selection bar with the breadcrumb, «Такие
же: N» (alike elements: a style edit restyles them all) and «Спросить агента» (puts the element's address into the chat),
the properties panel (Layers, «Данные строки» of a repeat's row, Size, Layout, Text, View…), comments pinned to elements
that go to you, stickies, row titles, pages, presence, copy/paste of artboards, export, preview, in-place text editing,
undo, the draft «Черновик · N правок» with named versions (look, compare, restore) and «Собрать прототип».

Functions are `ctx.fns.designCanvas.*` — Speca's design-canvas tools under Hyper's names:

| Speca | Hyper |
|---|---|
| design-canvas_open | `designCanvas.open({ title, rows })` → `{ tabId }` (opens the canvas tab beside the chat) |
| design-canvas_write | `designCanvas.write({ tabId, file, html, title?, w?, h?, page?, sheet?, x?, y? })` |
| design-canvas_edit | `designCanvas.edit({ tabId, file, edits: [{ old, new, all? }] })` |
| design-canvas_read | `designCanvas.read({ tabId, file? })` (also: what the person changed by hand since you last looked) |
| design-canvas_layout | `designCanvas.layout({ tabId, ops })` |
| canvas_comments | `designCanvas.comments({ tabId, all? })`; `designCanvas.resolveComment({ commentId, reply? })`, `designCanvas.replyComment({ commentId, text })` |
| canvas_commit | `designCanvas.commit({ tabId, name? })`; `designCanvas.versions({ tabId })` |
| canvas_screenshot | `designCanvas.screenshot({ tabId, part? })` → `{ path }` of a PNG — look at it |
| canvas_show focus | `designCanvas.show({ tabId, focus? })` |
| canvas_open {kind: html, from} | `designCanvas.prototype({ tabId, html, title? })` |
| canvas_list | `designCanvas.list({ all? })` |

## How to work (Speca's design prompt)

When the person asks to design screens, an app, a flow, a landing, slides — or a design search is clearly ahead — do
not start with one HTML page: open a design canvas and put every state on its own artboard (empty, loading, filled,
error, success; each step of a flow), in rows by flow with a row title above each row and numbered titles ("01
Welcome", "02 Sign in", "02b Sign in — error"). Separate sets the person thinks of apart (the app and its admin, a new
flow next to the old one, variants to compare) go on pages of the same canvas: `sheet` (a page's title) in
designCanvas.write, `toSheet` in designCanvas.layout.

Order of work: open the canvas with the plan first — designCanvas.open with every artboard's file, title and size, no
html — so the person sees all frames at once, waiting; then draw them one by one with designCanvas.write in the plan's
order (one artboard per call; each appears as soon as it is written). Never put many artboards' html into one call.

Look at what you drew: designCanvas.screenshot shows a page of the canvas whole, one artboard (part "File.html") or one
element ("File.html#12"). Check your artboards with it before you say they are done.

Hypotheses: before trying another direction, save what is there as a named version (designCanvas.commit, e.g. "Bottom
tabs, cards"), then change it; the person compares versions side by side and brings one back. Ordinary edits need no
commit — they stay in the draft, which the person sees and can undo.

Artboard file rules (each keeps the editor working):
- The file is the artboard's markup only: one root element (the board's size goes in w/h — phone 390×844, desktop
  1440×900, slide 1280×720) or a page root (page: true; max-width container, fluid widths).
- The layout is fluid: the root fills the artboard (no width/height in px on it); columns and blocks in %, fr,
  flex/grid with gap, max-width and clamp() — px only for small things.
- Every visible element is literal markup — no script-built DOM. Text people will retype is literal text.
- Inline styles. Things of one kind (every card title, every primary button) get the same tag, class and style, written
  identically: the person edits them as one. Groups are display:flex or grid with gap (grids: repeat(N, minmax(0,1fr))).
- Real tags: button, a, input with label, h1–h3, p, ul/li; aria-label on icon buttons; contrast 4.5:1; targets 44px.
- No network: system font stacks, inline SVG icons (stroke, currentColor), no emoji. Pictures as data: URLs or links
  the person's browser can load.
- No filler: real content from the brief; a missing fact is a visible placeholder like [PRICE].
- Lists of like items: the items go into the file's data — one `<script type="application/json" data-dc-data>{"topics":[…]}</script>`
  — and one template repeats them: `<dc-for each="topics" as="t" index="i">…{{t.title}}…</dc-for>`; variants with
  `<dc-if test="t.mine">` / `test="!t.mine"` / `test="t.status == 'done'"`. Holes: `{{path}}` only.
- Parts shared by screens: draw it once as its own artboard (a "Components" row) and place it with
  `<dc-import src="TabBar.html" active="topics"></dc-import>`; its attributes fill `{{holes}}` in the component.
- Link the flow: a control that leads to another screen is `<a href="02-sign-in.html">`; the person checks it with
  Preview on the canvas. That is not a prototype.

Editing: the person points at an element as `[Board › tag «text»](File.html#tid:path)` — in the chat, put there by
«Спросить агента». Read that file with designCanvas.read (its outline lists tids), change it with designCanvas.edit
(exact snippets); redraw with designCanvas.write only when most of it changes. The person also edits by hand:
designCanvas.read says so — re-read before changing a board and keep what they changed. Their comments come to you as
chat messages (with the element's address) or wait in designCanvas.comments; when you have acted on one, resolve it
(designCanvas.resolveComment, with a short reply if useful).

Prototype: when the person asks for one or presses «Собрать прототип» (you get their message with instructions), it is
a separate html canvas tab linked to the design — never links on the design canvas. Build it with
designCanvas.prototype({ tabId, html, title }): one self-contained page with every screen (same look, same copy), the
flow's links and controls working. Start with the shell and the first screen, then call it again as you fill the others.
«Обновить прототип» appears on the design when its artboards change after that; bring the change over the same way.

## Safety

Artboards run in sandboxed frames (opaque origin, CSP without network). The person's edits go through CSRF-checked
routes; undo takes back only the person's own changes, never yours.
