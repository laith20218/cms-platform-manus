# Gate 2 — Cloudflare R2 and Malware Scanner Verification

## Result

> **EXTERNAL VERIFICATION REQUIRED**

No R2, Cloudflare, S3, scanner, or ClamAV configuration variable was available by name in the environment. No external bucket or malware provider was contacted, and no real provider assertion is claimed.

## Local security evidence

| Control | Result | Evidence |
|---|---|---|
| Default scanner failure behavior | PASS | `FileScannerSafetyTests` passes: `not_configured`, not clean, not infected. |
| File completion on missing/failed scanner verdict | PASS by handler behavior | `CompleteUpload` records `Error` for a non-clean/non-infected result and does not publish. |
| Student signed access | PASS by handler guard | File access requires `Status=Published` and `VirusScanStatus=Clean`. |
| R2 private-bucket/signed-URL behavior | NOT EXECUTED | No staging bucket credentials or provider access. |
| Clean/infected/quarantine provider behavior | NOT EXECUTED | No external scanner provider. |

A local test adapter would not prove the behavior of a real malware provider and would not close the R2 gate. The existing fail-closed implementation directly proves the most important local safety property: no configured scanner does not produce a clean verdict, and a non-clean file cannot obtain a student signed URL.

## Owner closure procedure

The storage/security owner must execute the listed R2 request matrix against a non-production private bucket and retain HTTP/object-audit evidence. The scanner owner must run clean PDF/image, MIME/extension/size rejection, EICAR, timeout, failure, retry, quarantine, and no-verdict scenarios through the deployed upload pipeline. No test provider result should be called an external-provider pass.

Evidence: `external_r2_scanner_availability_2026-08-20.log`, `gate2_scanner_source_map_2026-08-20.log`, `gate2_library_publication_map_2026-08-20.log`, and the passing `FileScannerSafetyTests` command output.
