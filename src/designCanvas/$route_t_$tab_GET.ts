import { core } from "../../sdk/http.ts";
/**
 * The page a design canvas tab frames: the canvas with its version chip, drawer and prototype buttons.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "page");
}
