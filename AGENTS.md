# Watch Desk — working notes

Read `docs/ARCHITECTURE.md` before changing anything in `src/lib/providers/`.

Three rules that are not negotiable:

1. **Never add `Promise.all` to the refresh path.** Every outbound request goes
   through one per-host serialized queue. The politeness story depends on
   exactly one request in flight per host.
2. **Never trust a status code from these upstreams.** They return 200 on
   failure. Validate shape.
3. **Never add a code path that recommends buying or selling.** This app
   describes; it does not advise.

Run `npm run check` before committing. Run `npm run smoke:providers` first when
anything looks wrong — it isolates "the internet changed" from "we broke it".
