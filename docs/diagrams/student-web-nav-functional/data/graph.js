window.__GRAPH_DATA = {
 "meta": {
  "title": "خريطة تنقل منصة الطالب — student-web functional navigation",
  "reconstructed": true,
  "note": "Wave C reconstruction: the original graph.json was never committed (the generic data/ .gitignore rule excluded it). Nodes recovered verbatim from the committed graph.svg; edges rebuilt from docs/student-web-navigation-recon.md §3 and reconciled with the post-Wave-C reality (logical back, legal→/dashboard, SPA anchors, official /stats placement in the Profile).",
  "routerCoverage": "37/37 router.tsx routes present"
 },
 "nodes": [
  {
   "id": "chrome-shell",
   "class": "shell",
   "labelAr": "قشرة التنقل",
   "labelEn": "قشرة التنقل",
   "label": "قشرة التنقل",
   "path": "(shell)",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "pathtrail-pattern",
   "class": "shell",
   "labelAr": "نمط موحّد: الرئيسية",
   "labelEn": "نمط موحّد: الرئيسية",
   "label": "نمط موحّد: الرئيسية",
   "path": "(pattern)",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "login",
   "class": "auth",
   "labelAr": "تسجيل الدخول",
   "labelEn": "تسجيل الدخول",
   "label": "تسجيل الدخول",
   "path": "/login",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "register",
   "class": "auth",
   "labelAr": "إنشاء حساب جديد",
   "labelEn": "إنشاء حساب جديد",
   "label": "إنشاء حساب جديد",
   "path": "/register",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "verify-otp",
   "class": "flag_gated",
   "labelAr": "التحقق من الرقم",
   "labelEn": "التحقق من الرقم",
   "label": "التحقق من الرقم",
   "path": "/verify-otp",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "forgot-password",
   "class": "auth",
   "labelAr": "نسيت كلمة المرور؟",
   "labelEn": "نسيت كلمة المرور؟",
   "label": "نسيت كلمة المرور؟",
   "path": "/forgot-password",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "reset-password",
   "class": "nested",
   "labelAr": "إعادة تعيين المرور",
   "labelEn": "إعادة تعيين المرور",
   "label": "إعادة تعيين المرور",
   "path": "/reset-password",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "terms",
   "class": "auth",
   "labelAr": "الشروط والأحكام",
   "labelEn": "الشروط والأحكام",
   "label": "الشروط والأحكام",
   "path": "/terms",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "privacy",
   "class": "auth",
   "labelAr": "سياسة الخصوصية",
   "labelEn": "سياسة الخصوصية",
   "label": "سياسة الخصوصية",
   "path": "/privacy",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "contact",
   "class": "auth",
   "labelAr": "تواصل معنا",
   "labelEn": "تواصل معنا",
   "label": "تواصل معنا",
   "path": "/contact",
   "component": "",
   "lane": "A",
   "notes": ""
  },
  {
   "id": "dashboard",
   "class": "primary",
   "labelAr": "الرئيسية",
   "labelEn": "الرئيسية",
   "label": "الرئيسية",
   "path": "/dashboard",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "study",
   "class": "primary",
   "labelAr": "دراستي",
   "labelEn": "دراستي",
   "label": "دراستي",
   "path": "/study",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "subjects",
   "class": "primary",
   "labelAr": "المواد",
   "labelEn": "المواد",
   "label": "المواد",
   "path": "/subjects",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "exams",
   "class": "primary",
   "labelAr": "الاختبارات",
   "labelEn": "الاختبارات",
   "label": "الاختبارات",
   "path": "/exams",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "leaderboard",
   "class": "primary",
   "labelAr": "لوحة الصدارة",
   "labelEn": "لوحة الصدارة",
   "label": "لوحة الصدارة",
   "path": "/leaderboard",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "favorites",
   "class": "primary",
   "labelAr": "المفضلة",
   "labelEn": "المفضلة",
   "label": "المفضلة",
   "path": "/favorites",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "profile",
   "class": "primary",
   "labelAr": "حسابي",
   "labelEn": "حسابي",
   "label": "حسابي",
   "path": "/profile",
   "component": "",
   "lane": "B",
   "notes": ""
  },
  {
   "id": "notifications-dropdown",
   "class": "chrome",
   "labelAr": "لوحة الإشعارات المنسدلة",
   "labelEn": "لوحة الإشعارات المنسدلة",
   "label": "لوحة الإشعارات المنسدلة",
   "path": "(dropdown)",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "notifications",
   "class": "nested",
   "labelAr": "الإشعارات (الصفحة الكامل…",
   "labelEn": "الإشعارات (الصفحة الكامل…",
   "label": "الإشعارات (الصفحة الكامل…",
   "path": "/notifications",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "search",
   "class": "chrome",
   "labelAr": "البحث",
   "labelEn": "البحث",
   "label": "البحث",
   "path": "/search",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "offline-panel",
   "class": "chrome",
   "labelAr": "وضع بدون إنترنت",
   "labelEn": "وضع بدون إنترنت",
   "label": "وضع بدون إنترنت",
   "path": "(panel)",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "stats",
   "class": "chrome",
   "labelAr": "إحصائياتي",
   "labelEn": "إحصائياتي",
   "label": "إحصائياتي",
   "path": "/stats",
   "component": "",
   "notes": "Wave C: official placement — the Profile quick-link «إحصاءاتي» is the primary entry (plus the leaderboard breadcrumb pair). Formerly orphan (recon §4.4).",
   "lane": "F"
  },
  {
   "id": "settings",
   "class": "nested",
   "labelAr": "الإعدادات",
   "labelEn": "الإعدادات",
   "label": "الإعدادات",
   "path": "/settings",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "activate-code",
   "class": "nested",
   "labelAr": "تفعيل كود",
   "labelEn": "تفعيل كود",
   "label": "تفعيل كود",
   "path": "/activate-code",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "notfound",
   "class": "nested",
   "labelAr": "الصفحة غير موجودة",
   "labelEn": "الصفحة غير موجودة",
   "label": "الصفحة غير موجودة",
   "path": "/* (404)",
   "component": "",
   "lane": "F",
   "notes": ""
  },
  {
   "id": "study-progress",
   "class": "nested",
   "labelAr": "تقدّمي",
   "labelEn": "تقدّمي",
   "label": "تقدّمي",
   "path": "/study?tab=progress",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "study-content",
   "class": "nested",
   "labelAr": "المحتوى",
   "labelEn": "المحتوى",
   "label": "المحتوى",
   "path": "/study?tab=content",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "study-library",
   "class": "nested",
   "labelAr": "المكتبة",
   "labelEn": "المكتبة",
   "label": "المكتبة",
   "path": "/study?tab=library",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "study-bank",
   "class": "nested",
   "labelAr": "بنك الأسئلة",
   "labelEn": "بنك الأسئلة",
   "label": "بنك الأسئلة",
   "path": "/study?tab=bank",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "study-courses",
   "class": "nested",
   "labelAr": "الكورسات",
   "labelEn": "الكورسات",
   "label": "الكورسات",
   "path": "/study?tab=courses",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "bank-detail",
   "class": "nested",
   "labelAr": "تفاصيل حزمة امتحانية",
   "labelEn": "تفاصيل حزمة امتحانية",
   "label": "تفاصيل حزمة امتحانية",
   "path": "/study?tab=bank&courseId=",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "bank-notice-modal",
   "class": "nested",
   "labelAr": "تنويه قبل التدريب",
   "labelEn": "تنويه قبل التدريب",
   "label": "تنويه قبل التدريب",
   "path": "(modal)",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "training-builder",
   "class": "nested",
   "labelAr": "بانِي اختبار تدريبي",
   "labelEn": "بانِي اختبار تدريبي",
   "label": "بانِي اختبار تدريبي",
   "path": "(modal)",
   "component": "",
   "lane": "C",
   "notes": ""
  },
  {
   "id": "subject-modal",
   "class": "nested",
   "labelAr": "نافذة خيارات المادة",
   "labelEn": "نافذة خيارات المادة",
   "label": "نافذة خيارات المادة",
   "path": "(bottom sheet)",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "subject-detail",
   "class": "nested",
   "labelAr": "صفحة المادة",
   "labelEn": "صفحة المادة",
   "label": "صفحة المادة",
   "path": "/subjects/:slug",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "lecture",
   "class": "nested",
   "labelAr": "المحاضرة",
   "labelEn": "المحاضرة",
   "label": "المحاضرة",
   "path": "/subjects/:slug/lectures/:id",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "lecture-questions",
   "class": "nested",
   "labelAr": "أسئلة المحاضرة",
   "labelEn": "أسئلة المحاضرة",
   "label": "أسئلة المحاضرة",
   "path": "/subjects/:slug/lectures/:id/q…",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "question-single",
   "class": "nested",
   "labelAr": "سؤال مفرد",
   "labelEn": "سؤال مفرد",
   "label": "سؤال مفرد",
   "path": "/subjects/:slug/questions/:id",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "subject-library",
   "class": "nested",
   "labelAr": "مكتبة المادة",
   "labelEn": "مكتبة المادة",
   "label": "مكتبة المادة",
   "path": "/subjects/:slug/library",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "player",
   "class": "nested",
   "labelAr": "مشغّل الكورس",
   "labelEn": "مشغّل الكورس",
   "label": "مشغّل الكورس",
   "path": "/my-studies/courses/:courseId",
   "component": "",
   "lane": "D",
   "notes": ""
  },
  {
   "id": "exam-run",
   "class": "nested",
   "labelAr": "تنفيذ الاختبار",
   "labelEn": "تنفيذ الاختبار",
   "label": "تنفيذ الاختبار",
   "path": "/exams/:examId",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "exam-review",
   "class": "nested",
   "labelAr": "مراجعة الاختبار",
   "labelEn": "مراجعة الاختبار",
   "label": "مراجعة الاختبار",
   "path": "/exams/:sessionId/review",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "practice-exam",
   "class": "nested",
   "labelAr": "جلسة تدريب (نموذج)",
   "labelEn": "جلسة تدريب (نموذج)",
   "label": "جلسة تدريب (نموذج)",
   "path": "/practice/exam/:examModelId",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "practice-categorized",
   "class": "nested",
   "labelAr": "جلسة تدريب (مصنّف)",
   "labelEn": "جلسة تدريب (مصنّف)",
   "label": "جلسة تدريب (مصنّف)",
   "path": "/practice/categorized/:subject…",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "exams-catalog",
   "class": "nested",
   "labelAr": "فهرس الاختبارات",
   "labelEn": "فهرس الاختبارات",
   "label": "فهرس الاختبارات",
   "path": "(inside /exams)",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "practice-catalog",
   "class": "nested",
   "labelAr": "فهرس التدريب",
   "labelEn": "فهرس التدريب",
   "label": "فهرس التدريب",
   "path": "(inside /exams?subtab=practice)",
   "component": "",
   "lane": "E",
   "notes": ""
  },
  {
   "id": "legacy-root",
   "class": "legacy",
   "labelAr": "الجذر (تحويل)",
   "labelEn": "الجذر (تحويل)",
   "label": "الجذر (تحويل)",
   "path": "ميت",
   "component": "",
   "lane": "G",
   "notes": ""
  },
  {
   "id": "legacy-library",
   "class": "legacy",
   "labelAr": "المكتبة (قديم)",
   "labelEn": "المكتبة (قديم)",
   "label": "المكتبة (قديم)",
   "path": "ميت",
   "component": "",
   "lane": "G",
   "notes": ""
  },
  {
   "id": "legacy-practice",
   "class": "legacy",
   "labelAr": "التدريب (قديم)",
   "labelEn": "التدريب (قديم)",
   "label": "التدريب (قديم)",
   "path": "ميت",
   "component": "",
   "lane": "G",
   "notes": ""
  },
  {
   "id": "legacy-my-studies",
   "class": "legacy",
   "labelAr": "دراستي القديم (تح…",
   "labelEn": "دراستي القديم (تح…",
   "label": "دراستي القديم (تح…",
   "path": "ميت",
   "component": "",
   "lane": "G",
   "notes": ""
  },
  {
   "id": "legacy-exam-courses",
   "class": "legacy",
   "labelAr": "الدورات الامتحاني…",
   "labelEn": "الدورات الامتحاني…",
   "label": "الدورات الامتحاني…",
   "path": "ميت",
   "component": "",
   "lane": "G",
   "notes": ""
  },
  {
   "id": "legacy-back",
   "class": "legacy",
   "labelAr": "أزرار عودة تعتمد…",
   "labelEn": "أزرار عودة تعتمد…",
   "label": "أزرار عودة تعتمد…",
   "path": "ميت",
   "component": "",
   "notes": "Wave C: RESOLVED — the five deep pages now use useLogicalBack (PathTrail parent policy); on direct URL entry the back control lands on the page's logical parent, never outside the app.",
   "lane": "G"
  },
  {
   "id": "deprecated-player-test",
   "class": "deprecated",
   "labelAr": "ملعب المشغّل (محذ…",
   "labelEn": "ملعب المشغّل (محذ…",
   "label": "ملعب المشغّل (محذ…",
   "path": "محذوف",
   "component": "",
   "lane": "G",
   "notes": ""
  }
 ],
 "edges": [
  {
   "id": "e1",
   "from": "chrome-shell",
   "to": "dashboard",
   "triggerAr": "الشعار (Navbar)",
   "triggerEn": "الشعار (Navbar)",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e2",
   "from": "chrome-shell",
   "to": "search",
   "triggerAr": "البحث في الشريط (Enter/أيقونة)",
   "triggerEn": "البحث في الشريط (Enter/أيقونة)",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e3",
   "from": "chrome-shell",
   "to": "notifications-dropdown",
   "triggerAr": "الجرس",
   "triggerEn": "الجرس",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e4",
   "from": "notifications-dropdown",
   "to": "notifications",
   "triggerAr": "«عرض الكل»",
   "triggerEn": "«عرض الكل»",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e5",
   "from": "chrome-shell",
   "to": "profile",
   "triggerAr": "الصورة الرمزية",
   "triggerEn": "الصورة الرمزية",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e6",
   "from": "chrome-shell",
   "to": "dashboard",
   "triggerAr": "القائمة الجانبية: الرئيسية",
   "triggerEn": "القائمة الجانبية: الرئيسية",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e7",
   "from": "chrome-shell",
   "to": "study",
   "triggerAr": "القائمة الجانبية: دراستي",
   "triggerEn": "القائمة الجانبية: دراستي",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e8",
   "from": "chrome-shell",
   "to": "subjects",
   "triggerAr": "القائمة الجانبية: المواد",
   "triggerEn": "القائمة الجانبية: المواد",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e9",
   "from": "chrome-shell",
   "to": "exams",
   "triggerAr": "القائمة الجانبية: الاختبارات",
   "triggerEn": "القائمة الجانبية: الاختبارات",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e10",
   "from": "chrome-shell",
   "to": "leaderboard",
   "triggerAr": "القائمة الجانبية: لوحة الصدارة",
   "triggerEn": "القائمة الجانبية: لوحة الصدارة",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e11",
   "from": "chrome-shell",
   "to": "favorites",
   "triggerAr": "القائمة الجانبية: المفضلة",
   "triggerEn": "القائمة الجانبية: المفضلة",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e12",
   "from": "chrome-shell",
   "to": "profile",
   "triggerAr": "القائمة الجانبية/الشريط السفلي: حسابي",
   "triggerEn": "القائمة الجانبية/الشريط السفلي: حسابي",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e13",
   "from": "chrome-shell",
   "to": "study-library",
   "triggerAr": "الموارد: المكتبة",
   "triggerEn": "الموارد: المكتبة",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e14",
   "from": "chrome-shell",
   "to": "study-courses",
   "triggerAr": "الموارد: الكورسات",
   "triggerEn": "الموارد: الكورسات",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e15",
   "from": "chrome-shell",
   "to": "study-bank",
   "triggerAr": "الموارد: بنك الأسئلة",
   "triggerEn": "الموارد: بنك الأسئلة",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e16",
   "from": "chrome-shell",
   "to": "offline-panel",
   "triggerAr": "زر «وضع بدون إنترنت»",
   "triggerEn": "زر «وضع بدون إنترنت»",
   "kind": "chrome",
   "isDeadOrConfusing": false
  },
  {
   "id": "e17",
   "from": "pathtrail-pattern",
   "to": "dashboard",
   "triggerAr": "نمط «الرئيسية» في مسار التنقل (كل الصفحات)",
   "triggerEn": "نمط «الرئيسية» في مسار التنقل (كل الصفحات)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e18",
   "from": "login",
   "to": "dashboard",
   "triggerAr": "دخول ناجح (?next أو الرئيسية)",
   "triggerEn": "دخول ناجح (?next أو الرئيسية)",
   "kind": "primary",
   "isDeadOrConfusing": false
  },
  {
   "id": "e19",
   "from": "notifications",
   "to": "dashboard",
   "triggerAr": "مسار التنقل «الرئيسية»",
   "triggerEn": "مسار التنقل «الرئيسية»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e20",
   "from": "login",
   "to": "forgot-password",
   "triggerAr": "«نسيت كلمة المرور؟»",
   "triggerEn": "«نسيت كلمة المرور؟»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e21",
   "from": "login",
   "to": "register",
   "triggerAr": "«أنشئ حساباً جديداً»",
   "triggerEn": "«أنشئ حساباً جديداً»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e22",
   "from": "login",
   "to": "terms",
   "triggerAr": "تذييل: الشروط",
   "triggerEn": "تذييل: الشروط",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e23",
   "from": "login",
   "to": "privacy",
   "triggerAr": "تذييل: الخصوصية",
   "triggerEn": "تذييل: الخصوصية",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e24",
   "from": "login",
   "to": "contact",
   "triggerAr": "تذييل: تواصل معنا",
   "triggerEn": "تذييل: تواصل معنا",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e25",
   "from": "register",
   "to": "verify-otp",
   "triggerAr": "بعد التسجيل (otpRequired && otpRouteEnabled)",
   "triggerEn": "بعد التسجيل (otpRequired && otpRouteEnabled)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e26",
   "from": "register",
   "to": "login",
   "triggerAr": "بعد التسجيل / «سجّل دخولك»",
   "triggerEn": "بعد التسجيل / «سجّل دخولك»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e27",
   "from": "register",
   "to": "terms",
   "triggerAr": "«الشروط» — SPA Link (Wave C: كان <a> تحديث كامل)",
   "triggerEn": "«الشروط» — SPA Link (Wave C: كان <a> تحديث كامل)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e28",
   "from": "register",
   "to": "privacy",
   "triggerAr": "«سياسة الخصوصية» — SPA Link (Wave C)",
   "triggerEn": "«سياسة الخصوصية» — SPA Link (Wave C)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e29",
   "from": "register",
   "to": "contact",
   "triggerAr": "«تواصل معنا»",
   "triggerEn": "«تواصل معنا»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e30",
   "from": "forgot-password",
   "to": "reset-password",
   "triggerAr": "«إعادة تعيين» بعد إرسال الرمز (state: phone)",
   "triggerEn": "«إعادة تعيين» بعد إرسال الرمز (state: phone)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e31",
   "from": "forgot-password",
   "to": "login",
   "triggerAr": "«العودة لتسجيل الدخول»",
   "triggerEn": "«العودة لتسجيل الدخول»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e32",
   "from": "reset-password",
   "to": "login",
   "triggerAr": "بعد إعادة تعيين ناجحة",
   "triggerEn": "بعد إعادة تعيين ناجحة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e33",
   "from": "reset-password",
   "to": "forgot-password",
   "triggerAr": "تحويل تلقائي (لا state.phone)",
   "triggerEn": "تحويل تلقائي (لا state.phone)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e34",
   "from": "verify-otp",
   "to": "dashboard",
   "triggerAr": "تحقق ناجح",
   "triggerEn": "تحقق ناجح",
   "kind": "primary",
   "isDeadOrConfusing": false
  },
  {
   "id": "e35",
   "from": "verify-otp",
   "to": "register",
   "triggerAr": "تحويل تلقائي (لا state) / «تغيير الرقم»",
   "triggerEn": "تحويل تلقائي (لا state) / «تغيير الرقم»",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e36",
   "from": "dashboard",
   "to": "favorites",
   "triggerAr": "بطاقة «المفضلة: n»",
   "triggerEn": "بطاقة «المفضلة: n»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e37",
   "from": "dashboard",
   "to": "subjects",
   "triggerAr": "«تصفح المواد» (رأس قسم موادي)",
   "triggerEn": "«تصفح المواد» (رأس قسم موادي)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e38",
   "from": "dashboard",
   "to": "activate-code",
   "triggerAr": "زر حالة فارغة «تفعيل كود»",
   "triggerEn": "زر حالة فارغة «تفعيل كود»",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e39",
   "from": "dashboard",
   "to": "study",
   "triggerAr": "«أكمل الدراسة» → نافذة خيارات المادة",
   "triggerEn": "«أكمل الدراسة» → نافذة خيارات المادة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e40",
   "from": "dashboard",
   "to": "study-library",
   "triggerAr": "لوحة المكتبة (+subjectId)",
   "triggerEn": "لوحة المكتبة (+subjectId)",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e41",
   "from": "dashboard",
   "to": "study-courses",
   "triggerAr": "لوحة الكورسات (+subjectId)",
   "triggerEn": "لوحة الكورسات (+subjectId)",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e42",
   "from": "dashboard",
   "to": "study-bank",
   "triggerAr": "لوحة بنك الأسئلة (+subjectId)",
   "triggerEn": "لوحة بنك الأسئلة (+subjectId)",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e43",
   "from": "dashboard",
   "to": "subject-modal",
   "triggerAr": "CTA «أكمل الدراسة»",
   "triggerEn": "CTA «أكمل الدراسة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e44",
   "from": "subject-modal",
   "to": "subject-detail",
   "triggerAr": "«المحتوى»",
   "triggerEn": "«المحتوى»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e45",
   "from": "subject-modal",
   "to": "study-bank",
   "triggerAr": "«بنك الأسئلة» (subjectId)",
   "triggerEn": "«بنك الأسئلة» (subjectId)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e46",
   "from": "subject-modal",
   "to": "study-library",
   "triggerAr": "«المكتبة» (subjectId)",
   "triggerEn": "«المكتبة» (subjectId)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e47",
   "from": "subject-modal",
   "to": "study-courses",
   "triggerAr": "«الكورسات» (subjectId)",
   "triggerEn": "«الكورسات» (subjectId)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e48",
   "from": "subjects",
   "to": "subject-detail",
   "triggerAr": "بطاقة مادة (شريط موادي)",
   "triggerEn": "بطاقة مادة (شريط موادي)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e49",
   "from": "subjects",
   "to": "activate-code",
   "triggerAr": "زر حالة فارغة «تفعيل كود»",
   "triggerEn": "زر حالة فارغة «تفعيل كود»",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e50",
   "from": "subjects",
   "to": "study",
   "triggerAr": "بطاقة مادة → نافذة الخيارات",
   "triggerEn": "بطاقة مادة → نافذة الخيارات",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e51",
   "from": "subjects",
   "to": "subject-modal",
   "triggerAr": "«فتح» (مادة مفعّلة)",
   "triggerEn": "«فتح» (مادة مفعّلة)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e52",
   "from": "subjects",
   "to": "activate-code",
   "triggerAr": "«تفعيل كود» (غير مفعّلة)",
   "triggerEn": "«تفعيل كود» (غير مفعّلة)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e53",
   "from": "subject-detail",
   "to": "subjects",
   "triggerAr": "«تصفّح المواد المتاحة» (403) / «العودة إلى المواد» (404)",
   "triggerEn": "«تصفّح المواد المتاحة» (403) / «العودة إلى المواد» (404)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e54",
   "from": "subject-detail",
   "to": "lecture",
   "triggerAr": "بطاقة محاضرة (نطاق المحاضرات)",
   "triggerEn": "بطاقة محاضرة (نطاق المحاضرات)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e55",
   "from": "subject-detail",
   "to": "subject-library",
   "triggerAr": "تبويب «المكتبة»",
   "triggerEn": "تبويب «المكتبة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e56",
   "from": "subject-detail",
   "to": "study-courses",
   "triggerAr": "تبويب «الكورسات»",
   "triggerEn": "تبويب «الكورسات»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e57",
   "from": "subject-detail",
   "to": "study-bank",
   "triggerAr": "تبويب «بنك الأسئلة»",
   "triggerEn": "تبويب «بنك الأسئلة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e58",
   "from": "subject-detail",
   "to": "activate-code",
   "triggerAr": "رابط «تفعيل كود» (محاضرات مقفلة)",
   "triggerEn": "رابط «تفعيل كود» (محاضرات مقفلة)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e59",
   "from": "lecture",
   "to": "lecture-questions",
   "triggerAr": "«بدء الأسئلة (n)»",
   "triggerEn": "«بدء الأسئلة (n)»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e60",
   "from": "lecture",
   "to": "dashboard",
   "triggerAr": "مسار داخلي «الرئيسية»",
   "triggerEn": "مسار داخلي «الرئيسية»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e61",
   "from": "lecture",
   "to": "subject-detail",
   "triggerAr": "مسار داخلي «المادة» / «عودة» (Wave C: رجوع منطقي)",
   "triggerEn": "مسار داخلي «المادة» / «عودة» (Wave C: رجوع منطقي)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e62",
   "from": "lecture",
   "to": "activate-code",
   "triggerAr": "رابط «تفعيل كود» (ملفات 403)",
   "triggerEn": "رابط «تفعيل كود» (ملفات 403)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e63",
   "from": "subject-library",
   "to": "lecture",
   "triggerAr": "بطاقة محاضرة",
   "triggerEn": "بطاقة محاضرة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e64",
   "from": "question-single",
   "to": "activate-code",
   "triggerAr": "رابط «فعّل كوداً» (خيارات 403)",
   "triggerEn": "رابط «فعّل كوداً» (خيارات 403)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e65",
   "from": "lecture-questions",
   "to": "lecture",
   "triggerAr": "«العودة» (Wave C: رجوع منطقي للمحاضرة)",
   "triggerEn": "«العودة» (Wave C: رجوع منطقي للمحاضرة)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e66",
   "from": "lecture-questions",
   "to": "activate-code",
   "triggerAr": "LockedEmptyState (أسئلة مقفلة)",
   "triggerEn": "LockedEmptyState (أسئلة مقفلة)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e67",
   "from": "study",
   "to": "study-progress",
   "triggerAr": "تبويب «تقدّمي»",
   "triggerEn": "تبويب «تقدّمي»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e68",
   "from": "study",
   "to": "study-content",
   "triggerAr": "تبويب «المحتوى»",
   "triggerEn": "تبويب «المحتوى»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e69",
   "from": "study",
   "to": "study-library",
   "triggerAr": "تبويب «المكتبة»",
   "triggerEn": "تبويب «المكتبة»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e70",
   "from": "study",
   "to": "study-bank",
   "triggerAr": "تبويب «بنك الأسئلة»",
   "triggerEn": "تبويب «بنك الأسئلة»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e71",
   "from": "study",
   "to": "study-courses",
   "triggerAr": "تبويب «الكورسات»",
   "triggerEn": "تبويب «الكورسات»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e72",
   "from": "study-progress",
   "to": "exams",
   "triggerAr": "تحويل متقاعد ?tab=exams",
   "triggerEn": "تحويل متقاعد ?tab=exams",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e73",
   "from": "study-progress",
   "to": "leaderboard",
   "triggerAr": "تحويل متقاعد ?tab=leaderboard",
   "triggerEn": "تحويل متقاعد ?tab=leaderboard",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e74",
   "from": "study-progress",
   "to": "study",
   "triggerAr": "تحويل متقاعد ?tab=overview",
   "triggerEn": "تحويل متقاعد ?tab=overview",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e75",
   "from": "study-content",
   "to": "subject-detail",
   "triggerAr": "زر «صفحة المادة»",
   "triggerEn": "زر «صفحة المادة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e76",
   "from": "study-content",
   "to": "lecture",
   "triggerAr": "بطاقة محاضرة",
   "triggerEn": "بطاقة محاضرة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e77",
   "from": "study-content",
   "to": "activate-code",
   "triggerAr": "LockedEmptyState",
   "triggerEn": "LockedEmptyState",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e78",
   "from": "study-courses",
   "to": "player",
   "triggerAr": "بطاقة كورس (نطاق فيديو/صوت)",
   "triggerEn": "بطاقة كورس (نطاق فيديو/صوت)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e79",
   "from": "study-courses",
   "to": "subjects",
   "triggerAr": "زر حالة فارغة «تصفح المواد»",
   "triggerEn": "زر حالة فارغة «تصفح المواد»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e80",
   "from": "study-courses",
   "to": "activate-code",
   "triggerAr": "بطاقة رفض (لا منح)",
   "triggerEn": "بطاقة رفض (لا منح)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e81",
   "from": "study-bank",
   "to": "training-builder",
   "triggerAr": "«بناء اختبار تدريبي»",
   "triggerEn": "«بناء اختبار تدريبي»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e82",
   "from": "study-bank",
   "to": "bank-detail",
   "triggerAr": "بطاقة حزمة (courseId)",
   "triggerEn": "بطاقة حزمة (courseId)",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e83",
   "from": "study-bank",
   "to": "bank-notice-modal",
   "triggerAr": "نافذة «تنويه» قبل التدريب",
   "triggerEn": "نافذة «تنويه» قبل التدريب",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e84",
   "from": "study-bank",
   "to": "activate-code",
   "triggerAr": "LockedEmptyState",
   "triggerEn": "LockedEmptyState",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e85",
   "from": "bank-detail",
   "to": "study-bank",
   "triggerAr": "«العودة إلى بنك الأسئلة»",
   "triggerEn": "«العودة إلى بنك الأسئلة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e86",
   "from": "bank-detail",
   "to": "practice-exam",
   "triggerAr": "زر «تدريب»",
   "triggerEn": "زر «تدريب»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e87",
   "from": "bank-detail",
   "to": "exam-run",
   "triggerAr": "زر «اختبار»",
   "triggerEn": "زر «اختبار»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e88",
   "from": "training-builder",
   "to": "practice-categorized",
   "triggerAr": "«ابدأ التدريب» بعد السحب",
   "triggerEn": "«ابدأ التدريب» بعد السحب",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e89",
   "from": "training-builder",
   "to": "activate-code",
   "triggerAr": "رابط رفض",
   "triggerEn": "رابط رفض",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e90",
   "from": "player",
   "to": "study-courses",
   "triggerAr": "بطاقة خطأ / مسار «دراستي»",
   "triggerEn": "بطاقة خطأ / مسار «دراستي»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e91",
   "from": "exams",
   "to": "exams-catalog",
   "triggerAr": "تبويب «الاختبارات»",
   "triggerEn": "تبويب «الاختبارات»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e92",
   "from": "exams",
   "to": "practice-catalog",
   "triggerAr": "تبويب «التدريب»",
   "triggerEn": "تبويب «التدريب»",
   "kind": "url_state",
   "isDeadOrConfusing": false
  },
  {
   "id": "e93",
   "from": "exams-catalog",
   "to": "exam-run",
   "triggerAr": "صف اختبار (رابط كامل)",
   "triggerEn": "صف اختبار (رابط كامل)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e94",
   "from": "exams-catalog",
   "to": "study-bank",
   "triggerAr": "CTA «انتقل إلى بنك الأسئلة» (فارغ)",
   "triggerEn": "CTA «انتقل إلى بنك الأسئلة» (فارغ)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e95",
   "from": "exams-catalog",
   "to": "activate-code",
   "triggerAr": "بطاقات رفض / مقفلة",
   "triggerEn": "بطاقات رفض / مقفلة",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e96",
   "from": "exam-run",
   "to": "exam-review",
   "triggerAr": "«مراجعة الأسئلة» (canReview)",
   "triggerEn": "«مراجعة الأسئلة» (canReview)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e97",
   "from": "exam-run",
   "to": "exams",
   "triggerAr": "«العودة للمادة» (Wave C: رجوع منطقي لفهرس الاختبارات)",
   "triggerEn": "«العودة للمادة» (Wave C: رجوع منطقي لفهرس الاختبارات)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e98",
   "from": "exam-review",
   "to": "exams",
   "triggerAr": "«العودة للنتائج» (Wave C: رجوع منطقي)",
   "triggerEn": "«العودة للنتائج» (Wave C: رجوع منطقي)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e99",
   "from": "practice-catalog",
   "to": "lecture-questions",
   "triggerAr": "بطاقة محاضرة تدريب",
   "triggerEn": "بطاقة محاضرة تدريب",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e100",
   "from": "practice-catalog",
   "to": "activate-code",
   "triggerAr": "بطاقات رفض",
   "triggerEn": "بطاقات رفض",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e101",
   "from": "practice-catalog",
   "to": "login",
   "triggerAr": "بطاقة رفض (جهاز)",
   "triggerEn": "بطاقة رفض (جهاز)",
   "kind": "guard",
   "isDeadOrConfusing": false
  },
  {
   "id": "e102",
   "from": "practice-exam",
   "to": "study-bank",
   "triggerAr": "«العودة» (Wave C: رجوع منطقي)",
   "triggerEn": "«العودة» (Wave C: رجوع منطقي)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e103",
   "from": "practice-categorized",
   "to": "study-bank",
   "triggerAr": "«العودة إلى التصنيفات» (جلسة فارغة)",
   "triggerEn": "«العودة إلى التصنيفات» (جلسة فارغة)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e104",
   "from": "practice-categorized",
   "to": "exams",
   "triggerAr": "«العودة» (Wave C: رجوع منطقي لفهرس التدريب)",
   "triggerEn": "«العودة» (Wave C: رجوع منطقي لفهرس التدريب)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e105",
   "from": "search",
   "to": "lecture",
   "triggerAr": "بطاقة نتيجة محاضرة",
   "triggerEn": "بطاقة نتيجة محاضرة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e106",
   "from": "search",
   "to": "lecture-questions",
   "triggerAr": "نتيجة سؤال (مع lectureId، focus)",
   "triggerEn": "نتيجة سؤال (مع lectureId، focus)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e107",
   "from": "search",
   "to": "question-single",
   "triggerAr": "نتيجة سؤال (بدون lectureId)",
   "triggerEn": "نتيجة سؤال (بدون lectureId)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e108",
   "from": "search",
   "to": "subject-detail",
   "triggerAr": "بطاقة نتيجة مادة",
   "triggerEn": "بطاقة نتيجة مادة",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e109",
   "from": "favorites",
   "to": "player",
   "triggerAr": "بطاقة حلقة (episode)",
   "triggerEn": "بطاقة حلقة (episode)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e110",
   "from": "favorites",
   "to": "question-single",
   "triggerAr": "«عرض السؤال»",
   "triggerEn": "«عرض السؤال»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e111",
   "from": "favorites",
   "to": "subject-library",
   "triggerAr": "«فتح الملف» (openFile)",
   "triggerEn": "«فتح الملف» (openFile)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e112",
   "from": "favorites",
   "to": "subjects",
   "triggerAr": "CTA حالة فارغة «تصفح المواد»",
   "triggerEn": "CTA حالة فارغة «تصفح المواد»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e113",
   "from": "favorites",
   "to": "study-bank",
   "triggerAr": "CTA حالة فارغة «بنك الأسئلة»",
   "triggerEn": "CTA حالة فارغة «بنك الأسئلة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e114",
   "from": "favorites",
   "to": "study-library",
   "triggerAr": "CTA حالة فارغة «المكتبة»",
   "triggerEn": "CTA حالة فارغة «المكتبة»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e115",
   "from": "favorites",
   "to": "study-courses",
   "triggerAr": "CTA حالة فارغة «الكورسات»",
   "triggerEn": "CTA حالة فارغة «الكورسات»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e116",
   "from": "stats",
   "to": "leaderboard",
   "triggerAr": "لافتة «🏆 لوحة المتصدرين»",
   "triggerEn": "لافتة «🏆 لوحة المتصدرين»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e117",
   "from": "leaderboard",
   "to": "stats",
   "triggerAr": "مسار «الإحصائيات»",
   "triggerEn": "مسار «الإحصائيات»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e118",
   "from": "profile",
   "to": "activate-code",
   "triggerAr": "بطاقة «تفعيل كود»",
   "triggerEn": "بطاقة «تفعيل كود»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e119",
   "from": "profile",
   "to": "settings",
   "triggerAr": "بطاقة «الإعدادات»",
   "triggerEn": "بطاقة «الإعدادات»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e120",
   "from": "profile",
   "to": "stats",
   "triggerAr": "بطاقة «إحصاءاتي» (Wave C: الموضع الرسمي لإحصاءات الطالب)",
   "triggerEn": "بطاقة «إحصاءاتي» (Wave C: الموضع الرسمي لإحصاءات الطالب)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e121",
   "from": "profile",
   "to": "login",
   "triggerAr": "«تسجيل الخروج» → window.location.assign",
   "triggerEn": "«تسجيل الخروج» → window.location.assign",
   "kind": "hard_reload",
   "isDeadOrConfusing": false
  },
  {
   "id": "e122",
   "from": "settings",
   "to": "terms",
   "triggerAr": "صف الشروط",
   "triggerEn": "صف الشروط",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e123",
   "from": "settings",
   "to": "privacy",
   "triggerAr": "صف الخصوصية",
   "triggerEn": "صف الخصوصية",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e124",
   "from": "settings",
   "to": "contact",
   "triggerAr": "صف تواصل",
   "triggerEn": "صف تواصل",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e125",
   "from": "activate-code",
   "to": "dashboard",
   "triggerAr": "تحويل تلقائي بعد التفعيل + «العودة للوحة»",
   "triggerEn": "تحويل تلقائي بعد التفعيل + «العودة للوحة»",
   "kind": "primary",
   "isDeadOrConfusing": false
  },
  {
   "id": "e126",
   "from": "notifications",
   "to": "dashboard",
   "triggerAr": "مسار «الرئيسية»",
   "triggerEn": "مسار «الرئيسية»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e127",
   "from": "terms",
   "to": "dashboard",
   "triggerAr": "«العودة للرئيسية» (Wave C: /dashboard مباشرة — كان / تحويل مزدوج)",
   "triggerEn": "«العودة للرئيسية» (Wave C: /dashboard مباشرة — كان / تحويل مزدوج)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e128",
   "from": "privacy",
   "to": "dashboard",
   "triggerAr": "«العودة للرئيسية» (Wave C)",
   "triggerEn": "«العودة للرئيسية» (Wave C)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e129",
   "from": "contact",
   "to": "dashboard",
   "triggerAr": "«العودة للرئيسية» (Wave C)",
   "triggerEn": "«العودة للرئيسية» (Wave C)",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e130",
   "from": "notfound",
   "to": "dashboard",
   "triggerAr": "«العودة للوحة التحكم»",
   "triggerEn": "«العودة للوحة التحكم»",
   "kind": "nested",
   "isDeadOrConfusing": false
  },
  {
   "id": "e131",
   "from": "legacy-root",
   "to": "dashboard",
   "triggerAr": "تحويل دائم / → /dashboard",
   "triggerEn": "تحويل دائم / → /dashboard",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e132",
   "from": "legacy-library",
   "to": "study-library",
   "triggerAr": "تحويل /library → /study?tab=library",
   "triggerEn": "تحويل /library → /study?tab=library",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e133",
   "from": "legacy-practice",
   "to": "practice-catalog",
   "triggerAr": "تحويل /practice → /exams?subtab=practice",
   "triggerEn": "تحويل /practice → /exams?subtab=practice",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e134",
   "from": "legacy-my-studies",
   "to": "study",
   "triggerAr": "MyStudiesRedirect (خرائط تبويبات)",
   "triggerEn": "MyStudiesRedirect (خرائط تبويبات)",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e135",
   "from": "legacy-exam-courses",
   "to": "study-bank",
   "triggerAr": "ExamCoursesRedirect → /study?tab=bank",
   "triggerEn": "ExamCoursesRedirect → /study?tab=bank",
   "kind": "legacy",
   "isDeadOrConfusing": true
  },
  {
   "id": "e136",
   "from": "legacy-back",
   "to": "exams",
   "triggerAr": "كان navigate(-1) في 5 صفحات — Wave C: رجوع منطقي useLogicalBack",
   "triggerEn": "كان navigate(-1) في 5 صفحات — Wave C: رجوع منطقي useLogicalBack",
   "kind": "legacy",
   "isDeadOrConfusing": true
  }
 ]
};
