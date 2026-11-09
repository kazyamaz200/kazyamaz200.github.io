# MLPA listening page

This page is independent of MLPA WP06 execution. No research evaluation is completed by running these tests. The original WAV bytes and assigned P01–P05 orders must remain unchanged. Never add condition mappings, audit data, invite tokens, research responses or private keys to `public/`, source bundles or Git history.

Use Node 24 and the repository's pinned pnpm. Standard `build` includes Astro checks and Pagefind.

```sh
pnpm build
pnpm lint
pnpm test:mlpa
pnpm preview:mlpa
```

Open `http://127.0.0.1:4340/mlpa-listening/#participant=P01`. The participant fragment is optional and not authentication. Use synthetic answers for QA. Local responses are written outside `dist` and this repository, to `../private-review/mlpa-listening/local-responses/`. A fresh directory may be passed explicitly:

```sh
node scripts/mlpa-listening-local.mjs dist /absolute/private/test-responses 4340
```

The server binds only to 127.0.0.1. Host/Origin checks and an exclusive atomic file operation protect this local test endpoint; they are not production authentication. Responses cannot be read by HTTP. The operator retrieves `<participant>.responses.json` from the private directory. Repeating identical JSON is accepted; a different answer for the same participant returns 409, without overwriting. Keep QA files separate from formal WP06 input. Never expose this local receiver through a public tunnel.

The static page probes a same-origin local config endpoint only on 127.0.0.1. Without it, submission stays disabled. No external service is configured. Consent copy and completion text explicitly describe local testing. Formal launch requires owner approval, a production receiver and invitation authentication, data-retention/withdrawal policy and final consent wording. The page is excluded from RSS, Pagefind and sitemap, uses noindex/nofollow, and disables analytics and client routing to isolate it from the blog's SPA beacon. No giscus is mounted.

The browser distinguishes unanswered choices from explicit “判断できない”, stored as null in accordance with the package README. All other scores must be integers 1–5. Optional developer status/output type/listen count and comments match `responses.json`. Listen counts are self-reported, not inferred from partial play events. An ended event enables progression; actual listening and human participation remain self-attested, not technically proven.

API contract (local): POST `/api/mlpa-listening/responses`, JSON `{consent:true,response:<WP06-compatible object>}`. 201 new / 200 identical retry: `{status:"accepted",participant_id:"P01"}`. 400 malformed, 409 different existing response, 413 excessive payload, 415 wrong content type, 403 wrong origin/host. No list/read API. Success UI requires an accepted acknowledgement. Network failure retains answers in memory for retry; reloading discards drafts.

No MLPA aggregator or full WP06 protocol source was provided: compatibility is checked against supplied templates. Run the unchanged actual WP06 aggregator on approved real-human exports later on the MLPA side. Production service adoption, token management, receiver deployment, public Git commit and evaluation start are separate owner gates.

## Adopted receiver

The owner approved Workers + D1 on 2026-11-09. `worker/` now provides the handler, schema, operator and real workerd/D1 integration tests. See `worker/README.md`. The site remains closed by default; configuring an API origin alone does not begin collection. Final consent wording and the collection-start flag require owner review. Existing local preview behavior remains available when no external API origin is configured.

## Published collection (2026-11-09)

Owner-approved page: https://kazyamaz200.github.io/mlpa-listening/ . Participants need their separately distributed private invitation URLs; do not put those links in this repository. The production API is configured through GitHub repository build variables. Consent version is `mlpa-wp06-consent-2026-11-09-v1`; individual responses are deleted within 90 days after collection closes, while non-identifying aggregate research records require separate review before publication. See `worker/README.md` for the operator retention procedure and the explicit acceptance-start override. Human WP06 evaluation remains pending until real participants respond. All instructions above for the local receiver refer only to local synthetic QA.

## Additional participants (2026-11-09)

The owner approved two additional participants while keeping all original invitations valid. P06 reuses P02's exact presentation order; P07 reuses P05's. Original WAV bytes and P01–P05 orders remain unchanged. Additional IDs remain distinct in exports; private provenance records the source order and cohort extension. No MLPA source protocol/package was edited. Validate the original WP06 aggregator's handling of additional IDs when aggregating actual human results; do not relabel responses to the original IDs.
