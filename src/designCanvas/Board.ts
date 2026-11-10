// One artboard of a design canvas: where it sits in the world, its size and title. Its HTML is the file of the same
// name in Canvas.files.
export type Board = {
    x: number;
    y: number;
    /** Width in CSS px (phone 390, desktop 1440, slide 1280). */
    w: number;
    /** Height in CSS px (phone 844, desktop 900, slide 720). */
    h: number;
    /** Shown above the frame: numbered, "01 Welcome", "02b Sign in — error". */
    title: string;
    /** A page root (max-width container, fluid widths) rather than a fixed-size screen. */
    page?: boolean;
    /** The page (sheet) of the canvas it is on; none: the first. */
    sheet?: string;
    /** Planned, not drawn yet: the canvas shows its frame waiting until designCanvas.write draws it. */
    pending?: boolean;
};
