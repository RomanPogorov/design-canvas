import * as store from "../../sdk/store.ts";

/**
 * Lists the design canvases with links to their editors.
 * @param opts.req Incoming HTTP request.
 */
export default async function (ctx: Context, _session: Session | null, _opts: { /** Incoming HTTP request. */ req: Request }) {
    const esc = (s: string) => Bun.escapeHTML(s);
    const rows = await store.listTabs(ctx);
    const cards = rows.map((r) => `<a href="/designCanvas/t/${esc(r.id)}" class="block rounded-lg border border-base-300 p-3 hover:bg-base-200/50"><div class="font-medium">${esc(r.title)}</div><div class="text-xs text-subtle">${esc(r.id)} · ${(r.state?.order ?? []).length} artboard(s) · v${r.version}${r.draft_edits ? ` · draft: ${r.draft_edits} edit(s)` : ""} · ${esc(new Date(r.updated_at).toLocaleString())}</div></a>`).join("");
    return { title: "Design canvas", main: `<main class="mx-auto max-w-4xl p-6"><h1 class="text-lg font-semibold mb-4">Design canvases</h1><p class="text-sm text-subtle mb-4">Ask the agent to design screens: it opens a canvas with every state as an artboard (designCanvas.open) and draws them one by one.</p><div class="grid gap-2 sm:grid-cols-3">${cards || '<p class="text-subtle">No design canvases yet.</p>'}</div></main>` };
}
