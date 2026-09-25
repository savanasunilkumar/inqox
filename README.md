# ApplyIt Jobs

Standalone job board at `/Users/sunilkumar/job-board`. `backend/` contains the ATS scanner, PostgreSQL repository, and FastAPI jobs API. `frontend/` contains the Next.js page. The page displays only job cards from live `GET /jobs` results, with no sample listings.

## Current deployment

- Backend API: Cloud Run service `applyit-jobs-api` in `aniflixx-production/us-central1`. Its `/jobs` endpoint is live and requires the existing API bearer token.
- ATS scanner: existing separate Cloud Run Job `applyit-jobs-scanner`; unchanged by the board deployment.
- Frontend: private Cloud Run service `applyit-job-board`. It reads the API token from the existing `applyit-api-token` Secret Manager secret at runtime. The token stays on the server.

To view the deployed frontend locally with your Google Cloud credentials:

```sh
gcloud run services proxy applyit-job-board --project=aniflixx-production --region=us-central1 --port=3000
```

Open `http://127.0.0.1:3000/`. The private frontend URL is `https://applyit-job-board-iyx36e4y3q-uc.a.run.app`; direct browser access requires Cloud Run access.

## Run both services locally

1. Start the backend:

   ```sh
   cd /Users/sunilkumar/job-board/backend
   cp .env.example .env
   docker compose up --build
   ```

2. Start the frontend in another terminal:

   ```sh
   cd /Users/sunilkumar/job-board/frontend
   cp .env.example .env.local
   npm ci
   npm run dev
   ```

Set `JOBS_API_BASE_URL=http://127.0.0.1:8080` in `frontend/.env.local`. If local backend auth is enabled, set `JOBS_API_TOKEN` to the same value as `API_TOKEN`. Keep production credentials out of source control.

See `backend/README.md` and `frontend/README.md` for more details.

## Application profile and autofill

`application-agent/` contains the authenticated Cloudflare Browser Run + Agents SDK application agent. Profile details, the original PDF résumé, extracted text, and the latest screenshot are stored in a private R2 bucket. The frontend Profile page edits these details. Apply starts a fill-only session with read-only Live View, progress, review items, and Stop. Initial support is Greenhouse, Lever, and Ashby hosted links; submissions are disabled.

Jev uses the direct TypeSafe API and a Cloudflare secret. See `application-agent/README.md` for the verified test results, limitations, private test, and deployment instructions.
