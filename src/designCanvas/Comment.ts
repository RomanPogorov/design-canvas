// A comment pinned to an element of an artboard (its tid; -1 = the artboard itself at fx, fy) with its replies.
export type Comment = {
    file: string;
    /** The element's tid at the time it was pinned; -1 pins it to the artboard. */
    tid: number;
    /** Where on the element (or artboard), 0..1. */
    fx: number;
    fy: number;
    /** What it is pinned to, as the person saw it: `tag «text»`. */
    label: string;
    text: string;
    by: string;
    at: string;
    resolved?: boolean;
    replies?: Array<{ by: string; text: string; at: string }>;
};
