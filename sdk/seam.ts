// THE SEAM — the only difference between Speca's design-canvas client and what Hyper serves of it.
//
// Speca's files (../speca, copied verbatim) name Speca's addresses: the plugin's own routes under /p/design-canvas/,
// the core's canvas endpoints under /canvas/:tab/… and /canvas/comments/:id/…, the design library's thumbnails under
// /design/thumb/ and the app's stylesheets and fonts under /assets/. Hyper answers the same requests at the plugin's
// addresses. The files stay byte-identical; these literal replacements are applied when they are served (assets, CSS)
// or rendered (the canvas markup). seam.test.ts checks that each one still finds what it replaces, so an update of
// the copy from Speca that moves an address fails loudly instead of quietly calling Speca's paths.
export const BASE = "/designCanvas";
export const REPLACE: ReadonlyArray<readonly [string, string]> = [
    ["/p/design-canvas/", `${BASE}/p/`],          // the plugin's routes and assets
    ["/canvas/comments/", `${BASE}/cm/`],         // a comment's thread: reply, resolve, remove, send
    ["`/canvas/${tab}", `\`${BASE}/c/\${tab}`],   // the core's endpoints of a tab: comments, work, undo/redo
    ["/design/thumb/", `${BASE}/thumb/`],         // an artboard's preview while its frame sleeps
    ["/assets/vendor/", `${BASE}/web/vendor/`],   // Speca's vendored basecoat, htmx, fonts
    ["/assets/css/", `${BASE}/web/css/`],         // Speca's app.css, product.css
];
/** Speca's text with its addresses turned into the plugin's. */
export function seam(text: string): string {
    for (const [a, b] of REPLACE) text = text.split(a).join(b);
    return text;
}
