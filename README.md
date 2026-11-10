# design-canvas — Speca's Design canvas as a Hyper plugin

The same editor the person uses in Speca, not a rewrite: Speca's design-canvas plugin is carried over **verbatim**
(`speca/`), and the plugin makes Hyper answer it the way Speca's core does.

```text
speca/                          Speca's files, byte-identical (script/sync-from-speca.sh; seam.test.ts checks it)
  plugins/design-canvas/**      the whole plugin: assets/ (dcv.js, panel.js, picker.js, dcv-*.js, dck.*, kit.js, dcc.js,
                                dcv.css), lib/, board.canvas.ts, *.route.ts, *.tool.ts, design.prompt.md, COMPONENTS.md
  core/web/{html,sandbox,fmt}.ts, core/web/ui/{icons,kit}.ts, core/util/merge3.ts, core/i18n/*   (pure core helpers)
  web/assets/css/{app,product}.css, web/assets/vendor/{basecoat.css,basecoat.js,htmx.js,fonts/}    (the look)
  tsconfig.json                 ours: "speca/sdk" → ../sdk/index.ts (Speca resolves it the same way)
sdk/                            the stand-in for Speca's core
  index.ts      "speca/sdk": z (zod 4), html/ic/sandbox/merge from the copied core files, define* identities
  api.ts        PluginApi: canvas.view/write/open/show/stateAt/presence/comments… over the store
  store.ts      tabs with their draft, versions, the journal (undo of one's own change), comments, presence
  chrome.ts     the tab as Speca's core draws it: «Черновик · N правок» chip, history drawer, banners, compare,
                prototype buttons, journal; the page the canvas tab frames
  http.ts       Speca's plugin routes run as they are; Speca's /canvas/:tab/… endpoints; messages to the agent
  agent.ts      Speca's tools run as the agent; the prototype link
  shot.ts thumbs.ts   screenshots and artboard previews in a headless Chrome
  host.js       the page glue Speca's page scripts give a canvas tab: toasts, live regions over Hyper's event stream,
                the history drawer, dialogs, window.dhCompose → Hyper's chat composer
  seam.ts       THE SEAM (below)
src/designCanvas/   Hyper's files: $route_* (one line each → sdk), $migration_*, $canvas_board.ts, page.ts (@view),
                    designCanvas.* functions, $setting_locale.ts, tests
```

## The seam

The only change to what Speca's client does: its addresses. `sdk/seam.ts` replaces, when serving assets and rendering
the canvas markup, `/p/design-canvas/` → `/designCanvas/p/`, `/canvas/comments/` → `/designCanvas/cm/`,
`` `/canvas/${tab} `` → `` `/designCanvas/c/${tab} ``, `/design/thumb/` → `/designCanvas/thumb/`, `/assets/vendor/` and
`/assets/css/` → `/designCanvas/web/…`. The files on disk stay byte-identical; `seam.test.ts` fails if a replaced
address moves in a later Speca.

## What stands in for Speca's core

| Speca core | here |
|---|---|
| canvas_tabs + draft_edits, canvas_versions, canvas_edits (journal), canvas_comments | `design_canvas.tabs / versions / edits / comments` (migration 20331110120000) |
| commit, restore, discard, revert, rename/delete versions, undoMine/redo | sdk/store.ts (same semantics; whole states in the journal instead of patches) |
| tabBody's version chip, history drawer, banners, compare, journal | sdk/chrome.ts (Speca's markup, Speca's CSS) |
| comment → message to the agent, «Собрать прототип» → message as the person | `agent.acceptMessage` into the design's chat |
| live topics canvas:/comments:/presence:<session> | `procs.events.refresh` on canvas:/comments:/presence:<tabId>, `/procs/events` SSE |
| design library thumbnails | sdk/thumbs.ts (headless Chrome, in memory) |
| prototype: html tab with `from` | Hyper html canvas tab opened by designCanvas.prototype, link kept on the design |
| canvas_screenshot | designCanvas.screenshot (headless Chrome) |

## Install, test

```bash
cd ~/.hyper/plugins && bun add github:RomanPogorov/design-canvas#v0.2.0
TEST_DATABASE_URL=postgres://… bun <hyper-code>/script/plugin-test.ts .
```

Needs Chrome/Chromium on the Hyper machine (CHROME_PATH) for previews and screenshots; without it the canvas works and
the far-away artboards show their names.

## Not carried over (Hyper lacks the piece)

- Speca's design library (cards of artboards across canvases, `library` in board.canvas.ts) and branch `merge` — Hyper
  has no library or chat branches.
- `/canvas/:tab/work` from the agent's live activity: Hyper exposes no per-tab activity, so the canvas shows the
  artboard the agent wrote last for 20 s.
- Sharing a canvas between chats/people with roles (`shared`, `canAct` per person): every signed-in person may edit.
- `/files/<id>` pictures inlined into artboards (`inlineFiles`, `keepImages`) and `/canvas-libs/` libraries: Hyper has
  neither; links stay as written.
- Prototype "bring changes back into the design" (`sinceSync` diff of an html tab): Hyper's html tabs have no versions.
