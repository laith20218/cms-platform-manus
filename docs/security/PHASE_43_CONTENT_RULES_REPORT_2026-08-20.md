# Phase 43 — Same Content Rules Report

**Decision:** **IMPLEMENTED — EXTERNAL VERIFICATION REQUIRED.**

The repository now enforces a common content-access pattern: authenticated and entitled users reach Library metadata and signed URL issuance only through server-side entitlement checks; library files must be `Published` and `VirusScanStatus=Clean` before a signed URL is issued. R2 uploads use private object ACLs and URLs are generated with a five-minute GET expiry.

A new `IFileScanner` abstraction is registered in dependency injection. Its default `FailClosedFileScanner` returns `not_configured`, never `clean`. Completing an upload therefore records an `Error` scan state while no production scanner provider is configured; it cannot make a file eligible for the existing signed-URL path.

| Control | Status | Evidence |
|---|---|---|
| Private upload object request | IMPLEMENTED | `R2StorageService.UploadAsync` uses `S3CannedACL.Private`. |
| Short-lived signed GET URL | IMPLEMENTED | `GetSignedUrlAsync`; Library handler requests five minutes. |
| Signed URL entitlement and clean verdict | IMPLEMENTED | `LibraryHandlers.GetFileAccess` requires live entitlement, published status, and `VirusScanStatus.Clean`. |
| Scanner abstraction default | PASS | `FileScannerSafetyTests.DefaultScanner_IsFailClosedWhenNoProviderIsConfigured`. |
| Real scanner clean/infected/quarantine flow | EXTERNAL VERIFICATION REQUIRED | No scanner provider credential or sandbox staging scanner is available. |
| Real R2 private bucket/direct-denial proof | EXTERNAL VERIFICATION REQUIRED | No Cloudflare R2 account credentials/bucket access were supplied. |

## Current execution evidence

| Command | Result |
|---|---|
| `DOTNET_ROLL_FORWARD=Major dotnet build CMS.sln -c Release --no-restore` | PASS — 0 errors; `docs/security/phase43_scanner_build_2026-08-20.log` |
| `DOTNET_ROLL_FORWARD=Major dotnet test CMS.sln -c Release --filter 'Category!=PostgresIntegration' --verbosity minimal` | PASS — 95/95; `docs/security/phase43_nonpostgres_tests_2026-08-20.log` |

## Required external verification

The storage owner must create a private R2 bucket, deny anonymous object reads/listing, restrict the API token to the designated bucket, and provide a disposable staging configuration through deployment secrets. The security owner must configure a malware scanner that returns a durable clean/infected verdict and verify, in staging only, that an EICAR object remains inaccessible and quarantined. Evidence must include direct-object denial, a five-minute signed URL success/expiry observation, an infected verdict, and a clean verdict. No secret value should be committed or written into this report.

The next ordered phase is **Phase 44 — Same Audit Model**.
