// A row title (big text above a row of artboards) or a sticky note on a design canvas.
export type Note = {
    kind: "title" | "sticky";
    text: string;
    x: number;
    y: number;
    /** Width; a row title is as wide as its row. */
    w?: number;
    /** The page (sheet) it is on; none: the first. */
    sheet?: string;
};
