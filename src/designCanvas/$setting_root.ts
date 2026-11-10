// Where design canvases live: one folder per canvas — canvas.json (the index) and one <File>.html per artboard,
// .versions/ for named versions. Relative paths resolve against the project root, `~/` against the home directory.
export default {
    type: "string",
    env: "DESIGN_CANVAS_ROOT",
    default: "designs",
    title: "Design canvases directory",
    description: "Directory holding one folder per design canvas (canvas.json + one HTML file per artboard + .versions/). Relative to the project root; ~/ means the home directory.",
};
