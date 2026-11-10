import { serve } from "../../sdk/assets.ts";
/**
 * Speca's design-canvas client files (dcv.js, panel.js, picker.js, dck.*, …), byte-identical but for the seam.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return serve("plugin", opts.params.file ?? "", opts.req);
}
