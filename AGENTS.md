# Watch Desk — working notes

Read `docs/ARCHITECTURE.md` before changing anything in `src/lib/providers/`,
and `docs/HOSTING.md` before changing anything about where data comes from.

There is **no database and no poller**. Every screen reads upstream through the
shared cache in `src/lib/live/`. The Prisma schema and `src/poller/` are still
in the tree for self-hosting; nothing the deployed app renders touches them.

Three rules that are not negotiable:

1. **Never add `Promise.all` to a path that fetches upstream.** Every outbound
   request goes through one per-host serialized queue, and the politeness story
   depends on exactly one request in flight per host. This used to say "the
   refresh path", back when a poller did the fetching; the rule did not narrow
   when the fetching moved into the request — it widened.
2. **Never trust a status code from these upstreams.** They return 200 on
   failure: a wrong CSV filename gives an HTML error page, an expired NSE cookie
   gives a login page. Validate shape.
3. **Never add a code path that recommends buying or selling.** This app
   describes; it does not advise.

A fourth, newer one: **anything reaching upstream goes through `liveSource()`**
in `src/lib/live/cache.ts`. An uncached fetch on a render path is called once
per visitor rather than once per window, which is how a personal panel turns
into a rate-limit problem for everyone.

Run `npm run check` before committing. When anything looks wrong, open
`/health` on the deployment first — it asks every upstream directly and
separates "the internet changed" from "we broke it". That page is not
decorative: running it is how the hosting plan's central claim, that NSE blocks
cloud datacenters, was found to be false.
