// The copy of Speca's design canvas is Speca's, byte for byte, and the seam is the only difference served.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPLACE, seam } from "../../sdk/seam.ts";

const ROOT = join(import.meta.dir, "../..");
const SPECA = process.env.SPECA_SOURCE ?? "/Users/roman/Projects/Speca";
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test.skipIf(!existsSync(join(SPECA, "plugins/design-canvas/assets/dcv.js")))("every file under speca/ is identical to Speca's (but the one tsconfig of the copy)", () => {
  const files = walk(join(ROOT, "speca")).filter((f) => !f.endsWith("speca/tsconfig.json"));
  expect(files.length).toBeGreaterThan(60);
  const differ = files.filter((f) => !readFileSync(f).equals(readFileSync(join(SPECA, f.slice(join(ROOT, "speca").length + 1)))));
  expect(differ).toEqual([]);
});

test("each replacement of the seam still finds what it replaces in Speca's client and markup", () => {
  const texts = [
    ...walk(join(ROOT, "speca/plugins/design-canvas/assets")).filter((f) => /\.(js|css)$/.test(f)),
    join(ROOT, "speca/plugins/design-canvas/board.canvas.ts"), join(ROOT, "speca/plugins/design-canvas/kit.route.ts"), join(ROOT, "speca/web/assets/css/product.css"),
  ].map((f) => readFileSync(f, "utf8")).join("\n");
  for (const [from] of REPLACE) expect({ from, found: texts.includes(from) }).toEqual({ from, found: true });
  const served = seam(texts);
  for (const [from] of REPLACE) expect(served.includes(from)).toBe(false);
  expect(served).toContain("/designCanvas/c/${tab}/comments");
});
