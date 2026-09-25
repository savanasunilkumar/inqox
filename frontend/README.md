# inqox frontend

Next.js 16, React 19, shadcn/ui, Tailwind CSS, and Clerk. Production runs directly on Cloudflare Workers at https://inqox.com using OpenNext. The Worker is `inqox-web`.

## Development and deployment

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build:cloudflare
npm run preview
# Build and deploy to inqox.com
npm run deploy
```

Production Clerk keys work on inqox.com. Local testing requires a separate development Clerk environment. `wrangler.jsonc` is the source of truth for the production hostname and bindings. Generate binding types with `npm run cf-typegen`.

## Local profile design preview

Run `npm run dev:profile` and open http://127.0.0.1:3001/profile. This development-only view renders the same résumé upload component without Clerk or backend calls. It starts empty; selected files stay in browser memory and disappear on refresh. Production authentication and profile completion rules remain enforced. The first profile step contains only résumé upload; later steps are still to be designed.

## Services and secrets

- The Next.js frontend and API routes execute on Cloudflare Workers. The former Cloud Run frontend remains private and is no longer the website origin.
- Profile, résumé, and application routes use a private Cloudflare service binding to the `Frontend` entrypoint of `applyit-application-agent`. Every personal-data request still verifies the user's Clerk session. No Google token or Clerk secret is needed in the frontend.
- `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` remain secrets on the application Worker. `/api/auth/config` returns only the public browser key.
- The existing jobs collector and API remain on Google Cloud. `JOBS_API_BASE_URL` is configured in Wrangler. The frontend requires a `JOBS_API_TOKEN` Worker secret to read the protected jobs API. The existing jobs connection secret is configured as the encrypted `JOBS_API_TOKEN` Worker secret. Production jobs requests are verified against the live API. No demo jobs are shown.
- Company-logo processing uses Cloudflare Images and PNG processing to preserve transparent backgrounds. Static assets receive immutable cache headers. Personal responses are uncached.

## Authentication and ownership

Inqox renders its own sign-in, sign-up, password reset, and verification forms using Clerk’s authentication hooks, following the custom-form pattern in the OriginX dashboard. There are no prebuilt Clerk sign-in or sign-up widgets. Clerk remains the authentication and session provider, including the sidebar account menu. Successful sign-in and sign-up navigate to `/profile`. Profile, résumé, screenshots, and application sessions are scoped to the verified Clerk user. Session tokens travel in a header, never a URL. The backend validates signatures, expiry, issuer, session status, and the production origin. Signed-out or invalid sessions receive 401.

The legacy private résumé/profile stays backed up in R2. It imports only when a signed-in account has a Clerk-verified email matching the saved profile; existing user edits are never overwritten. Application filling continues to stop before submission.

## Profile setup

Only Profile and Settings are available until the saved profile includes a text-readable PDF résumé and all required application fields. Required fields are marked with an asterisk; personal links, preferred name, visa type, and optional disclosures remain optional. Partial saves are supported. Completion is computed from stored values, never a browser-supplied flag.

The shared rules live in `lib/profile-completion.ts` and are also imported by the application Worker. Backend checks protect jobs, job details, and application runs. The browser gates direct page navigation and disables locked sidebar entries. Removing a required saved answer or résumé locks access again. Settings always provides account management, appearance, and sign-out.

Run custom authentication flow tests with `node --experimental-strip-types --test tests/custom-auth-flow.test.mjs`. These cover verified-session finalization, device trust, MFA, rejected codes, resend, and password-reset states.

Run the access-rule tests with `node --experimental-strip-types --test ../shared/profile-completion.test.mjs`.

## UI

The compact sidebar, full-width workspace, infinite job scrolling, card Apply buttons, and job-details drawer are retained. Navigation preserves cached job pages and scroll positions. Dashboard, Inbox, and Tracker keep their existing placeholder content. Settings provides account and session controls. Profile and Application retain their existing functionality.

`../web-edge/` is a retired forwarding prototype. Do not deploy it over the Next.js Worker.

### Temporary owner access

The frontend allows the existing owner Clerk account to browse Job Board before completing Profile. Navigation and the Next.js jobs-read gate share the same exact account-ID allowlist; the latter first requires the application service to authenticate the session. Other incomplete accounts and all application-agent actions keep their existing requirements. No application-worker or jobs-backend changes are needed. The isolated local design preview has no Clerk identity.
