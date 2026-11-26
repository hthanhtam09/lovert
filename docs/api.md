# API plan (not implemented)

Nothing here is scaffolded. Build it when there is a real consumer.

- **Shape**: separate service (e.g. Node on a container platform) importing `@lovert/core` for validation, limits,
  candidate policy, verification and `ErrorCodes`. Encoders are environment adapters: `sharp`/libvips for images,
  pdf-lib for PDF assembly. Same `ConversionResult` contract as the web.
- **Errors**: `{ error: { code: ErrorCode, message } }` with stable codes from core; HTTP 400 for input codes,
  413 for `FILE_TOO_LARGE`/`TOO_MANY_PIXELS`, 422 for verification failures, 429 for quota.
  Over-limit is a 200 with `status: "over_limit"` and measured numbers, not an error.
- **API keys**: hashed in Postgres (Supabase), shown once, scoped, revocable; RLS by owner.
- **Limits**: per-key concurrency, per-job pixel/byte caps from `LIMITS`, request timeout, quota per day.
- **Temp files**: memory or private storage only, TTL (e.g. 1 hour) with scheduled cleanup; never logged.
- **Office → PDF**: Gotenberg (LibreOffice) as its own internal service, not exposed publicly.
- **Privacy copy**: API and any server-side tool pages must say files are uploaded; never reuse the "on your device" wording.
