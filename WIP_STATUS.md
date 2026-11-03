# WIP_STATUS — feat/14.5-hardening (Wave 14.5: Final Hardening & Bug Fix)

## ─── STATE ───────────────────────────────────────────────
Wave 14.4 is MERGED (main @ `b072704`, PR #73). This branch closes W14.5 —
the final hardening wave: the GET /questions 500 incident fix, B2 presigned
URLs for question images, technical-debt cleanup (Question.ExamId drop +
dead code + one silent error swallow), and project closure docs.
**4 of 4 commits DONE (LOCAL ONLY — push requires supervisor approval, §2).**

Session-recovery note: sandbox was reset; repo re-cloned from origin per §9
and HEAD verified to match `b07270457306ff57b528689ddc56de779795e3cd` before
branching. Environment rebuilt: pnpm 9.12.0 (corepack) + .NET SDK 9.0.320 at
`/home/z/.dotnet` + local dotnet-ef 9.0.22 (`dotnet tool restore`).

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `da76955` fix(api): resolve 500 error on GET /questions (W14.5)
2. `0e00a63` feat(api): B2 presigned URLs for question images
3. `ef40f04` chore(api,student-web): drop Question.ExamId + dead code
4. `<HEAD>`  docs: final WIP_STATUS + project closure (W14.5)
   Base: main @ `b072704` (PR #73, W14.4 merged).

## ─── THE INCIDENT: 500 on GET /api/v1/questions ───────────
Root cause (captured live from the Render preview log stream, TraceId
`92e3f23da14549aeb6106ec394012661`):
`System.InvalidOperationException: Collection was modified; enumeration
operation may not execute.` at `QuestionQueryHandlers.Handle(GetQuestionsQuery)`
— QuestionHandlers.cs:95. The attempt-patch loop mutated `items` while
foreach-enumerating it (`items[items.IndexOf(item)] = updated`), so ANY
AttemptLog on a NON-last page item failed the whole request with 500.
Latent since the original scaffold (`d08b64a`); surfaced by W14.4 because
the new practice flow records AttemptLog rows for students (attempts on
non-last items became common). NOT the suspected QuestionUsage column —
the preview DB has `question_usage integer NOT NULL DEFAULT 2` and full
entity materialization works (verified live via the admin content list,
HTTP 200).
Fix: index-based in-place patch loop (same replacement semantics, O(n) vs
O(n²) IndexOf scans). Regression tests pin the exact failing shape —
verified RED on the pre-fix code (byte-for-byte the production exception)
and GREEN after the fix.

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — Phase 0: the 500 fix (`da76955`)
- `QuestionHandlers.cs`: attempt patch loop → index-based `for` loop.
- `HandlerTests.cs`: +2 regression tests (attempt on first/non-last page
  item; all-items-attempted worst case). Red→green proven via stash.

### Commit 2 — Phase A: B2 presigned URLs (`0e00a63`)
- New `IPresignedUrlService` (CMS.Application) + `B2PresignedUrlService`
  (CMS.Infrastructure): presigned GET URLs for B2 object keys via the AWS
  SDK (SigV4, computed locally — zero network I/O). Same `Storage:S3:*`
  config + path-style addressing as S3StorageService, but GRACEFUL instead
  of fail-closed: missing storage config degrades to passthrough with a
  log-once warning (a read-path nicety must never 500 a question read).
  Expiry: `Storage:S3:PresignExpiryMinutes` (default 60 min, clamped ≤7d).
- Question DTO mapping (`GetQuestionById`): every question-image AND
  option-image reference is resolved — absolute http(s) URLs pass through
  unchanged (the existing public-URL production contract), bare object keys
  presign against the configured bucket, `b2://bucket/key` URIs presign
  against their explicit bucket. Applied after the already-answered
  re-mapping so both branches resolve.
- Frontend: existing `<img>` tags render imageUrl verbatim (Practice/Exam/
  admin preview); new student-web test locks the contract — a presigned
  URL with X-Amz-* SigV4 query params renders VERBATIM (rewriting would
  invalidate the signature). CSP already allows `https://*.backblazeb2.com`.

### Commit 3 — Phase B: technical debt (`ef40f04`)
- Hand-authored migration `20261117120000_DropQuestionExamId`: drops the
  legacy `questions.exam_id` column + its FK (`fk_questions_exams_exam_id`)
  + index (`ix_questions_exam_id`). Model side removed with it:
  `Question.ExamId`, `Question.Exam`, `Exam.Questions`, dead
  `QuestionRepository.GetByExamAsync` (last legacy-column reader, zero
  callers). Idempotent Neon SQL mirror:
  `scripts/migrations/W14_5DropQuestionExamId.sql`. **NOT applied to any
  database on this branch — §2 deploy gate.**
- Dead code removed: `apps/student-web/src/features/offline/` (3 files —
  zero runtime imports, no route, no UI mount, flag undocumented) + its
  only-importing test `offline-envelope.test.ts`. Android offline API
  endpoints untouched (they serve the Android app).
- Silent error swallowing fixed: `QuestionPage` `reportMutation` had no
  `onError` (react-query v5 swallows mutation errors) — failed question
  reports produced zero feedback. Now toasts «تعذر إرسال البلاغ». API-side
  audit: the one empty catch (`SemaphoreFullException` in
  `SecurityEventBatchService.ReleaseIfAvailable`) is an intentional correct
  guard — left as is.

### Commit 4 — Phase C: this closure document set.

## ─── VERIFICATION LADDER (final tree) ────────────────────
- student-web: `tsc -b` 0 errors · `eslint . --ext ts,tsx --max-warnings=0`
  exit 0 · vitest **378/378** (30 files) · `vite build` PASS.
- admin-web: tsc 0 errors · vitest **58/58** · `vite build` PASS ·
  eslint ⚠️ FAILS with pre-existing warnings (`no-explicit-any`,
  `exhaustive-deps`) — **pre-existing on main @ b072704; W14.5 did not
  touch admin-web** (`git diff b072704..HEAD -- apps/admin-web` is empty).
- API: `dotnet build` (full clean rebuild) 0 errors / 20 pre-existing
  warnings (baseline) · `dotnet test` **679 passed / 0 failed / 27
  skipped** (Testcontainers, no Docker; W14.4 baseline 663 → +2 incident
  regression + 14 presigner tests + 1 presigned-DTO mapping test, −1 net
  from the 2 dead offline-envelope tests) · `dotnet ef migrations
  has-pending-model-changes` → **"No changes"** (validates the hand-edited
  snapshot against the model with ExamId removed).
- Live evidence: the preview incident was reproduced from the Render log
  API (correct filter syntax: `?ownerId=…&resource=…&startTime=…&endTime=…`
  with `limit` — bare `owner`/`service`/`start`/`end` params are rejected);
  the fix's unit tests replay the exact stack signature.

## ─── DISCLOSED DEVIATIONS / OUT-OF-SCOPE FINDINGS ────────
1. **Migration NOT applied** — `20261117120000_DropQuestionExamId` is
   authored and model-verified but NOT applied to preview/prod (§2: no prod
   DB touches, deploy gate is supervisor-authorized). The idempotent SQL
   for the supervisor (also in scripts/migrations/W14_5DropQuestionExamId.sql):
   ```sql
   ALTER TABLE questions DROP COLUMN IF EXISTS exam_id;
   ```
2. **Student test login rejected** — the provided test phone number + password
   returns AUTH_INVALID_CREDENTIALS on the preview API (1 failed attempt
   logged; stopped immediately to avoid the 5-attempt lockout). The 500 was
   reproduced and root-caused via the Render log stream + the admin content
   endpoint instead; no admin/student credentials are quoted in this repo.
3. **Option-image write path still drops ImageUrl server-side** —
   admin-web sends `imageUrl` in create/update payloads but
   `Question.AddOption` has no image parameter (pre-existing gap; only the
   duplicate endpoint copies QuestionImage rows). Read-side presigning is
   forward-compatible: once the write path persists keys/`b2://` URIs, they
   resolve automatically.
4. **Student QuestionPage renders no images at all** (pre-existing gap —
   `images`/option `imageUrl` are dropped in the page's data shape even
   though the API returns them). Practice/Exam/admin pages DO render them.
5. **Practice/Exam snapshot DTOs** still return raw image references — can
   adopt the same one-line `IPresignedUrlService` resolution later.
6. **Credential rotation still outstanding** since W14.1 (GitHub PAT,
   Vercel ×2, Neon key, Upstash blob token, Render key, both account
   passwords) — chat-pasted credentials must be rotated.

## ─── NEXT (STOP GATE → supervisor) ────────────────────
1. Supervisor reviews the 4 local commits + this evidence pack.
2. Push approval → `git push -u origin feat/14.5-hardening` (PAT inline, §5,
   triple-scrub) → PR → CI green → merge.
3. Deploy gate → apply `scripts/migrations/W14_5DropQuestionExamId.sql` to
   Neon (idempotent, verified snippet above) → deploy the API → re-run the
   student golden path against the preview (login → lecture → questions
   list with attempts → images).
4. Rotate ALL chat-pasted credentials (item 6 above).
- **Environment note**: sandbox has NO Docker (27 Testcontainers tests
  skip, expected); dotnet SDK 9.0.320 at /home/z/.dotnet (export
  PATH=/home/z/.dotnet:$PATH); pnpm 9.12.0 via corepack at
  /home/z/.corepack-bin; clone at /home/z/cms-work/cms-platform-manus;
  the Next.js scaffold at /home/z/my-project is UNRELATED to this repo.
