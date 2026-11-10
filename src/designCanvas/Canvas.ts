// A design canvas as stored: the index (artboards, order, row titles and stickies, pages, comments) and one HTML
// file per artboard. Every element of an artboard has an address "File.html#tid" (tid = preorder index of its tag).
export type Canvas = {
    /** The canvas's name: its folder under the designs directory and its address /designCanvas/<name>. */
    name: string;
    title: string;
    /** Bumped on every save; the editor reloads what changed when it moves. */
    rev: number;
    /** Artboard files in the plan's order. */
    order: string[];
    boards: Record<string, types.designCanvas.Board>;
    notes: Record<string, types.designCanvas.Note>;
    /** The pages of the canvas; empty: one unnamed page. */
    sheets: Array<{ id: string; title: string }>;
    comments: Record<string, types.designCanvas.Comment>;
    /** Artboard HTML by file name. */
    files: Record<string, string>;
    /** What the last save did ("drew 02 Sign in", "moved 3 items"). */
    note?: string;
    updatedAt?: string;
};
