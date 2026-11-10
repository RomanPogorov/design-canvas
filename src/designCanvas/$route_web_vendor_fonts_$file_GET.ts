import { serve } from "../../sdk/assets.ts";
/**
 * Speca's UI font (Golos Text).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return serve("fonts", opts.params.file ?? "", opts.req);
}
