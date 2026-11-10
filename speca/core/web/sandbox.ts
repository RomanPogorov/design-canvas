// The one sandbox for pages the agent writes (an HTML canvas, a design canvas's artboards, their previews and
// comparisons). The boundary is the opaque origin and the lack of network: the page can't read the app, its cookies or
// anything of the person's, and can't send anything anywhere. Inside that boundary a page should work like any web
// app — scripts, inline handlers, forms, alert/confirm, storage, eval for libraries — so a prototype the agent builds
// never breaks on the sandbox itself. Every frame uses these three pieces; a new place that shows such a page too.
import { raw, type Raw } from "./html.ts";

/** The iframe's attributes. allow-forms lets the submit event fire (the shim below keeps the page from navigating). */
export const SANDBOX_FLAGS = "allow-scripts allow-forms allow-modals";
export const sandboxAttrs = (): Raw => raw(`sandbox="${SANDBOX_FLAGS}" allow="clipboard-write" referrerpolicy="no-referrer"`);

/** The page's headers' policy: its own code (nonce'd scripts, inline handlers, eval) and installed canvas libraries;
 *  no network, no navigation out. */
export function sandboxCsp(nonce: string, origin: string): string {
  const libs = `${origin}/canvas-libs/`;
  return [
    `sandbox ${SANDBOX_FLAGS}`, "default-src 'none'", "base-uri 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${libs}`, "script-src-attr 'unsafe-inline'",
    `style-src 'unsafe-inline' ${libs}`, `font-src data: ${libs}`, `img-src data: blob: ${libs}`, "media-src data: blob:", "worker-src blob:",
    "connect-src 'none'", "form-action 'none'", "frame-ancestors 'self'",
  ].join("; ");
}

/** First script of the page: what an opaque origin lacks, made to work in memory, and what can't work said out loud
 *  (console errors reach the agent through canvas_screenshot). */
export function sandboxShim(nonce: string): string {
  return `<script nonce="${nonce}">(() => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: (k) => { m.delete(String(k)); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  for (const name of ["localStorage", "sessionStorage"]) { let ok = false; try { ok = !!window[name]; } catch {} if (!ok) try { Object.defineProperty(window, name, { value: mem(), configurable: true }); } catch {} }
  try { void document.cookie; } catch { const jar = new Map(); try { Object.defineProperty(document, "cookie", { configurable: true, get: () => [...jar].map(([k, v]) => k + "=" + v).join("; "), set: (s) => { const [kv] = String(s).split(";"); const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } }); } catch {} }
  window.open = (url) => { console.error("[canvas] window.open is not available in a canvas page" + (url ? ": " + url : "")); return null; };
  // the app's own keys (⌘J quick chat, ⌘1–6 views, Esc) never reach the app from inside a frame: pass them on
  addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const app = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (k === "j" || /^[1-6]$/.test(k));
    if (app) e.preventDefault();
    if (app || (k === "Escape" && !e.defaultPrevented)) try { top.postMessage({ dhKey: k }, "*"); } catch {}
  });
  // runs after the page's own handlers: what they left alone would leave the page — keep it here
  addEventListener("submit", (e) => { if (!e.defaultPrevented) e.preventDefault(); });
  addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]"); if (!a || e.defaultPrevented) return;
    const h = a.getAttribute("href") || ""; if (!h || h[0] === "#") return;
    e.preventDefault();
    // href="javascript:…" runs as code (a navigation to it would be refused)
    if (/^javascript:/i.test(h)) { try { new Function(decodeURIComponent(h.slice(11))).call(a); } catch (err) { console.error(err); } return; }
    console.error("[canvas] links do not leave a canvas page: " + h);
  });
})();</script>`;
}
