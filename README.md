# design-canvas — a Hyper plugin

An infinite canvas of HTML artboards for designing screens and their states. Every state is its own artboard, laid
out in rows by flow, on pages; lists are data + templates (`<dc-for>`, `<dc-if>`), shared parts are components
(`<dc-import>`). The person selects any element, edits its text in place, restyles it, pins comments, adds stickies,
previews the flow and saves versions; the agent plans, draws and edits the same canvas through plain
`ctx.fns.designCanvas.*` functions (Hyper agents call them from `eval`). A port of Speca's Design canvas plugin.


## What is in it

```text
package.json         procs { src, label, icon, description, configuration }
SKILL.md             the agent's guide: order of work, artboard file rules, functions
src/designCanvas/
  open.ts write.ts edit.ts read.ts layout.ts          the agent's API
  commit.ts versions.ts version.ts restore.ts         named versions (.versions/NNNN.json)
  list.ts screenshot.ts exportHtml.ts page.ts         canvases, PNG check, hand-off HTML, the @view
  parse.ts render.ts outline.ts renderKey.ts          the template engine (tids, data, repeats, components)
  elementOp.ts dataOp.ts alikeNotes.ts                edits by address, data edits, "one kind" lint
  load.ts save.ts dir.ts paths.ts placeNew.ts findSheet.ts clientState.ts
  boardPage.ts editorPage.ts overviewHtml.ts          the frame of an artboard, the editor shell, a still page
  $canvas_board.ts                                    canvas kind designCanvas.board (alias of the view designCanvas.page)
  $route_*.ts                                         /designCanvas, /designCanvas/:name (editor), …/state, …/board/:file,
                                                      …/edit, …/layout, …/versions, …/export
  $script_editor.js $script_editor.css                the editor app (served at /designCanvas/editor.js|css)
  $script_picker.js                                   the in-frame picker (inlined into each artboard frame)
  $setting_root.ts  $app_designCanvas.json            designs directory; the Pages entry
  Board.ts Note.ts Comment.ts Canvas.ts Element.ts    types.designCanvas.*
  *.test.ts                                           engine, agent API, routes + view
```

Storage is files, like Excalidraw's: `<root>/<name>/canvas.json` + one `<File>.html` per artboard + `.versions/`.
Root is the setting `designCanvas.root` (env `DESIGN_CANVAS_ROOT`, default `designs` in the project; `~/` = home).
No tables, so no migrations.

How it runs: the canvas tab frames the plugin's editor page (`/designCanvas/<name>`, a same-origin app with no
CDN). Each artboard is a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin; CSP `default-src 'none'`, inline
code, pictures by URL) of `/designCanvas/<name>/board/<File>.html`: the file rendered with every element marked by its
tid, plus the picker, which reports the element under the pointer to the editor by `postMessage`. Every edit is a
splice of the agent's source by address (no re-serialisation), written with the file's version so a stale view never
overwrites (409). The editor polls `…/state` every 2 s, so the agent's writes appear as they happen.

## Install

Into the plugin host (`PLUGIN_HOST`, e.g. `~/.hyper/plugins`):

```bash
cd ~/.hyper/plugins && bun add github:<owner>/design-canvas#v0.1.0
```

or from the catalog once a listing has it: `plugins.install({ name: "design-canvas" })` (preview, then confirm with
the digest), or the Catalog tab on `/plugins/listing`.

Listing entry — `hyper-code-harness/plugins/plugins/design-canvas.json` (or the same file in a team listing):

```json
{
  "name": "design-canvas",
  "label": "Design canvas",
  "icon": "ph-pen-nib",
  "description": "An infinite canvas of HTML artboards for designing screens and their states in rows by flow: pages, data templates, components, comments, stickies, in-place text editing and named versions; the agent plans, draws and edits artboards through designCanvas functions.",
  "source": "github:<owner>/design-canvas"
}
```

Optional: the Browser plugin (for `designCanvas.screenshot`). It is used when present, not required.

## Develop and test

```bash
TEST_DATABASE_URL=postgres://… bun <hyper-code>/script/plugin-test.ts .
```

Tests use `import { testCtx } from "hyper:test"` and a throwaway designs directory; Hyper's test Postgres is needed by
`testCtx` itself (the plugin has no tables). 24 tests in 3 files: the engine (parse, render, outline, elementOp, dataOp,
alikeNotes, script syntax), the agent API end to end (open → write → read → edit → layout → comments → versions →
export, paths confinement), and the routes (editor page, assets via Hyper's script loader, artboard frame + CSP, the
person's edits with CSRF/409/undo, layout and versions from the editor, the canvas kind and `/rpc/designCanvas.page`).

Mount check (done for v0.1.0): a throwaway Hyper (own copy, own HOME/WORKDIR/port, own Postgres, a plugin host
linking this folder), a canvas drawn through the REPL with `designCanvas.*`, then a headless Chrome over CDP: frames
load, a click inside an artboard selects `01-home.html#4` in the panel, a double-click edits the text in place and it is
saved as the data value (`data set spent`), Preview opens, `/rpc/designCanvas.page` frames the editor; no console
errors. Pictures: `.shots/editor.png`, `editor-selected.png`, `preview.png`, `hyper-view.png`.

## Release

A release is a semver tag equal to `version` in package.json:

```bash
# bump "version" in package.json, then
git commit -am "v0.2.0" && git tag v0.2.0 && git push && git push --tags
```

Listings carry no version: installs find releases from the tags.

## Ported from Speca, and what was dropped

Kept: artboards in rows by flow with row titles; pages (sheets); planned artboards waiting to be drawn; data templates
(`data-dc-data`, `dc-for`, `dc-if`, holes); components (`dc-import` with props, self-import guard); select (one, Shift
for more, all copies of a repeat ringed), select parent, edit text in place (inline b/i/u/a kept; a one-hole text edits
its data value; a template text edits the template); a properties panel (12 style fields, link/image/placeholder/label
attributes, move up/down, duplicate, delete, wrap in stack/row, ungroup; data-item up/down/duplicate/delete for a
repeat copy); artboards move/resize/rename/duplicate/delete/move to page; stickies and row titles (add, drag, edit,
delete); comments pinned to elements with replies and resolve; undo (⌘Z) of the person's edits and moves; Preview with
links between artboards; named versions (save, list, restore, read, export); export of all artboards as one HTML page;
the agent's open/write/edit/read/layout with Speca's semantics (all-or-nothing edits, "alike elements" notes,
placement rules); screenshot of a page, an artboard or one element.

Dropped as Speca-only couplings: the Speca SDK (`defineTool`, `defineCanvas`, zod schemas, `api.canvas.*`) — replaced
by Hyper functions with JSDoc, routes and a canvas kind; the i18n catalogs (`lib/strings.ts`, en/ru) — the UI is in
English; Speca's canvas draft/journal and versions — replaced by `.versions/` and a client undo stack; Speca's core
comment store — comments live in `canvas.json`; `keepImages` (photos by link copied into the person's files) — links
stay links; the design-system kit (`dck.*`) and its catalogue route.

Not ported in 0.1.0 (Speca features beyond the brief): presence (other people's cursors and selections, the agent's
"drawing now" follow mode), branch merge per artboard, the visual version compare (side by side / swipe with a list of
text/style changes), linked prototypes ("Build / Update prototype"), the design library cards and thumbnails, copy and
paste of elements and artboards between canvases, make-component / detach, make-repeat from hand-written copies, the
layers tree, z-order, grouping several siblings, marquee selection, waking only the frames near the viewport (every
frame of the shown page is live).

## Limits

- **Live updates are polled.** The editor asks `…/state` every 2 s. Pushing changes into a framed app would need a
  core hook (a framed page subscribing to `procs.events` topics); not changed here.
- **The agent does not see the person's selection.** Speca puts "this element" into the chat; Hyper has no channel
  from a canvas frame into the agent's context, so the person uses **Copy ref** and pastes the address. A core hook
  for canvas-tab selection would be needed.
- **Screenshots need the Browser plugin** (`cdp.send`, Hyper's Chrome). Without it `designCanvas.screenshot` throws
  and says so. The page is drawn into a blank tab (`Page.setDocumentContent`), so it needs no sign-in.
- **Access is the instance's.** Like Excalidraw, any signed-in person may open and edit any canvas; writes need the
  session's CSRF token. Per-canvas sharing would need core support.
- **Pictures load by URL** into artboards (CSP allows `img-src *`); scripts, fonts and fetches from the network are blocked.
- Artboard files up to 400 KB each; the plugin itself is far under the catalog limits (2 MB per file, 20 MB / 2000
  files); no install scripts, no npm dependencies.
