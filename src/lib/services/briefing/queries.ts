import "server-only";

/**
 * The app's boundary onto the briefing.
 *
 * `server-only` sits here rather than on the builder: its job is to fail the
 * build if page code reaches a client bundle, and pages import this module.
 * The assembly itself lives in @/lib/briefing/build so that scripts can run it
 * outside a React render.
 */
export { getBriefing, getNewsPulse } from "@/lib/briefing/build";
export type { Briefing, BriefingEntry } from "@/lib/briefing/build";
