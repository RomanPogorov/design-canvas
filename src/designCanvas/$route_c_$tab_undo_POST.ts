import { core } from "../../sdk/http.ts";
/**
 * The person's own latest change undone (Speca undoMine).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "undo");
}
