// What Speca's core keeps for a canvas tab, kept by the plugin in its own tables (schema design_canvas,
// src/designCanvas/$migration_*): the tab with its draft (state + number of edits since the last version), the saved
// versions, the journal of the draft's edits (undo of one's own change, a moment of the draft), comments pinned to
// elements, presence. The semantics follow Speca's core/runtime/canvas.ts and core/runtime/comments.ts (named per
// function); the journal keeps each edit's whole state instead of Speca's patches.
import { same } from "../speca/core/util/merge3.ts";

export type TabRow = {
    id: string; agent_id: string | null; owner_id: string | null; title: string; state: Record<string, any>;
    version: number; draft_edits: number; draft_base: Record<string, any> | null;
    proto: { itemId: number; agentId: string; title: string; designKey: string; protoKey: string } | null;
    sync_dir: "build" | "forward" | "back" | null; created_at: Date; updated_at: Date;
};
/** A saved version's head (Speca VersionHead: read without its body; stateAt gives the body). */
export type VersionRow = { tab_id: string; v: number; author: string; note: string | null; changes: Array<{ note: string | null; author: string; at: string }> | null; created_at: Date };
export type EditRow = { tab_id: string; n: number; author: string; note: string | null; body: Record<string, any>; undone_at: Date | null; dropped_at: Date | null; undo_of: number | null; created_at: Date };
export type CommentRow = { id: string; tab_id: string; author: string; author_name: string; anchor: Record<string, any>; label: string; body: string; replies: Array<{ author: string; name: string; text: string; at: string }>; sent_at: Date | null; resolved_at: Date | null; resolved_by: string | null; created_at: Date };

const JOURNAL = 200;   // edits kept in a draft's journal
const S = "design_canvas";
const sel = (ctx: Context, sql: string, params: unknown[] = []) => ctx.fns.procs.db.select({ sql, params }) as Promise<any[]>;
const js = (v: unknown) => JSON.stringify(v ?? null);
const newId = (p: string) => `${p}_${Bun.randomUUIDv7().replace(/-/g, "").slice(-14)}`;
/** The live signals of a design canvas (Speca: canvas:<session>, comments:<session>, presence:<session>). */
export const topics = (tabId: string) => ({ canvas: `canvas:${tabId}`, comments: `comments:${tabId}`, presence: `presence:${tabId}` });
const signal = (ctx: Context, topic: string) => { try { ctx.fns.procs.events.refresh({ topic, reason: "design-canvas" }); } catch { /* no stream */ } };
export const signalCanvas = (ctx: Context, tabId: string) => signal(ctx, topics(tabId).canvas);

/** The plugin's tables exist (its migration; plugin tests don't run migrations, so it is applied here, once per ctx). */
export async function ensure(ctx: Context): Promise<void> {
    const st = ((ctx.state as any).designCanvas ??= {});
    st.ready ??= (async () => {
        const has = await sel(ctx, `SELECT to_regclass('${S}.comments') AS t`);
        if (!has[0]?.t) { const m = await import("../src/designCanvas/$migration_20331110120000_design_canvas.ts"); await m.default.up(ctx); }
    })().catch((e) => { st.ready = null; throw e; });
    return st.ready;
}

export async function getTab(ctx: Context, id: string): Promise<TabRow | null> {
    if (!/^dc_[A-Za-z0-9]{1,40}$/.test(String(id))) return null;
    await ensure(ctx);
    return (await sel(ctx, `SELECT * FROM ${S}.tabs WHERE id = ?`, [id]))[0] ?? null;
}
export async function listTabs(ctx: Context, o: { agentId?: string } = {}): Promise<TabRow[]> {
    await ensure(ctx);
    return o.agentId ? sel(ctx, `SELECT * FROM ${S}.tabs WHERE agent_id = ? ORDER BY updated_at DESC`, [o.agentId]) : sel(ctx, `SELECT * FROM ${S}.tabs ORDER BY updated_at DESC LIMIT 200`);
}

/** Speca openTab: a new tab at v1 (its first version is the state it opened with). */
export async function openTab(ctx: Context, o: { agentId: string | null; ownerId: string | null; title: string; state: Record<string, any>; author: string; note?: string }): Promise<TabRow> {
    await ensure(ctx);
    const id = newId("dc");
    const row = (await sel(ctx, `INSERT INTO ${S}.tabs (id, agent_id, owner_id, title, state, version, draft_edits, draft_base) VALUES (?, ?, ?, ?, ?::jsonb, 1, 0, ?::jsonb) RETURNING *`,
        [id, o.agentId, o.ownerId, o.title.slice(0, 200), js(o.state), js(o.state)]))[0];
    await sel(ctx, `INSERT INTO ${S}.versions (tab_id, v, author, note, body) VALUES (?, 1, ?, ?, ?::jsonb)`, [id, o.author, o.note ?? "created", js(o.state)]);
    return row;
}

/** Speca writeTab with `undo: "each"` (one artboard drawn or edited = one step): the draft changes, the journal gets
 *  the edit, what was undone can no longer be redone. */
export async function writeTab(ctx: Context, tabId: string, state: Record<string, any>, author: string, note?: string, title?: string): Promise<TabRow> {
    await ensure(ctx);
    const row = await ctx.fns.procs.db.transaction({ fn: async () => {
        const cur = (await sel(ctx, `SELECT * FROM ${S}.tabs WHERE id = ? FOR UPDATE`, [tabId]))[0] as TabRow | undefined;
        if (!cur) throw new Error("no such tab");
        if (same(cur.state, state) && !title) return cur;
        await sel(ctx, `UPDATE ${S}.edits SET dropped_at = now() WHERE tab_id = ? AND undone_at IS NOT NULL AND dropped_at IS NULL`, [tabId]);
        const n = Number((await sel(ctx, `SELECT max(n) AS n FROM ${S}.edits WHERE tab_id = ?`, [tabId]))[0]?.n ?? 0) + 1;
        await sel(ctx, `INSERT INTO ${S}.edits (tab_id, n, author, note, body) VALUES (?, ?, ?, ?, ?::jsonb)`, [tabId, n, author, (note ?? "").slice(0, 300) || null, js(state)]);
        if (n > JOURNAL) await sel(ctx, `DELETE FROM ${S}.edits WHERE tab_id = ? AND n <= ? AND dropped_at IS NOT NULL`, [tabId, n - JOURNAL]);
        return (await sel(ctx, `UPDATE ${S}.tabs SET state = ?::jsonb, title = COALESCE(?, title), updated_at = now(), draft_edits = (SELECT count(*) FROM ${S}.edits WHERE tab_id = ? AND undone_at IS NULL) WHERE id = ? RETURNING *`,
            [js(state), title ?? null, tabId, tabId]))[0];
    } });
    signalCanvas(ctx, tabId);
    return row;
}

export async function versions(ctx: Context, tabId: string): Promise<VersionRow[]> {
    await ensure(ctx);
    return sel(ctx, `SELECT tab_id, v, author, note, changes, created_at FROM ${S}.versions WHERE tab_id = ? ORDER BY v`, [tabId]);
}
export async function draftEdits(ctx: Context, tabId: string): Promise<EditRow[]> {
    await ensure(ctx);
    return sel(ctx, `SELECT * FROM ${S}.edits WHERE tab_id = ? AND undone_at IS NULL AND dropped_at IS NULL ORDER BY n`, [tabId]);
}
/** A saved version (v) or the draft right after a journal edit (at); null when there is no such moment. */
export async function stateAt(ctx: Context, tabId: string, o: { v?: number | null; at?: number | null }): Promise<Record<string, any> | null> {
    await ensure(ctx);
    if (o.v) return (await sel(ctx, `SELECT body FROM ${S}.versions WHERE tab_id = ? AND v = ?`, [tabId, o.v]))[0]?.body ?? null;
    if (o.at) return (await sel(ctx, `SELECT body FROM ${S}.edits WHERE tab_id = ? AND n = ?`, [tabId, o.at]))[0]?.body ?? null;
    return null;
}

/** Speca commitTab: the draft saved as a new version (named, or listed by its changes). Nothing to save → as is. */
export async function commitTab(ctx: Context, tabId: string, author: string, message?: string | null): Promise<{ row: TabRow; committed: boolean }> {
    await ensure(ctx);
    const out = await ctx.fns.procs.db.transaction({ fn: async () => {
        const cur = (await sel(ctx, `SELECT * FROM ${S}.tabs WHERE id = ? FOR UPDATE`, [tabId]))[0] as TabRow | undefined;
        if (!cur) throw new Error("no such tab");
        if (!cur.draft_edits) return { row: cur, committed: false };
        const edits = await sel(ctx, `SELECT note, author, created_at FROM ${S}.edits WHERE tab_id = ? AND undone_at IS NULL AND dropped_at IS NULL ORDER BY n`, [tabId]);
        const changes = edits.map((e: any) => ({ note: e.note, author: e.author, at: new Date(e.created_at).toISOString() }));
        const v = cur.version + 1;
        await sel(ctx, `INSERT INTO ${S}.versions (tab_id, v, author, note, body, changes) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb)`, [tabId, v, author, (message ?? "").trim().slice(0, 200) || null, js(cur.state), js(changes)]);
        await sel(ctx, `DELETE FROM ${S}.edits WHERE tab_id = ?`, [tabId]);
        const up = (await sel(ctx, `UPDATE ${S}.tabs SET version = ?, draft_edits = 0, draft_base = state, updated_at = now() WHERE id = ? RETURNING *`, [v, tabId]))[0];
        return { row: up, committed: true };
    } });
    signalCanvas(ctx, tabId);
    return out;
}

/** Speca discardDraft: back to the last saved version; the draft's edits leave the line. */
export async function discardDraft(ctx: Context, tabId: string): Promise<TabRow | null> {
    const cur = await getTab(ctx, tabId);
    if (!cur?.draft_edits) return null;
    const base = cur.draft_base ?? (await stateAt(ctx, tabId, { v: cur.version })) ?? cur.state;
    await sel(ctx, `UPDATE ${S}.edits SET undone_at = COALESCE(undone_at, now()), dropped_at = COALESCE(dropped_at, now()) WHERE tab_id = ?`, [tabId]);
    const row = (await sel(ctx, `UPDATE ${S}.tabs SET state = ?::jsonb, draft_edits = 0, updated_at = now() WHERE id = ? RETURNING *`, [js(base), tabId]))[0];
    signalCanvas(ctx, tabId);
    return row;
}
/** Speca restoreVersion: an older version brought back into the draft (an edit of its own). */
export async function restoreVersion(ctx: Context, tabId: string, v: number, author: string): Promise<TabRow> {
    const body = await stateAt(ctx, tabId, { v });
    if (!body) throw new Error("no such version");
    return writeTab(ctx, tabId, body, author, `restored v${v}`);
}
/** Speca revertTo: the draft taken back to the moment right after edit n (the later edits kept as dropped). */
export async function revertTo(ctx: Context, tabId: string, n: number): Promise<TabRow | null> {
    const body = await stateAt(ctx, tabId, { at: n });
    if (!body) return null;
    await sel(ctx, `UPDATE ${S}.edits SET undone_at = COALESCE(undone_at, now()), dropped_at = COALESCE(dropped_at, now()) WHERE tab_id = ? AND n > ?`, [tabId, n]);
    const row = (await sel(ctx, `UPDATE ${S}.tabs SET state = ?::jsonb, updated_at = now(), draft_edits = (SELECT count(*) FROM ${S}.edits WHERE tab_id = ? AND undone_at IS NULL) WHERE id = ? RETURNING *`, [js(body), tabId, tabId]))[0];
    signalCanvas(ctx, tabId);
    return row;
}
export async function renameVersion(ctx: Context, tabId: string, v: number, name: string): Promise<boolean> {
    const r = await sel(ctx, `UPDATE ${S}.versions SET note = ? WHERE tab_id = ? AND v = ? RETURNING v`, [name.trim().slice(0, 200) || null, tabId, v]);
    if (r.length) signalCanvas(ctx, tabId);
    return r.length > 0;
}
/** Speca deleteVersions: this one, or all but this one — never the newest (the tab stands on it). */
export async function deleteVersions(ctx: Context, tabId: string, v: number, o: { others: boolean }): Promise<number[]> {
    const tab = await getTab(ctx, tabId);
    if (!tab) return [];
    const gone = o.others
        ? await sel(ctx, `DELETE FROM ${S}.versions WHERE tab_id = ? AND v <> ? AND v <> ? RETURNING v`, [tabId, v, tab.version])
        : v === tab.version ? [] : await sel(ctx, `DELETE FROM ${S}.versions WHERE tab_id = ? AND v = ? RETURNING v`, [tabId, v]);
    if (gone.length) signalCanvas(ctx, tabId);
    return gone.map((r: any) => r.v);
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function changedPaths(a: unknown, b: unknown, depth = 2, at: string[] = []): string[][] {
    if (same(a, b)) return [];
    if (depth === 0 || !isObj(a) || !isObj(b)) return [at];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => changedPaths(a[k], b[k], depth - 1, [...at, k]));
}
const getAt = (o: unknown, p: string[]) => p.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
function setAt(o: Record<string, unknown>, p: string[], v: unknown) {
    if (!p.length) return;
    let x = o;
    for (const k of p.slice(0, -1)) { if (!isObj(x[k])) x[k] = {}; x = x[k] as Record<string, unknown>; }
    if (v === undefined) delete x[p[p.length - 1]!]; else x[p[p.length - 1]!] = structuredClone(v);
}
/** Speca undoMine (its logic as is): undo — or with `redo` bring back — this person's own latest change: each place
 *  they changed goes back to how it was before them unless someone changed it after them. Never the agent's edits. */
export async function undoMine(ctx: Context, tabId: string, userId: string, redo = false): Promise<{ row: TabRow; note: string | null; skipped: number } | { none: "agent" | "nothing" | "conflict" }> {
    await ensure(ctx);
    const author = `user:${userId}`;
    const out = await ctx.fns.procs.db.transaction({ fn: async () => {
        const cur = (await sel(ctx, `SELECT * FROM ${S}.tabs WHERE id = ? FOR UPDATE`, [tabId]))[0] as TabRow | undefined;
        if (!cur) throw new Error("no such tab");
        const rows = (await sel(ctx, `SELECT * FROM ${S}.edits WHERE tab_id = ? ORDER BY n`, [tabId])) as EditRow[];
        const line = rows.filter((r) => !r.dropped_at);
        const candidates = [...line].reverse().filter((r) => r.author === author && !r.undone_at && (redo ? r.undo_of != null : r.undo_of == null));
        if (!candidates.length) return { none: !redo && line.some((r) => r.author !== author && !r.undone_at) ? "agent" as const : "nothing" as const };
        const version = cur.draft_base ?? (await sel(ctx, `SELECT body FROM ${S}.versions WHERE tab_id = ? AND v = ?`, [tabId, cur.version]))[0]?.body ?? {};
        let target: EditRow | null = null, state: Record<string, unknown> = {}, skipped = 0;
        for (const cand of candidates) {
            const before = [...line].reverse().find((r) => r.n < cand.n)?.body ?? version;
            const next = structuredClone(cur.state);
            let applied = 0, missed = 0;
            for (const p of changedPaths(before, cand.body)) {
                if (!same(getAt(next, p), getAt(cand.body, p))) { missed++; continue; }
                setAt(next, p, getAt(before, p)); applied++;
            }
            if (applied) { target = cand; state = next; skipped = missed; break; }
        }
        if (!target) return { none: "conflict" as const };
        const n = (rows[rows.length - 1]?.n ?? 0) + 1;
        const note = `${redo ? "redid" : "undid"}: ${(redo ? target.note?.replace(/^undid: /, "") : target.note) ?? ""}`.slice(0, 300);
        await sel(ctx, `INSERT INTO ${S}.edits (tab_id, n, author, note, body, undo_of) VALUES (?, ?, ?, ?, ?::jsonb, ?)`, [tabId, n, author, note, js(state), target.n]);
        await sel(ctx, `UPDATE ${S}.edits SET undone_at = now() WHERE tab_id = ? AND n = ?`, [tabId, target.n]);
        if (redo && target.undo_of != null) await sel(ctx, `UPDATE ${S}.edits SET undone_at = NULL WHERE tab_id = ? AND n = ?`, [tabId, target.undo_of]);
        const up = (await sel(ctx, `UPDATE ${S}.tabs SET state = ?::jsonb, updated_at = now(), draft_edits = (SELECT count(*) FROM ${S}.edits WHERE tab_id = ? AND undone_at IS NULL) WHERE id = ? RETURNING *`, [js(state), tabId, tabId]))[0];
        return { row: up, note: target.note, skipped };
    } });
    if ("row" in out) signalCanvas(ctx, tabId);
    return out;
}

export async function setSync(ctx: Context, tabId: string, dir: TabRow["sync_dir"]) {
    await sel(ctx, `UPDATE ${S}.tabs SET sync_dir = ? WHERE id = ?`, [dir, tabId]);
    signalCanvas(ctx, tabId);
}
export async function setProto(ctx: Context, tabId: string, proto: TabRow["proto"]) {
    await sel(ctx, `UPDATE ${S}.tabs SET proto = ?::jsonb, sync_dir = NULL WHERE id = ?`, [js(proto), tabId]);
    signalCanvas(ctx, tabId);
}

// ── comments (Speca core/runtime/comments.ts) ──
const signalComments = (ctx: Context, tabId: string) => signal(ctx, topics(tabId).comments);
export async function listComments(ctx: Context, tabId: string, o: { open?: boolean } = {}): Promise<CommentRow[]> {
    await ensure(ctx);
    return sel(ctx, `SELECT * FROM ${S}.comments WHERE tab_id = ? ${o.open ? "AND resolved_at IS NULL" : ""} ORDER BY created_at`, [tabId]);
}
export async function getComment(ctx: Context, id: string): Promise<CommentRow | null> {
    await ensure(ctx);
    return (await sel(ctx, `SELECT * FROM ${S}.comments WHERE id = ?`, [id]))[0] ?? null;
}
export async function addComment(ctx: Context, o: { tabId: string; author: string; name: string; anchor: Record<string, any>; label: string; body: string }): Promise<CommentRow> {
    await ensure(ctx);
    const row = (await sel(ctx, `INSERT INTO ${S}.comments (id, tab_id, author, author_name, anchor, label, body) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?) RETURNING *`,
        [newId("cmt"), o.tabId, o.author, o.name, js(o.anchor), o.label.slice(0, 300), o.body.slice(0, 4000)]))[0];
    signalComments(ctx, o.tabId);
    return row;
}
export async function replyComment(ctx: Context, c: CommentRow, r: { author: string; name: string; text: string }) {
    await sel(ctx, `UPDATE ${S}.comments SET replies = replies || ?::jsonb WHERE id = ?`, [js([{ ...r, text: r.text.slice(0, 4000), at: new Date().toISOString() }]), c.id]);
    signalComments(ctx, c.tab_id);
}
export async function resolveComment(ctx: Context, c: CommentRow, by: string, resolved = true) {
    await sel(ctx, `UPDATE ${S}.comments SET resolved_at = ${resolved ? "now()" : "NULL"}, resolved_by = ? WHERE id = ?`, [resolved ? by : null, c.id]);
    signalComments(ctx, c.tab_id);
}
export async function resolveAll(ctx: Context, tabId: string, by: string): Promise<number> {
    const r = await sel(ctx, `UPDATE ${S}.comments SET resolved_at = now(), resolved_by = ? WHERE tab_id = ? AND resolved_at IS NULL RETURNING id`, [by, tabId]);
    if (r.length) signalComments(ctx, tabId);
    return r.length;
}
export async function removeComment(ctx: Context, c: CommentRow) {
    await sel(ctx, `DELETE FROM ${S}.comments WHERE id = ?`, [c.id]);
    signalComments(ctx, c.tab_id);
}
export async function removeComments(ctx: Context, tabId: string, author: string, ids: string[] | null): Promise<number> {
    const r = ids
        ? await sel(ctx, `DELETE FROM ${S}.comments WHERE tab_id = ? AND author = ? AND id = ANY(?::text[]) RETURNING id`, [tabId, author, `{${ids.map((x) => x.replace(/[^\w-]/g, "")).join(",")}}`])
        : await sel(ctx, `DELETE FROM ${S}.comments WHERE tab_id = ? AND author = ? RETURNING id`, [tabId, author]);
    if (r.length) signalComments(ctx, tabId);
    return r.length;
}
/** Speca's SENT: a comment sent to the agent leaves the pins (it stays under "show resolved", marked sent). */
export async function markSent(ctx: Context, tabId: string, ids: string[], by: string) {
    if (!ids.length) return;
    await sel(ctx, `UPDATE ${S}.comments SET sent_at = now(), resolved_at = COALESCE(resolved_at, now()), resolved_by = COALESCE(resolved_by, ?) WHERE id = ANY(?::text[])`, [by, `{${ids.join(",")}}`]);
    signalComments(ctx, tabId);
}
/** Speca whereOf: what a comment is pinned to, for the agent. */
export const whereOf = (c: CommentRow) => `${c.label}${c.anchor.text && !c.label.includes(String(c.anchor.text).slice(0, 20)) ? ` — "${String(c.anchor.text).slice(0, 120)}"` : ""}`;
/** Speca commentsText: the open comments of a tab for the agent, each with what it is pinned to. */
export function commentsText(rows: CommentRow[]): string {
    if (!rows.length) return "No open comments on this tab.";
    return rows.map((c) => `- ${c.id} by ${c.author_name}${c.sent_at ? " (sent to you)" : ""}${c.resolved_at ? " (resolved)" : ""}: "${c.body}"\n  on: ${c.label || "the tab"}${c.anchor.text ? `\n  element text: "${String(c.anchor.text).slice(0, 200)}"` : ""}${c.anchor.design ? `\n  element: ${c.anchor.path} (an artboard address: designCanvas.read({ tabId, file }) shows the element by its tid)` : ""}${c.replies?.length ? `\n  replies:\n${c.replies.map((r) => `    ${r.name}: ${r.text}`).join("\n")}` : ""}`).join("\n");
}

// ── presence (Speca api.canvas.presence: ephemeral, half a minute, announced as presence:<tab>) ──
type Peer = { userId: string; name: string; state: Record<string, unknown>; at: number };
export function presence(ctx: Context, tabId: string, me: { id: string; name: string }, state?: Record<string, unknown> | null): Peer[] {
    const all: Record<string, Map<string, Peer>> = ((ctx.state as any).designCanvas ??= {}).presence ??= {};
    const m = (all[tabId] ??= new Map());
    const now = Date.now();
    for (const [k, p] of m) if (now - p.at > 30_000) m.delete(k);
    if (state !== undefined) {
        if (state === null) m.delete(me.id); else m.set(me.id, { userId: me.id, name: me.name, state, at: now });
        signal(ctx, topics(tabId).presence);
    }
    return [...m.values()].filter((p) => p.userId !== me.id);
}
