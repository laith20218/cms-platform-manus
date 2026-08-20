# Web Route Reconciliation

> **منهجية:** مطابقة ساكنة بين `router.tsx` وروابط literal/template في source. لا تثبت هذه النتيجة rendering أو authorization أو payloads؛ تتطلب النتائج Browser E2E لاحقاً.

| Declared protected/public route |
|---|
| `/login` |
| `/register` |
| `/verify-otp` |
| `/forgot-password` |
| `/reset-password` |
| `/dashboard` |
| `/subjects` |
| `/subjects/:param` |
| `/subjects/:param/lectures/:param` |
| `/favorites` |
| `/exams/:param` |
| `/exams/:param/review` |
| `/subjects/:param/library` |
| `/search` |
| `/profile` |
| `/notifications` |
| `/admin/dashboard` |
| `/admin/reports` |
| `/stats` |
| `/leaderboard` |
| `/` |
| `*` |

## Navigation targets requiring reconciliation

| Target | Source | Status |
|---|---|---|
