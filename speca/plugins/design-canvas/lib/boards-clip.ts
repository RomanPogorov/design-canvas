// Artboards through the clipboard: whole boards copied from one design canvas (their files, sizes, titles and places
// relative to each other, with the component boards they import) and pasted into another one — another chat's too.
// The pasted boards keep their links to each other and to their components when a name had to change.
import { z } from "speca/sdk";
import { FILE, GAP_X, GAP_Y, placeNew, sheetOf, type DesignState } from "./model.ts";

const clipBoardSchema = z.object({
  file: z.string().regex(FILE), title: z.string().max(120), w: z.number().min(40).max(4000), h: z.number().min(40).max(20000),
  page: z.boolean().optional(), dx: z.number(), dy: z.number(), html: z.string().max(400_000),
}).strict();
/** boards: the copied ones, dx/dy from the group's top left; deps: the components they import (dx/dy unused) */
export const boardsClipSchema = z.object({
  boards: z.array(clipBoardSchema).min(1).max(60),
  deps: z.array(clipBoardSchema).max(60).default([]),
}).strict();
export type BoardsClip = z.infer<typeof boardsClipSchema>;
type ClipBoard = BoardsClip["boards"][number];

const imports = (html: string) => [...html.matchAll(/<dc-import\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!).filter((f) => FILE.test(f));

/** The boards of `files` (in the canvas's order) with what they import, the components' components too. */
export function copyBoards(s: DesignState, files: string[]): BoardsClip | { error: string } {
  const picked = s.order.filter((f) => files.includes(f) && s.boards[f]);
  if (!picked.length) return { error: "none" };
  const x0 = Math.min(...picked.map((f) => s.boards[f]!.x)), y0 = Math.min(...picked.map((f) => s.boards[f]!.y));
  const one = (f: string, dx: number, dy: number): ClipBoard => {
    const b = s.boards[f];
    return { file: f, title: b?.title ?? f.replace(/\.html$/, ""), w: b?.w ?? 390, h: b?.h ?? 80, ...(b?.page ? { page: true } : {}), dx, dy, html: s.files[f] ?? "" };
  };
  const boards = picked.map((f) => one(f, s.boards[f]!.x - x0, s.boards[f]!.y - y0));
  const deps: ClipBoard[] = [];
  const queue = boards.flatMap((b) => imports(b.html));
  while (queue.length) {
    const f = queue.shift()!;
    if (picked.includes(f) || deps.some((d) => d.file === f) || s.files[f] === undefined) continue;
    deps.push(one(f, 0, 0));
    queue.push(...imports(s.files[f]!));
  }
  return { boards, deps };
}

const freeName = (taken: (f: string) => boolean, file: string) => {
  if (!taken(file)) return file;
  const base = file.replace(/(-copy\d*)?\.html$/, "");
  let n = 1, f = `${base}-copy.html`;
  while (taken(f)) f = `${base}-copy${++n}.html`;
  return f;
};
/** src="old" / href="old" (and "old#…") → the new name, for every name that changed. */
function relink(html: string, renamed: Map<string, string>): string {
  if (!renamed.size) return html;
  return html.replace(/\b(src|href)(\s*=\s*)(["'])([^"'#]+)(#[^"']*)?\3/gi, (m, a, eq, q, f, hash) => (renamed.has(f) ? `${a}${eq}${q}${renamed.get(f)}${hash ?? ""}${q}` : m));
}

/** Puts the copied boards on `sheet` of `s` (changes it): centred on `at` (the middle of the person's view) or after
 *  the last row; the components it lacks go in a row under them. A component the canvas already has under the same
 *  name is used as it is; nothing is overwritten. */
export function pasteBoards(s: DesignState, clip: BoardsClip, o: { at?: { x: number; y: number }; sheet?: string } = {}): { files: string[] } {
  const sheet = sheetOf(s, { sheet: o.sheet });
  const renamed = new Map<string, string>(), added = new Set<string>();
  const taken = (f: string) => !!s.boards[f] || s.files[f] !== undefined || added.has(f);
  for (const b of clip.boards) { const f = freeName(taken, b.file); added.add(f); if (f !== b.file) renamed.set(b.file, f); }
  const deps = clip.deps.filter((d) => !taken(d.file));
  const W = Math.max(...clip.boards.map((b) => b.dx + b.w)), H = Math.max(...clip.boards.map((b) => b.dy + b.h));
  const origin = o.at ? { x: Math.round(o.at.x - W / 2), y: Math.round(o.at.y - H / 2) } : placeNew(s, W, H, sheet);
  const on = sheet !== sheetOf(s, {}) ? { sheet } : {};
  const files: string[] = [];
  const put = (f: string, b: ClipBoard, x: number, y: number) => {
    s.boards[f] = { x, y, w: b.w, h: b.h, title: b.title, ...(b.page ? { page: true } : {}), ...on };
    s.files[f] = relink(b.html, renamed);
    s.order.push(f);
    files.push(f);
  };
  for (const b of clip.boards) put(renamed.get(b.file) ?? b.file, b, origin.x + b.dx, origin.y + b.dy);
  let x = origin.x;
  for (const d of deps) { put(d.file, d, x, origin.y + H + GAP_Y); x += d.w + GAP_X; }
  return { files };
}
