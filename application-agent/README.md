# ApplyIt application agent

Private, single-profile prototype for the standalone job board. The existing Cloud Run frontend authenticates backend requests with its Google service identity. The Worker accepts only the configured service accounts; personal endpoints are not anonymous.

## Features

- `/profile`: contact details, work authorization and sponsorship, education, preferences, optional disclosures, and reusable question/answer pairs.
- Original PDF résumé and extracted text stored in the private R2 bucket `applyit-application-profiles`. PDF limit: 5 MB / 20 pages; selectable text required.
- Job-card **Apply** resolves the job on the server and starts an authenticated cloud browser session.
- **Live application** shows Cloudflare read-only Live View, snapshots, activity, completed fields, and questions requiring review.
- **Stop session** closes the browser. Sessions expire after five minutes; active filling has a two-minute bound.
- GLM-5.3 Flash on Workers AI prepares professional answers from résumé/profile evidence; Jev matches fields and checks prepared answers.
- No extension. The TypeSafe key stays in Cloudflare secret storage; GLM uses the Workers AI binding and needs no extra API key.

## What is supported

This first version accepts Greenhouse, Lever, and Ashby hosted application URLs. It handles visible text fields, native selects, some accessible comboboxes, and selecting the saved résumé file. The original job link remains available on each card.

Employer login, CAPTCHA, custom multi-step flows, radio/checkbox groups, consent, signatures, uncertain matches, and unavailable answers require review. The agent uses explicit profile values, saved answers, exact résumé excerpts, or professional answers composed by GLM from cited profile/résumé facts. Generated answers require valid source quotations and a separate Jev evidence check. Missing contact details, work permission, sponsorship, demographics, compensation, preferences, availability, and consent are never supplied by GLM. The full job/employer workflow has not yet been validated with a real application.

**No submission:** form submission events, native submission methods, Enter-based submission, submit-button clicks, and outbound writes are blocked. Only a small allowlist of Ashby read queries may use POST. This also means employer-side upload/parsing requests can be blocked: selecting a résumé is verified in the browser, but employer-side attachment confirmation may require review. No bypass of verification or CAPTCHA is attempted.

## Answer preparation

Model: `@cf/zai-org/glm-5.3-flash`, through the `AI` binding. At most one request per run, up to 20 eligible questions, 4,096 completion tokens, and a 45-second timeout. Explicit saved answers remain authoritative. No model tools or browser control are granted to GLM. Page text and résumé contents are treated as data. Invalid, truncated, unsupported or timed-out responses fall back to saved-answer matching.

A single private cache entry per owner is keyed by the full profile, résumé text, job, field labels/options, model, and prompt version. It expires after 24 hours; profile or résumé changes delete it. Cached drafts are rechecked by Jev on each run. Generation token counts, prepared/accepted counts, model name and evidence decisions are recorded in the private session; raw reasoning and provider errors are not logged. Model statements and confidence scores are not guarantees of factual correctness; the user still reviews every application.

GLM calls use the existing Cloudflare paid account. Jev billing remains with TypeSafe. No new external model credentials are required.

## Private test

**Test autofill** uses your saved résumé/profile on a controlled form hosted by this Worker, with no employer involved. As requested for testing, blank work-permission answers use explicitly labeled sample values in that test only: United States, authorized Yes, sponsorship now No / future Yes. These sample values are never saved to the personal profile and never used for employer applications.

The `/validation/` routes use an isolated validation profile. `scripts/live-smoke.py` tests R2 upload, PDF text extraction, exact file download, anonymous rejection, autofill, read-only Live View, screenshots, unanswered questions, and cleanup without modifying the personal profile.

## Security and scope

This is one private owner's profile, not a public multiuser app. Keep the frontend Cloud Run service private. Public access requires user authentication and per-user ownership before launch. There are no public R2 bucket URLs, generic browser-control RPCs, or exposed cloud/model credentials. Live View URLs are temporary access credentials, provided only through the authenticated application; do not log or share them.

R2 stores profile JSON, PDFs, and the latest application screenshot. Replacing/removing a résumé deletes the old file. A new session replaces the prior screenshot; session state persists in the Agent. The current release retains the last screenshot after the browser closes.

## Development

```sh
npm ci
npm run types
npm run typecheck
node --experimental-strip-types --test tests/*.test.mjs
npm run deploy
```

Set the model key once, leaving the name below unchanged. Paste the actual key only at the prompt:

```sh
npx wrangler secret put TYPESAFE_API_KEY
```

Jev uses the [direct TypeSafe API](https://docs.typesafe.ai/introduction/quickstart) and TypeSafe account credits. Cloudflare browser and storage usage are separate.

```sh
python3 scripts/smoke.py       # Original short connection test
python3 scripts/live-smoke.py --check-cache # Isolated GLM + Jev test, followed by cache reuse
```

The smoke scripts use the existing deployment service account to obtain short-lived identity tokens and never print credentials. Results are stored under ignored `reports/`.

## GLM integration verification — 2026-09-23

Deployed worker: `b40605ce-9f15-463e-b34f-e32b02fe251f`. Eight local tests and the TypeScript check passed. The isolated live run filled ten fields, including a GLM answer combining the project language, cloud platform and database. Jev matched the answer and independently selected `supported` for the evidence check. The missing referral answer and consent stayed untouched. A repeat run reused the cached plan and reverified it. No submission occurred; the validation browser and temporary profile were cleaned up. The first generation used 617 input tokens and 89 output tokens; actual application usage varies.

## Live-view loading fix — 2026-09-23

Ashby serves its application JavaScript from `cdn.ashbyprd.com`. This host and `www.recaptcha.net` must remain in the browser resource allowlist. Submission writes remain blocked. Live View is bound to the application page's explicit CDP target; browser keep-alive and the review window are both five minutes. Status polling detects closed sessions.

For a page-only diagnostic, authenticated `POST /validation/runs/start` accepts `{ "inspectOnly": true, "job": { ... } }`. This mode is restricted to the isolated validation owner, loads the page, counts form controls, and takes a screenshot without entering profile data or calling Jev. Stop it with `POST /validation/runs/stop` when finished.

Verified the affected Hadrian Ashby form loads 25 controls with no personal information entered; visually verified the read-only live feed in a separate browser tab. The in-app browser's embedded viewer remained blank, so the frontend falls back to snapshots after ten seconds if the iframe does not load. A loaded iframe does not prove its video connection is healthy; the manual snapshot toggle and separate-tab link remain available.

Deployed worker: `92cbe682-87ab-4e4b-b5ae-a4979049d831`. Frontend revision: `applyit-job-board-00012-jlk`. Frontend lint/build, backend type check, and three request-policy tests passed.

## Initial verification — 2026-09-23

- Type checks, frontend lint/build, URL policy tests, and blocked-write tests passed.
- Isolated live test filled nine fields, including combined current/future sponsorship and a saved custom answer, selected a PDF, and left the missing referral answer and consent untouched.
- Private upload/readback, PDF extraction, invalid-PDF rejection, read-only Live View, R2 screenshot access, Stop, and anonymous rejection passed.
- Frontend revision: `applyit-job-board-00010-ttg`.
- Worker version: `1df33afb-6d3a-4371-a179-fdc817557c78` (adds private-test-only sample permissions and precise contact matching).
- The provided personal résumé has been saved and its downloaded bytes verified against the original. Unsupported personal answers remain unanswered.

## Clerk user identity

Frontend service calls still require the allowlisted Google identity. Personal `/profile` and `/runs` routes additionally require a Clerk session in `X-Clerk-Session-Token`; the Worker verifies that session with `@clerk/backend` and scopes R2/agent state to its user. `CLERK_SECRET_KEY` stays in Worker secrets. `/auth/config` exposes only the publishable key to the trusted frontend service. Browser origins are explicitly allowed by `CLERK_AUTHORIZED_PARTIES`.

The legacy `private-owner` profile is retained and can be imported only after matching a Clerk-verified email, with a single-owner claim and conditional writes that preserve existing user edits. Validation fixtures remain isolated from user storage. The app still stops before submitting applications.

Authentication and migration checks:

```sh
node --experimental-strip-types --test tests/user-auth.test.mjs
```
