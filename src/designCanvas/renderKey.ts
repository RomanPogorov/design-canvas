/**
 * The key of what an artboard's frame shows: a hash of its file and of every artboard it imports, all the way down.
 *
 * Use to tell whether a frame must reload: the key changes when the file or any component it uses changes.
 * @param opts.file The artboard file name, e.g. `Home.html`.
 * @param opts.files Every artboard file of the canvas by name.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The artboard file name, e.g. `Home.html`. */
    file: string;
    /** Every artboard file of the canvas by name. */
    files: Record<string, string>;
}): string {
    const files = opts.files ?? {};
    const seen = new Set<string>();
    const walk = (src: string) => {
        for (const m of src.matchAll(/<dc-import\b[^>]*?\ssrc\s*=\s*["']?([A-Za-z0-9_][A-Za-z0-9_.-]*\.html)/gi)) {
            const f = m[1]!;
            if (seen.has(f) || files[f] === undefined) continue;
            seen.add(f); walk(files[f]!);
        }
    };
    const src = files[opts.file] ?? "";
    walk(src);
    void ctx;
    return Bun.hash([src, ...[...seen].sort().map((f) => `${f}:${Bun.hash(files[f] ?? "").toString(36)}`)].join("\n")).toString(36);
}
