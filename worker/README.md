# MLPA response receiver (Workers + D1)

The receiver is independent of MLPA WP06. It does not contain condition mappings, audit data, original private protocols or research responses. Only the unchanged public anonymous orders and the shared response validator are bundled.

## Gates

The owner approved publication and collection on 2026-11-09, with consent version `mlpa-wp06-consent-2026-11-09-v1`. The static page is https://kazyamaz200.github.io/mlpa-listening/ and the API is https://boundary-notes-mlpa-listening.hqrhp8pywj-1ae.workers.dev .

`workers_dev: true` exposes the invite-protected API. `preview_urls: false` and disabled observability remain intentional. The checked-in `ACCEPTING_RESPONSES: false` is a safe deployment default. The approved live deployment explicitly uses `wrangler deploy --var ACCEPTING_RESPONSES:true`; a plain deploy closes collection. Repeat that explicit override only when collection should remain open. Never mix staging responses with production. The configured D1 ID belongs to the dedicated production database. No paid plan change was made.

## Local verification

Node 24. Install the pinned Wrangler in this directory (`npm ci`).

```sh
npm test
npm run check
```

Tests instantiate a real workerd process with a temporary local D1 database, then remove only their own temporary synthetic test state. They test Origin/CORS, tokens bound to participants, consent versions, invalid scores/size, simultaneous distinct submissions, exact and reordered retries, independent SQLite export and the closed gate. No remote account is required. `check` bundles without upload/deployment. Do not run tests against a database holding real responses.

## Cloudflare setup after authentication

Use account/user read, Workers scripts write and D1 write scopes. Scope authorizations may apply at account level, so confirm the correct account. Never paste an API/OAuth token into chat or a repository. Use official Wrangler authentication storage. Keep runtime logs disabled (`observability.enabled: false`) and never log request bodies, Authorization or token hashes from the handler.

Create a dedicated D1 database using Wrangler, write the returned ID into the configuration, apply `migrations/` with `wrangler d1 migrations apply DB --remote`, and deploy with all gates closed. The configured Worker has no public route. Separate staging data from real participant responses. A receiving URL and exact public Origin are configured only after approval.

## Invitation and export operator

These commands run with the operator's Cloudflare permissions; there is no public export endpoint. Output must be outside the public repository and must not be uploaded or committed.

```sh
node operator.mjs issue /absolute/private/invites ./wrangler.jsonc remote
node operator.mjs export /absolute/private/exports ./wrangler.jsonc remote
```

`issue` generates five random 256-bit invitation tokens. The file contains private invitation URLs; only SHA-256 hashes go to D1. The file is written exclusively with mode 0600 before the single atomic SQL insertion. Existing invitations cause failure without overwrite. If interrupted, retain the file, inspect D1 with operator permissions and reconcile whether insertion happened before retrying. `export` saves each response as WP06-compatible `<participant>.responses.json`, without acceptance metadata; it refuses to overwrite existing files. The operator still validates JSON before writing. Exports and invitation files must be managed as private data.

Revoke an invitation by setting `invitations.active = 0` for the assigned participant through authenticated D1 administration. Reissue only after generating a new token privately and atomically replacing its hash; this invalidates the old invitation. Never put a token in SQL (only its hash), a CLI command argument, a log, or the public build. Do not automatically clear or overwrite existing responses to allow a second answer. Corrections/withdrawals are handled by the operator after checking the invitation/participant and recording the authorized change outside the public repository.

## Client integration

The static page reads a reviewed API origin from `PUBLIC_MLPA_API_URL`, the final consent version from `PUBLIC_MLPA_CONSENT_VERSION`, and a closed-by-default flag `PUBLIC_MLPA_ACCEPTING_RESPONSES`. The invitation arrives as `#participant=P01&token=...`; the token is retained only in memory and cleared from the address using replaceState. Reloading requires reopening the original invitation. It is never built into public source or saved in browser storage.

The client checks `/status`, but the server remains authoritative: POST `/responses` requires the exact allowed Origin, a valid active Bearer invitation, matching participant, current `consent_version`, and the validated `{consent:true,response}` data. 201 new, 200 identical retry, 409 different existing data, 400 invalid, 401 invalid/revoked invitation, 403 wrong participant/origin, 413 too large, 415 wrong type, 503 closed/unconfirmed result. Network/timeout/ambiguous save failures retain the draft and allow the exact same payload to be retried.

D1 primary key and conditional INSERT serialize competing responses. No application-level IP/name/email is collected. Infrastructure providers still handle connection data; consent information must not claim that infrastructure receives no IP address. Research data use, retention and withdrawal contact are owner decisions. Workers/D1 terminology belongs in operator documentation, not the main participant consent text.

## Approved collection and retention policy (2026-11-09)

Owner-approved consent version: `mlpa-wp06-consent-2026-11-09-v1`. Individual responses are used for this MLPA evaluation/analysis and deleted within 90 days after collection closes. Non-identifying aggregate results may remain as research records and require separate review before public release. Corrections/withdrawals use the original invitation contact channel.

The operator owns retention execution. At collection close: set `ACCEPTING_RESPONSES=false`, deploy, record the closure date and deletion deadline privately, and disable invitations. Delete individual D1 responses and all individual exports, downloads and copies by day 59. This leaves room for up to 30 days of D1 Time Travel history within the 90-day limit; confirm current provider retention when closing. Keep only reviewed non-identifying aggregates. Record deletion checks privately; do not restore expired responses from history. No automatic close date is inferred from the publication date.

Cloudflare Time Travel documentation: https://developers.cloudflare.com/d1/reference/time-travel/
