// One element of an artboard's source, as designCanvas.parse finds it: its tid (the preorder index of its start tag
// in the file — the number every frame element carries as data-tid) and its offsets in the text, so every edit is a
// splice of the agent's own source, never a re-serialisation.
export type Element = {
    /** Preorder index of the element in the file (its address: "File.html#tid"). */
    tid: number;
    /** Lower-case tag name. */
    tag: string;
    /** Offset of `<` of the start tag. */
    start: number;
    /** Offset just after the start tag's `>`. */
    openEnd: number;
    /** Offset of the end tag (= openEnd for void and self-closed elements). */
    closeStart: number;
    /** Offset just after the end tag. */
    end: number;
    /** tid of the parent element, -1 at the top. */
    parent: number;
    /** tids of the child elements, in order. */
    children: number[];
};
