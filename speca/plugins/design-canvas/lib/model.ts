// The design canvas model: an index of artboards (where each one sits, its size and title, row titles) and one HTML
// file per artboard. Every element of an artboard has an address: its tid — the preorder index of the element in the
// file — plus the path of child indexes; "File.html#tid:path". The same address is used by the selection, by "this
// element" in chat and by the agent's edits.
import { z } from "speca/sdk";

export const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;
const SHEET = /^[\w-]{1,40}$/;
export const boardSchema = z.object({ x: z.number(), y: z.number(), w: z.number().min(40).max(4000), h: z.number().min(40).max(20000), title: z.string().max(120), page: z.boolean().optional(),
  /** the page (sheet) of the canvas it is on; none: the first */
  sheet: z.string().regex(SHEET).optional(),
  /** planned, not drawn yet: the canvas shows its frame waiting (the agent draws boards one by one) */
  pending: z.boolean().optional() }).strict();
export const noteSchema = z.object({ kind: z.enum(["title", "sticky"]), text: z.string().max(2000), x: z.number(), y: z.number(), w: z.number().optional(), sheet: z.string().regex(SHEET).optional() }).strict();
/** The pages of a canvas (several sets of artboards, each on its own camera); none: one page. */
export const sheetSchema = z.object({ id: z.string().regex(SHEET), title: z.string().max(80) }).strict();
const reply = z.object({ by: z.string(), byName: z.string().max(120), text: z.string().max(4000), at: z.string() }).strict();
/** A comment pinned to an element: its address (tid + path), the text it had (to find it again when tids moved) and
 *  where on it (fx, fy: 0..1); without an element (tid -1) it is pinned to the artboard at fx, fy. */
export const commentSchema = z.object({
  file: z.string().regex(FILE), tid: z.number().int().min(-1), path: z.string().max(200), fp: z.string().max(80), fx: z.number().min(0).max(1), fy: z.number().min(0).max(1),
  px: z.number().optional(), py: z.number().optional(), label: z.string().max(240), text: z.string().max(4000), by: z.string(), byName: z.string().max(120), at: z.string(), resolved: z.boolean().optional(), replies: z.array(reply).max(100).optional(),
}).strict();
export const stateSchema = z.object({
  title: z.string().max(200).optional(),
  order: z.array(z.string()).max(1000),
  boards: z.record(z.string(), boardSchema),
  notes: z.record(z.string(), noteSchema).optional(),
  files: z.record(z.string(), z.string().max(400_000)),
  comments: z.record(z.string(), commentSchema).optional(),
  sheets: z.array(sheetSchema).max(50).optional(),
}).strict();
/** The version of an artboard file the frame was served from; edits name it so a stale view never writes. */
export const version = (src: string) => Bun.hash(src).toString(36);

export type DesignState = z.infer<typeof stateSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Comment = z.infer<typeof commentSchema>;

// Claude Design's grid: 80 between boards, 120 between rows; a row title (72px) sits 300 above its row, as wide as the row.
export const GAP_X = 80, GAP_Y = 120, TITLE_ABOVE = 300;

/** Lay rows out on the canvas grid: boards 80px apart, rows 120px apart, the row title above each row. */
export function layoutRows(rows: Array<{ title?: string; boards: Array<{ file: string; w: number; h: number; title: string; page?: boolean }> }>): Pick<DesignState, "order" | "boards" | "notes"> {
  const boards: DesignState["boards"] = {};
  const notes: NonNullable<DesignState["notes"]> = {};
  const order: string[] = [];
  let y = 0;
  rows.forEach((row, i) => {
    const width = row.boards.reduce((w, b) => w + b.w, 0) + GAP_X * Math.max(0, row.boards.length - 1);
    if (row.title) { notes[`row${i + 1}`] = { kind: "title", text: row.title, x: 0, y, w: Math.max(width, 390) }; y += TITLE_ABOVE; }
    let x = 0, hmax = 0;
    for (const b of row.boards) { boards[b.file] = { x, y, w: b.w, h: b.h, title: b.title, ...(b.page ? { page: true } : {}) }; order.push(b.file); x += b.w + GAP_X; hmax = Math.max(hmax, b.h); }
    y += hmax + GAP_Y;
  });
  return { order, boards, notes };
}

/** The canvas's pages, in order (one unnamed page when it has none). */
export function sheetsOf(s: Pick<DesignState, "sheets">): Array<{ id: string; title: string }> {
  return s.sheets?.length ? s.sheets : [{ id: "main", title: "" }];
}
/** The page a board or note is on. */
export const sheetOf = (s: Pick<DesignState, "sheets">, x: { sheet?: string }) => (x.sheet && sheetsOf(s).some((p) => p.id === x.sheet) ? x.sheet : sheetsOf(s)[0]!.id);

/** Where a new board goes: to the right of the last row (of its page). */
export function placeNew(s: DesignState, w: number, h: number, sheet?: string): { x: number; y: number } {
  const all = Object.values(s.boards).filter((b) => !sheet || sheetOf(s, b) === sheet);
  if (!all.length) return { x: 0, y: 0 };
  const lastY = Math.max(...all.map((b) => b.y));
  const row = all.filter((b) => b.y === lastY);
  const right = Math.max(...row.map((b) => b.x + b.w));
  return { x: right + GAP_X, y: lastY };
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** A readable outline of a file for the agent: tid, tag and the first words of each text-bearing element. */
export async function outline(html: string): Promise<string> {
  type Node = { tid: number; tag: string; text: string; depth: number };
  const all: Node[] = [];
  const stack: Node[] = [];
  let n = 0;
  await new HTMLRewriter()
    .on("*", {
      element(el) {
        const node: Node = { tid: n++, tag: el.tagName, text: "", depth: stack.length };
        all.push(node);
        // void and self-closing tags (an svg <path/>) have no end tag: asking for one throws
        if (VOID.has(el.tagName) || el.selfClosing || !el.canHaveContent) return;
        stack.push(node);
        el.onEndTag(() => { stack.pop(); });
      },
    })
    .onDocument({ text(t) { const top = stack[stack.length - 1]; if (top && top.text.length < 48) top.text += t.text.replace(/\s+/g, " "); } })
    .transform(new Response(html)).text();
  return all.slice(0, 400).map((c) => `${"  ".repeat(Math.min(c.depth, 8))}#${c.tid} ${c.tag}${c.text.trim() ? ` "${c.text.trim().slice(0, 40)}"` : ""}`).join("\n");
}

export function emptyState(title?: string): DesignState {
  return { title, order: [], boards: {}, notes: {}, files: {} };
}
