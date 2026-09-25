# Retired forwarding prototype

This directory contains the earlier proxy that pointed inqox.com at Cloud Run. It is no longer the deployment source. **Do not deploy this directory.**

The actual Next.js app runs on Cloudflare Workers from `../frontend/`, using `frontend/wrangler.jsonc` and OpenNext. Deploy from that directory with `npm run deploy`. The existing Cloud Run frontend remains private as a rollback copy.
