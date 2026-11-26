"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// apps/admin-web/src/lib/questionLabels.ts
var questionLabels_exports = {};
__export(questionLabels_exports, {
  questionDifficultyLabel: () => questionDifficultyLabel,
  questionTypeLabel: () => questionTypeLabel
});
module.exports = __toCommonJS(questionLabels_exports);

// apps/admin-web/src/lib/dictionary/core.ts
var coreDict = {
  // ===== Login (preserved) =====
  login: {
    title: { ar: "\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629", en: "Sign in to the administration console" },
    description: { ar: "\u0623\u062F\u0631 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0648\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "Manage content, exams, and permissions within your academic scope." },
    email: { ar: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A", en: "Email address" },
    password: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", en: "Password" },
    submit: { ar: "\u062F\u062E\u0648\u0644 \u0622\u0645\u0646", en: "Secure sign in" },
    errorInvalid: { ar: "\u0627\u0644\u0628\u0631\u064A\u062F \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629", en: "Invalid email or password" },
    errorRequired: { ar: "\u0647\u0630\u0627 \u0627\u0644\u062D\u0642\u0644 \u0645\u0637\u0644\u0648\u0628", en: "This field is required" },
    securityNote: { ar: "\u0644\u0627 \u062A\u064F\u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D. \u064A\u0646\u062A\u0647\u064A \u0627\u0644\u0648\u0635\u0648\u0644 \u0639\u0646\u062F \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C.", en: "Credentials are not stored in the browser. Access ends when you sign out." },
    environment: { ar: "\u0628\u064A\u0626\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C", en: "Production environment" },
    heroLine1: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629", en: "Academic operations," },
    heroLine2: { ar: "\u0628\u062F\u0642\u0629 \u0645\u0624\u0633\u0633\u064A\u0629.", en: "institutional precision." },
    heroBody: { ar: "\u0631\u0627\u062C\u0639 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0642\u0628\u0644 \u0646\u0634\u0631 \u0623\u064A \u062A\u063A\u064A\u064A\u0631. \u0647\u0630\u0647 \u0642\u0646\u0627\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0624\u0633\u0633\u064A\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0637\u0628\u064A.", en: "Review access before publishing any change. This is the institutional operations channel for medical education." },
    systemReady: { ar: "\u0642\u0646\u0627\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0624\u0645\u0651\u0646\u0629", en: "Administration channel secured" },
    // PR-2 2FA login step (dictionary-sourced in PR-3).
    otpLabel: { ar: "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A (2FA)", en: "Two-factor code (2FA)" },
    otpHint: { ar: "\u0623\u062F\u062E\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0624\u0642\u062A \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0644\u062F\u064A\u0643 \u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062F\u062E\u0648\u0644.", en: "Enter the temporary code from your authenticator app to complete sign-in." },
    backToCredentials: { ar: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644", en: "Back to sign-in details" },
    // PR-3 — sign-in failure fallback (previously an inline Arabic literal).
    errorGeneric: { ar: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644.", en: "Could not verify the sign-in details." }
  },
  // ===== Navigation Groups (preserved) =====
  navGroups: {
    daily: { ar: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u064A\u0648\u0645\u064A", en: "Daily Operations" },
    content: { ar: "\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic Content" },
    access: { ar: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0648\u0646 \u0648\u0627\u0644\u0648\u0635\u0648\u0644", en: "Users & Access" },
    audit: { ar: "\u0627\u0644\u0642\u064A\u0627\u0633 \u0648\u0627\u0644\u062A\u062F\u0642\u064A\u0642", en: "Measurement & Audit" },
    system: { ar: "\u0627\u0644\u0646\u0638\u0627\u0645", en: "System" }
  },
  // ===== Nav Items (preserved + PR-3 additions for every routable view) =====
  nav: {
    overview: { ar: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629", en: "Command Center" },
    // PR-3 — shell variant: the App copy used lower-case «Command center».
    overviewShell: { ar: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629", en: "Command center" },
    students: { ar: "\u0627\u0644\u0637\u0644\u0627\u0628", en: "Students" },
    academic: { ar: "\u0627\u0644\u0628\u0646\u064A\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629", en: "Academic Structure" },
    questions: { ar: "\u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Question Bank" },
    exams: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "Exams" },
    library: { ar: "\u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0648\u0627\u0644\u0645\u0644\u0641\u0627\u062A", en: "Library & Files" },
    codes: { ar: "\u0631\u0645\u0648\u0632 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Access Codes" },
    admins: { ar: "\u0627\u0644\u0645\u062F\u0631\u0627\u0621", en: "Administrators" },
    roles: { ar: "\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Roles & Permissions" },
    // PR-3 — shell variant: the App copy's mixed-case English label.
    rolesShell: { ar: "\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Roles & permissions" },
    // PR-3 — views that previously lived only as inline shell ternaries.
    examCourses: { ar: "\u0627\u0644\u062F\u0648\u0631\u0627\u062A \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Exam Courses" },
    reports: { ar: "\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0648\u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A", en: "Reports & Analytics" },
    auditLog: { ar: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A", en: "Security Audit" },
    offline: { ar: "\u0627\u0644\u062D\u0632\u0645 \u062F\u0648\u0646 \u0627\u062A\u0635\u0627\u0644", en: "Offline Packages" },
    settings: { ar: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645", en: "System Settings" },
    content: { ar: "\u0635\u0641\u062D\u0627\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Content Pages" }
  },
  // ===== Topbar (preserved + a11y additions) =====
  topbar: {
    search: { ar: "\u0628\u062D\u062B \u0633\u0631\u064A\u0639...", en: "Quick search..." },
    notifications: { ar: "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A", en: "Notifications" },
    help: { ar: "\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629", en: "Help" },
    language: { ar: "English", en: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
    darkMode: { ar: "\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0644\u064A\u0644\u064A", en: "Dark mode" },
    lightMode: { ar: "\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0646\u0647\u0627\u0631\u064A", en: "Light mode" },
    toggleTheme: { ar: "\u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0645\u0638\u0647\u0631", en: "Toggle theme" },
    statusHealthy: { ar: "\u0627\u0644\u062E\u062F\u0645\u0629 \u062A\u0639\u0645\u0644", en: "Service operational" },
    statusDegraded: { ar: "\u0623\u062F\u0627\u0621 \u0645\u062A\u062F\u0646\u064D", en: "Degraded" },
    statusUnknown: { ar: "\u062D\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629", en: "Unknown" },
    signOut: { ar: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C", en: "Sign out" },
    operator: { ar: "\u0627\u0644\u0645\u0634\u063A\u0651\u0644", en: "Operator" },
    // PR-3 — a11y labels previously inline in App.tsx.
    composeNotification: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0625\u0634\u0639\u0627\u0631", en: "Compose notification" },
    sentNotifications: { ar: "\u0633\u062C\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0631\u0633\u0644\u0629", en: "Sent notifications" },
    openPalette: { ar: "\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631", en: "Open command palette" }
  },
  // ===== Common (preserved) =====
  common: {
    save: { ar: "\u062D\u0641\u0638", en: "Save" },
    cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
    create: { ar: "\u0625\u0646\u0634\u0627\u0621", en: "Create" },
    edit: { ar: "\u062A\u0639\u062F\u064A\u0644", en: "Edit" },
    delete: { ar: "\u062D\u0630\u0641", en: "Delete" },
    archive: { ar: "\u0623\u0631\u0634\u0641\u0629", en: "Archive" },
    publish: { ar: "\u0646\u0634\u0631", en: "Publish" },
    search: { ar: "\u0628\u062D\u062B", en: "Search" },
    filter: { ar: "\u062A\u0635\u0641\u064A\u0629", en: "Filter" },
    clear: { ar: "\u0645\u0633\u062D", en: "Clear" },
    refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644...", en: "Loading..." },
    noData: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A", en: "No data available" },
    noResults: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629", en: "No matching results" },
    error: { ar: "\u062D\u062F\u062B \u062E\u0637\u0623", en: "An error occurred" },
    permissionDenied: { ar: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Permission denied" },
    confirm: { ar: "\u062A\u0623\u0643\u064A\u062F", en: "Confirm" },
    close: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close" },
    active: { ar: "\u0646\u0634\u0637", en: "Active" },
    disabled: { ar: "\u0645\u0639\u0637\u0651\u0644", en: "Disabled" },
    all: { ar: "\u0627\u0644\u0643\u0644", en: "All" },
    status: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
    actions: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
    created: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621", en: "Created" },
    updated: { ar: "\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B", en: "Last updated" },
    yes: { ar: "\u0646\u0639\u0645", en: "Yes" },
    no: { ar: "\u0644\u0627", en: "No" }
  },
  // ===== Dashboard (preserved + PR-3 additions) =====
  dashboard: {
    welcome: { ar: "\u0645\u0631\u062D\u0628\u0627\u064B", en: "Welcome" },
    totalStudents: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0637\u0644\u0627\u0628", en: "Total students" },
    activeToday: { ar: "\u0646\u0634\u0637 \u0627\u0644\u064A\u0648\u0645", en: "Active today" },
    publishedQuestions: { ar: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629", en: "Published questions" },
    publishedExams: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629", en: "Published exams" },
    libraryFiles: { ar: "\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629", en: "Library files" },
    activeCodes: { ar: "\u0623\u0643\u0648\u0627\u062F \u0646\u0634\u0637\u0629", en: "Active codes" },
    pendingReports: { ar: "\u0628\u0644\u0627\u063A\u0627\u062A \u0645\u0639\u0644\u0651\u0642\u0629", en: "Pending reports" },
    monthlyRevenue: { ar: "\u0625\u064A\u0631\u0627\u062F \u0627\u0644\u0634\u0647\u0631", en: "Monthly revenue" },
    statsLoading: { ar: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A...", en: "Loading metrics..." },
    statsError: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A", en: "Could not load metrics" },
    noMetrics: { ar: "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0645\u0624\u0634\u0631\u0627\u062A \u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628.", en: "No operational metrics available for this account." },
    // PR-3 — overview stat cards (previously in the App `copy` object).
    activeSubscriptions: { ar: "\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0641\u0639\u0651\u0627\u0644\u0629", en: "Active subscriptions" },
    welcomeShort: { ar: "\u0645\u0631\u062D\u0628\u064B\u0627 \u0628\u0643", en: "Welcome" },
    welcomeAdmin: { ar: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u063A\u0651\u0644", en: "Operator console" },
    welcomeBody: { ar: "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0645\u0624\u0634\u0631\u0627\u062A \u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628. \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0644\u062A\u0631\u0642\u064A\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0623\u0648 \u0644\u0631\u0628\u0637 \u0646\u0637\u0627\u0642 \u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "No operational metrics are available for this account. Contact the super-administrator to upgrade your scope or assign an academic range." },
    openCenter: { ar: "\u0627\u0641\u062A\u062D \u0627\u0644\u0645\u0631\u0643\u0632", en: "Open center" },
    metricsTab: { ar: "\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A", en: "Metrics" },
    activityTab: { ar: "\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0646\u0634\u0627\u0637", en: "Activity monitor" },
    sectionsA11y: { ar: "\u0623\u0642\u0633\u0627\u0645 \u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629", en: "Overview sections" },
    open: { ar: "\u0627\u0641\u062A\u062D", en: "Open" },
    lastUpdated: { ar: "\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B", en: "Last updated" },
    // PR-3 — shell variants of the stat banners (ellipsis/period differ from
    // the original 2024 entries above; preserved byte-identical from App copy).
    statsLoadingShell: { ar: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A\u2026", en: "Loading metrics\u2026" },
    statsErrorShell: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A.", en: "Could not load metrics." },
    // PR-3 — the App copy used the undetermined-form plural «اختبارات منشورة».
    statExamsShell: { ar: "\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0645\u0646\u0634\u0648\u0631\u0629", en: "Published exams" }
  },
  // ===== Admins (preserved + PR-3 shell additions) =====
  admins: {
    list: { ar: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062F\u0631\u0627\u0621", en: "Administrator directory" },
    add: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062F\u064A\u0631", en: "Add administrator" },
    edit: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u064A\u0631", en: "Edit administrator" },
    fullName: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644", en: "Full name" },
    phone: { ar: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Phone (optional)" },
    initialPassword: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0623\u0648\u0644\u064A\u0629", en: "Initial password" },
    passwordReminder: { ar: "\u0630\u0643\u0651\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0628\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0639\u0646\u062F \u0623\u0648\u0644 \u062F\u062E\u0648\u0644.", en: "Remind this administrator to change the initial password at first sign-in." },
    resetTitle: { ar: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", en: "Reset password" },
    newPassword: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629", en: "New password" },
    deleteTitle: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u0630\u0641 \u0627\u0644\u0646\u0647\u0627\u0626\u064A", en: "Confirm permanent deletion" },
    deleteText: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645 \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646\u0647. \u0623\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0644\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u0630\u0641.", en: "This action is permanent and cannot be undone. Enter the super-administrator password to confirm." },
    currentPassword: { ar: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645", en: "Super-admin password" },
    deleteConfirm: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A", en: "Delete permanently" },
    deactivate: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Disable account" },
    activate: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Enable account" },
    noResults: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629.", en: "No matching administrators." },
    created: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u062F\u064A\u0631. \u0634\u0627\u0631\u0643 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0639\u0628\u0631 \u0642\u0646\u0627\u0629 \u0622\u0645\u0646\u0629.", en: "Administrator created. Share the initial password through a secure channel." },
    // PR-3 — shell toasts + confirm dialogs (previously inline ternaries).
    savedToast: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u064A\u0631.", en: "Administrator details saved." },
    enabledToast: { ar: "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628.", en: "Account enabled." },
    disabledToast: { ar: "\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0648\u0625\u0628\u0637\u0627\u0644 \u062C\u0644\u0633\u0627\u062A\u0647.", en: "Account disabled and sessions revoked." },
    passwordResetToast: { ar: "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u062C\u0644\u0633\u0627\u062A.", en: "Password reset and live sessions revoked." },
    deletedToast: { ar: "\u062A\u0645 \u0627\u0644\u062D\u0630\u0641 \u0627\u0644\u0646\u0647\u0627\u0626\u064A \u0644\u0644\u0645\u062F\u064A\u0631.", en: "Administrator permanently deleted." },
    enableTitle: { ar: "\u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631", en: "Enable administrator account" },
    disableTitle: { ar: "\u062A\u0639\u0637\u064A\u0644 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631", en: "Disable administrator account" },
    enableDescription: { ar: '\u0633\u064A\u064F\u0639\u0627\u062F \u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 "{{name}}" \u0648\u064A\u0645\u0643\u0646\u0647 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.', en: '"{{name}}" will be re-enabled and can sign in again.' },
    disableDescription: { ar: '\u0633\u064A\u064F\u0639\u0637\u064E\u0651\u0644 \u062D\u0633\u0627\u0628 "{{name}}" \u0648\u062A\u064F\u0628\u0637\u0644 \u062C\u0645\u064A\u0639 \u062C\u0644\u0633\u0627\u062A\u0647 \u0627\u0644\u0646\u0634\u0637\u0629 \u0641\u0648\u0631\u064B\u0627.', en: '"{{name}}" will be disabled and all their live sessions revoked immediately.' },
    // PR-3 — the App `copy` object variants (byte-identical to the pre-PR-3
    // shell copy; distinct from the 2024 dictionary entries above where the
    // wording differs, e.g. the longer password reminder / confirmation copy).
    searchHint: { ar: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0628\u0631\u064A\u062F \u0623\u0648 \u0627\u0644\u0647\u0627\u062A\u0641", en: "Search name, email or phone" },
    clearFilters: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062A\u0635\u0641\u064A\u0629", en: "Clear filters" },
    activeLabel: { ar: "\u0645\u0641\u0639\u0651\u0644", en: "Active" },
    roleColumn: { ar: "\u0627\u0644\u062F\u0648\u0631", en: "Role" },
    scopeColumn: { ar: "\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic scope" },
    lastLogin: { ar: "\u0622\u062E\u0631 \u062F\u062E\u0648\u0644", en: "Last login" },
    viewDetails: { ar: "\u0639\u0631\u0636 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", en: "View details" },
    rowDelete: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A", en: "Permanent delete" },
    addTitle: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062F\u064A\u0631 \u062C\u062F\u064A\u062F", en: "Add administrator" },
    saveChanges: { ar: "\u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631", en: "Save changes" },
    passwordReminderShell: { ar: "\u064A\u062C\u0628 \u062A\u0630\u0643\u064A\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0628\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0639\u0646\u062F \u0627\u0644\u062F\u062E\u0648\u0644\u060C \u062F\u0648\u0646 \u062D\u062C\u0628 \u0627\u0644\u0644\u0648\u062D\u0629.", en: "Remind this administrator to change the initial password at first sign-in; do not block their console." },
    deleteTextShell: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645. \u0623\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0644\u062A\u0623\u0643\u064A\u062F.", en: "This action is permanent. Enter the current super-administrator password to confirm." },
    currentPasswordShell: { ar: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", en: "Current super-administrator password" },
    deleteConfirmShell: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0645\u062F\u064A\u0631 \u0646\u0647\u0627\u0626\u064A\u064B\u0627", en: "Delete administrator permanently" },
    createdShell: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u062F\u064A\u0631. \u0634\u0627\u0631\u0643 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0639\u0628\u0631 \u0642\u0646\u0627\u0629 \u0622\u0645\u0646\u0629\u060C \u0648\u0630\u0643\u0651\u0631\u0647 \u0628\u062A\u063A\u064A\u064A\u0631\u0647\u0627 \u0639\u0646\u062F \u0623\u0648\u0644 \u062F\u062E\u0648\u0644.", en: "Administrator created. Share the initial password through a secure channel and remind them to change it on first sign-in." }
  },
  // ===== Roles (preserved + PR-3 shell additions) =====
  roles: {
    title: { ar: "\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Roles & Permissions" },
    add: { ar: "\u0625\u0646\u0634\u0627\u0621 \u062F\u0648\u0631", en: "Create role" },
    name: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u062A\u0642\u0646\u064A", en: "Technical name" },
    nameAr: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0639\u0631\u0628\u064A", en: "Arabic name" },
    description: { ar: "\u0627\u0644\u0648\u0635\u0641", en: "Description" },
    system: { ar: "\u0646\u0638\u0627\u0645\u064A", en: "System" },
    custom: { ar: "\u0645\u062E\u0635\u0635", en: "Custom" },
    adminsCount: { ar: "\u0639\u062F\u062F \u0627\u0644\u0645\u062F\u0631\u0627\u0621", en: "Administrators" },
    permissions: { ar: "\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Permissions" },
    noRoles: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062F\u0648\u0627\u0631 \u0628\u0639\u062F.", en: "No roles available yet." },
    // PR-3 — role shell toasts + confirm dialogs (previously inline ternaries).
    createdEmptyToast: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062F\u0648\u0631 \u0641\u0627\u0631\u063A\u064B\u0627. \u0623\u0636\u0641 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0642\u0628\u0644 \u062A\u0639\u064A\u064A\u0646\u0647.", en: "Role created empty. Add permissions before assigning it." },
    enabledToast: { ar: "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062F\u0648\u0631.", en: "Role enabled." },
    disabledToast: { ar: "\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062F\u0648\u0631 \u0648\u0625\u0628\u0637\u0627\u0644 \u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646.", en: "Role disabled and assigned sessions revoked." },
    deletedToast: { ar: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631.", en: "Role deleted." },
    enableTitle: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062F\u0648\u0631", en: "Enable role" },
    disableTitle: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062F\u0648\u0631", en: "Disable role" },
    deleteTitle: { ar: "\u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631 \u0646\u0647\u0627\u0626\u064A\u064B\u0627", en: "Permanently delete role" },
    deleteAck: { ar: "\u0623\u0641\u0647\u0645 \u0623\u0646 \u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631 \u0646\u0647\u0627\u0626\u064A \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646\u0647", en: "I understand this role deletion is permanent and cannot be undone" },
    enableDescription: { ar: '\u0633\u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u0627\u0644\u062F\u0648\u0631 "{{name}}" \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646 \u0644\u0647.', en: 'Role "{{name}}" will be enabled for all assigned administrators.' },
    disableDescription: { ar: '\u0633\u064A\u064F\u0639\u0637\u064E\u0651\u0644 \u0627\u0644\u062F\u0648\u0631 "{{name}}" \u0648\u062A\u064F\u0628\u0637\u0644 \u062C\u0644\u0633\u0627\u062A \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646 \u0644\u0647 \u062D\u062A\u0649 \u064A\u064F\u0639\u0627\u062F \u062A\u0641\u0639\u064A\u0644\u0647.', en: `Role "{{name}}" will be disabled and every assigned administrator's sessions revoked until it is re-enabled.` },
    deleteDescription: { ar: '\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631 "{{name}}" \u0646\u0647\u0627\u0626\u064A\u064B\u0627. \u064A\u062C\u0628 \u0623\u0646 \u0644\u0627 \u064A\u0643\u0648\u0646 \u0645\u0639\u064A\u0651\u0646\u064B\u0627 \u0644\u0623\u064A \u0645\u062F\u064A\u0631 \u062D\u0627\u0644\u064A\u064B\u0627. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.', en: 'Role "{{name}}" will be permanently deleted. It must not currently be assigned to any administrator. This cannot be undone.' },
    accessTitle: { ar: "\u0623\u062F\u0648\u0627\u0631 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Access roles" }
  },
  // ===== Scope (preserved + summary additions) =====
  scope: {
    label: { ar: "\u062D\u0633\u0628 \u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0645\u0639\u064A\u0651\u0646", en: "By assigned scope" },
    limited: { ar: "\u0627\u0644\u0648\u0635\u0648\u0644 \u0645\u0642\u064A\u0651\u062F \u0628\u0627\u0644\u062F\u0648\u0631 \u0648\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Access is limited by your role and academic scope" },
    // PR-3 — shell variant: the App copy's shorter LimitedNotice wording.
    limitedShell: { ar: "\u0627\u0644\u0648\u0635\u0648\u0644 \u0645\u0642\u064A\u0651\u062F \u0628\u0627\u0644\u062F\u0648\u0631 \u0648\u0627\u0644\u0646\u0637\u0627\u0642", en: "Access is limited by your role and academic scope" },
    entire: { ar: "\u0627\u0644\u0645\u0646\u0635\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644", en: "Entire platform" },
    university: { ar: "\u062C\u0627\u0645\u0639\u0629 \u0645\u062D\u062F\u062F\u0629", en: "Specific university" },
    college: { ar: "\u0643\u0644\u064A\u0629 \u0645\u062D\u062F\u062F\u0629", en: "Specific college" },
    year: { ar: "\u0633\u0646\u0629 \u0645\u062D\u062F\u062F\u0629", en: "Specific year" },
    subject: { ar: "\u0645\u0627\u062F\u0629 \u0645\u062D\u062F\u062F\u0629", en: "Specific subject" },
    unassigned: { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", en: "Unassigned" }
  },
  // ===== Shell (PR-3 — App.tsx furniture previously in the inline copy) =====
  shell: {
    title: { ar: "\u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0645\u0646\u0635\u0629 CMS", en: "CMS Administration Console" },
    command: { ar: "\u0645\u0631\u0643\u0632 \u0627\u0644\u0642\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u064A \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629.", en: "Institutional command center for academic platform management." },
    commandSub: { ar: "\u0631\u0627\u062C\u0639 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0642\u0628\u0644 \u0646\u0634\u0631 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u060C \u062B\u0645 \u062A\u0627\u0628\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "Review access before publishing a change, then manage within your academic scope." },
    brandWelcome: { ar: "Cliver Medical Student", en: "Cliver Medical Student" },
    brandTagline: { ar: "Study smart...Not study hard", en: "Study smart...Not study hard" },
    operatorProfile: { ar: "\u0627\u0644\u0645\u0634\u063A\u0651\u0644 \u0627\u0644\u062D\u0627\u0644\u064A", en: "Current operator" },
    dataError: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629.", en: "Could not load administration data." },
    welcomeToast: { ar: "\u0623\u0647\u0644\u064B\u0627 {{name}}", en: "Welcome, {{name}}" },
    statusNotChecked: { ar: "\u063A\u064A\u0631 \u0645\u062A\u062D\u0642\u0642", en: "Unknown" },
    statusHealthyShort: { ar: "\u0627\u0644\u062E\u062F\u0645\u0629 \u062A\u0639\u0645\u0644", en: "Operational" },
    closeNav: { ar: "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0642\u0627\u0626\u0645\u0629", en: "Close navigation" },
    openNav: { ar: "\u0641\u062A\u062D \u0627\u0644\u0642\u0627\u0626\u0645\u0629", en: "Open navigation" },
    toggleSidebar: { ar: "\u0637\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629", en: "Toggle sidebar" },
    operatorMenu: { ar: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0634\u063A\u0651\u0644", en: "Operator menu" },
    operatorMenuWith: { ar: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0634\u063A\u0651\u0644: {{name}}", en: "Operator menu: {{name}}" },
    breadcrumbNav: { ar: "\u0645\u0633\u0627\u0631 \u0627\u0644\u062A\u0646\u0642\u0644", en: "Breadcrumb" },
    adminCrumb: { ar: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629", en: "Admin" }
  },
  // ===== Command palette (PR-2 labels, dictionary-sourced in PR-3) =====
  palette: {
    title: { ar: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631", en: "Command palette" },
    placeholder: { ar: "\u0627\u0628\u062D\u062B \u0641\u064A \u0645\u0631\u0627\u0643\u0632 \u0627\u0644\u0625\u062F\u0627\u0631\u0629\u2026", en: "Search admin centers\u2026" },
    noResults: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629", en: "No matching results" },
    openHint: { ar: "\u0628\u062D\u062B \u0633\u0631\u064A\u0639 \u0641\u064A \u0645\u0631\u0627\u0643\u0632 \u0627\u0644\u0625\u062F\u0627\u0631\u0629", en: "Quick search across admin centers" }
  },
  // ===== 404 (PR-2 view, dictionary-sourced in PR-3) =====
  notFound: {
    title: { ar: "\u0627\u0644\u0635\u0641\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629", en: "Page not found" },
    description: {
      ar: "\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629: {{path}}. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u0648 \u0639\u062F \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629.",
      en: "The requested path does not exist in the administration console: {{path}}. Check the link or return to the command center."
    },
    return: { ar: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629", en: "Return to command center" }
  },
  // ===== 2FA self-service card (previously the TwoFactorCard copy object) =====
  twoFactorCard: {
    title: { ar: "\u0623\u0645\u0627\u0646 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Account security" },
    subtitle: { ar: "\u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 (2FA)", en: "Two-factor authentication (2FA)" },
    body: { ar: "\u0637\u0628\u0642\u0629 \u062D\u0645\u0627\u064A\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u0644\u062D\u0633\u0627\u0628{{name}}: \u064A\u064F\u0637\u0644\u0628 \u0631\u0645\u0632 \u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0639\u0646\u062F \u0643\u0644 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644. \u0641\u0639\u0651\u0644\u0647\u0627 \u0645\u0646 \u0647\u0646\u0627\u060C \u0623\u0648 \u0639\u0637\u0651\u0644\u0647\u0627 \u0628\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.", en: "An extra layer of protection for{{name}}: an authenticator code is required at every sign-in. Enable it here, or disable it with a password confirmation." },
    bodyNameDefaultAr: { ar: "\u0643", en: " your account" },
    enable: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Enable 2FA" },
    disable: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Disable 2FA" },
    setupTitle: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Enable two-factor authentication" },
    setupBody: { ar: "\u0627\u0645\u0633\u062D \u0631\u0645\u0632 QR \u0628\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 (Google Authenticator / Authy\u2026) \u0623\u0648 \u0623\u062F\u062E\u0644 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u064A\u062F\u0648\u064A\u064B\u0627\u060C \u062B\u0645 \u0623\u0643\u0651\u062F \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", en: "Scan the QR code with your authenticator app (Google Authenticator / Authy\u2026) or enter the key manually, then confirm in the app." },
    qrAlt: { ar: "\u0631\u0645\u0632 QR \u0644\u0625\u0639\u062F\u0627\u062F \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629", en: "QR code for the authenticator app" },
    secretLabel: { ar: "\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u064A\u062F\u0648\u064A", en: "Manual key" },
    codesLabel: { ar: "\u0631\u0645\u0648\u0632 \u0627\u0644\u0627\u0633\u062A\u0631\u062C\u0627\u0639 (\u062A\u0638\u0647\u0631 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0641\u0642\u0637 \u2014 \u0627\u062D\u0641\u0638\u0647\u0627 \u0627\u0644\u0622\u0646)", en: "Recovery codes (shown once \u2014 save them now)" },
    codesHint: { ar: "\u062A\u064F\u0633\u062A\u062E\u062F\u0645 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0644\u0643\u0644 \u0631\u0645\u0632 \u0625\u0630\u0627 \u0641\u0642\u062F\u062A \u062C\u0647\u0627\u0632\u0643.", en: "Each code can be used once if you lose your device." },
    copied: { ar: "\u062A\u0645 \u0627\u0644\u0646\u0633\u062E", en: "Copied" },
    working: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u0646\u0641\u064A\u0630...", en: "Working..." },
    done: { ar: "\u062A\u0645 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u2014 \u0623\u0643\u0651\u062F \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u064A \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629", en: "Enabled \u2014 confirm the account in your authenticator app" },
    disableTitle: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Disable two-factor authentication" },
    disableBody: { ar: "\u0623\u062F\u062E\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062D\u0633\u0627\u0628\u0643 \u0644\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062A\u0639\u0637\u064A\u0644. \u0633\u064A\u0639\u0648\u062F \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0644\u0649 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0641\u0642\u0637.", en: "Enter your account password to confirm. Sign-in will rely on the password only." },
    passwordLabel: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", en: "Current password" },
    passwordPlaceholder: { ar: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062D\u0633\u0627\u0628\u0643", en: "Your password" },
    disableConfirm: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062A\u0639\u0637\u064A\u0644", en: "Confirm disable" },
    disableOk: { ar: "\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Two-factor authentication disabled" },
    enableFail: { ar: "\u0641\u0634\u0644 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Failed to enable 2FA" },
    disableFail: { ar: "\u0641\u0634\u0644 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Failed to disable 2FA" }
  },
  // ===== Shared modal furniture =====
  modal: {
    closeLabel: { ar: "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0646\u0627\u0641\u0630\u0629", en: "Close dialog" }
  },
  // ===== Error boundary (crash surface) =====
  errorBoundary: {
    title: { ar: "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639", en: "An unexpected error occurred" },
    body: { ar: "\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0635\u0641\u062D\u0629. \u0625\u0630\u0627 \u0627\u0633\u062A\u0645\u0631\u062A \u0627\u0644\u0645\u0634\u0643\u0644\u0629\u060C \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A.", en: "Please refresh the page. If the problem persists, contact support." },
    details: { ar: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062E\u0637\u0623", en: "Error details" },
    reload: { ar: "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0635\u0641\u062D\u0629", en: "Reload page" }
  }
};

// apps/admin-web/src/lib/dictionary/students.ts
var studentsDict = {
  // ===== Strings reused by several surfaces of the center =====
  common: {
    status: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
    lastSignIn: { ar: "\u0622\u062E\u0631 \u062F\u062E\u0648\u0644", en: "Last sign-in" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644...", en: "Loading..." },
    cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
    close: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close" },
    userManagement: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646", en: "User management" },
    addStudent: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0637\u0627\u0644\u0628", en: "Add student" },
    editProfile: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0644\u0641", en: "Edit profile" },
    banAccount: { ar: "\u062D\u0638\u0631 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Ban account" },
    reactivate: { ar: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644", en: "Reactivate" },
    revokeSessions: { ar: "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0627\u062A", en: "Revoke sessions" },
    unbindDevice: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0631\u0628\u0637 \u0627\u0644\u062C\u0647\u0627\u0632", en: "Unbind device" },
    academicProgress: { ar: "\u0627\u0644\u062A\u0642\u062F\u0645 \u0627\u0644\u062F\u0631\u0627\u0633\u064A", en: "Academic progress" },
    securityLog: { ar: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A", en: "Security log" },
    deviceActive: { ar: "\u0646\u0634\u0637", en: "Active" },
    deviceInactive: { ar: "\u0645\u0639\u0637\u0651\u0644", en: "Inactive" },
    bound: { ar: "\u0627\u0644\u0631\u0628\u0637", en: "Bound" },
    lastUsed: { ar: "\u0622\u062E\u0631 \u0627\u0633\u062A\u062E\u062F\u0627\u0645", en: "Last used" },
    revoke: { ar: "\u0625\u0646\u0647\u0627\u0621", en: "Revoke" },
    fullName: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644", en: "Full name" },
    university: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "University" },
    college: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629", en: "College" },
    notSpecified: { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", en: "Not specified" },
    male: { ar: "\u0630\u0643\u0631", en: "Male" },
    female: { ar: "\u0623\u0646\u062B\u0649", en: "Female" }
  },
  // ===== Page header =====
  header: {
    title: { ar: "\u0627\u0644\u0637\u0644\u0627\u0628", en: "Students" },
    subtitle: { ar: "\u062A\u064F\u0639\u0631\u0636 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0648\u062A\u064F\u0646\u0641\u0651\u0630 \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0636\u0645\u0646 \u0646\u0637\u0627\u0642 \u0627\u0644\u0645\u062F\u064A\u0631 \u0648\u0635\u0644\u0627\u062D\u064A\u0627\u062A\u0647 \u0645\u0646 \u0627\u0644\u062E\u0627\u062F\u0645.", en: "Results and protected actions are constrained by the acting administrator\u2019s server-side scope and permissions." }
  },
  // ===== Filter bar =====
  filters: {
    searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", en: "Search name or phone" },
    universityAll: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629: \u0627\u0644\u0643\u0644", en: "University: All" },
    statusAll: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629: \u0627\u0644\u0643\u0644", en: "Status: All" },
    clear: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062A\u0635\u0641\u064A\u0629", en: "Clear filters" }
  },
  // ===== Empty states =====
  list: {
    emptyFiltered: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629", en: "No matching results" },
    empty: { ar: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643 \u0628\u0639\u062F.", en: "No students are available in your scope yet." },
    emptyHint: { ar: "\u0639\u062F\u0651\u0644 \u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u0623\u0648 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B.", en: "Adjust the filters or try again later." }
  },
  // ===== Students table =====
  table: {
    student: { ar: "\u0627\u0644\u0637\u0627\u0644\u0628", en: "Student" },
    academicPath: { ar: "\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic path" },
    activity: { ar: "\u0627\u0644\u062A\u0641\u0627\u0639\u0644", en: "Activity" },
    actionsSr: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
    registeredAt: { ar: "\u0633\u064F\u062C\u0651\u0644 \u0641\u064A {{date}}", en: "Registered {{date}}" },
    accuracyStat: { ar: "{{value}}% \u062F\u0642\u0629", en: "{{value}}% accuracy" },
    viewProfileTitle: { ar: "\u0639\u0631\u0636 \u0627\u0644\u0645\u0644\u0641 \u0648\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A", en: "View profile and security log" },
    rowActionsLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A {{name}}", en: "Actions for {{name}}" },
    paginationSummary: { ar: "\u0627\u0644\u0646\u062A\u0627\u0626\u062C {{from}}\u2013{{to}} \u0645\u0646 {{total}}", en: "Showing {{from}}\u2013{{to}} of {{total}}" },
    previous: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    pageOf: { ar: "\u0635\u0641\u062D\u0629 {{page}} \u0645\u0646 {{total}}", en: "Page {{page}} of {{total}}" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" }
  },
  // ===== Slide-in drawer =====
  drawer: {
    ariaLabel: { ar: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0637\u0627\u0644\u0628", en: "Student details" },
    recordLabel: { ar: "\u0645\u0644\u0641 \u0627\u0644\u0637\u0627\u0644\u0628", en: "Student record" },
    closeDetails: { ar: "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", en: "Close details" },
    tabs: {
      overview: { ar: "\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629", en: "Basic info" },
      exams: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "Exams" },
      subscriptions: { ar: "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A", en: "Subscriptions" },
      sessions: { ar: "\u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0648\u0627\u0644\u0623\u062C\u0647\u0632\u0629", en: "Sessions & devices" },
      reports: { ar: "\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Reports" }
      // «التقدم الدراسي» / «السجل الأمني» tabs reuse common.academicProgress /
      // common.securityLog — byte-identical to the tab + heading copy.
    },
    overview: {
      answers: { ar: "\u0625\u062C\u0627\u0628\u0627\u062A", en: "Answers" },
      accuracy: { ar: "\u062F\u0642\u0629", en: "Accuracy" },
      sessionsTitle: { ar: "\u0627\u0644\u062C\u0644\u0633\u0627\u062A", en: "Sessions" },
      sessionsBody: { ar: "\u0625\u0646\u0647\u0627\u0621 \u0622\u0645\u0646 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629.", en: "Securely revoke every current session." },
      devicesTitle: { ar: "\u0627\u0644\u0623\u062C\u0647\u0632\u0629", en: "Devices" },
      devicesBody: { ar: "\u064A\u064F\u0644\u063A\u064A \u0631\u0628\u0637 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u062D\u0627\u0644\u064A\u061B \u0644\u0627 \u064A\u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0627\u0646.", en: "Removes the current device binding without deleting audit history." },
      accountStatus: { ar: "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Account status" },
      banNote: { ar: "\u0633\u064A\u064F\u0633\u062C\u064E\u0651\u0644 \u0627\u0644\u062D\u0638\u0631 \u0645\u0639 \u0633\u0628\u0628 \u0648\u0627\u0636\u062D \u0644\u0644\u062A\u062F\u0642\u064A\u0642.", en: "A ban will be recorded with an audit-safe reason." },
      reactivateNote: { ar: "\u064A\u0645\u0643\u0646 \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u0648\u0631\u0627\u064B.", en: "The account can be reactivated immediately." }
    }
  },
  // ===== Security log tab =====
  security: {
    recentEvents: { ar: "\u0622\u062E\u0631 \u0627\u0644\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u0645\u0631\u0626\u064A\u0629", en: "Recent visible events" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0623\u0645\u0646\u064A\u0629", en: "No security events" },
    emptyHint: { ar: "\u0644\u0645 \u062A\u064F\u0633\u062C\u064E\u0651\u0644 \u0623\u062D\u062F\u0627\u062B \u0623\u0645\u0646\u064A\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628 \u0636\u0645\u0646 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629.", en: "No security events are visible for this student within the current permissions." },
    fingerprint: { ar: "\u0628\u0635\u0645\u0629 \u0627\u0644\u062C\u0647\u0627\u0632", en: "Fingerprint" },
    // Legacy unknown-severity behavior: Arabic showed a fixed label, English
    // echoed the raw wire value — reproduced by the pass-through template.
    severityUnknown: { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", en: "{{value}}" },
    events: {
      loginSuccess: { ar: "\u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0646\u0627\u062C\u062D", en: "Login Success" },
      loginFailed: { ar: "\u0641\u0634\u0644 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644", en: "Login Failed" },
      logout: { ar: "\u062A\u0633\u062C\u064A\u0644 \u062E\u0631\u0648\u062C", en: "Logout" },
      sessionCreated: { ar: "\u0625\u0646\u0634\u0627\u0621 \u062C\u0644\u0633\u0629", en: "Session Created" },
      sessionRevoked: { ar: "\u0625\u0646\u0647\u0627\u0621 \u062C\u0644\u0633\u0629", en: "Session Revoked" },
      refresh: { ar: "\u062A\u062C\u062F\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Refresh" },
      refreshReuse: { ar: "\u062A\u062C\u062F\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Refresh Reuse" },
      deviceRegistered: { ar: "\u062A\u0633\u062C\u064A\u0644 \u062C\u0647\u0627\u0632", en: "Device Registered" },
      deviceChange: { ar: "\u062A\u063A\u064A\u064A\u0631 \u062C\u0647\u0627\u0632", en: "Device Change" },
      deviceBindingFailed: { ar: "\u0641\u0634\u0644 \u0631\u0628\u0637 \u0627\u0644\u062C\u0647\u0627\u0632", en: "Device Binding Failed" },
      devtoolsDetected: { ar: "\u0643\u0634\u0641 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0645\u0637\u0648\u0651\u0631\u064A\u0646", en: "Devtools Detected" },
      screenshotAttempt: { ar: "\u0645\u062D\u0627\u0648\u0644\u0629 \u0627\u0644\u062A\u0642\u0627\u0637 \u0634\u0627\u0634\u0629", en: "Screenshot Attempt" },
      copyAttempt: { ar: "\u0645\u062D\u0627\u0648\u0644\u0629 \u0646\u0633\u062E", en: "Copy Attempt" },
      downloadAttempt: { ar: "\u0645\u062D\u0627\u0648\u0644\u0629 \u062A\u0646\u0632\u064A\u0644", en: "Download Attempt" },
      printAttempt: { ar: "\u0645\u062D\u0627\u0648\u0644\u0629 \u0637\u0628\u0627\u0639\u0629", en: "Print Attempt" },
      multipleAccountsSuspected: { ar: "\u0627\u0634\u062A\u0628\u0627\u0647 \u062D\u0633\u0627\u0628\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629", en: "Multiple Accounts Suspected" },
      banIssued: { ar: "\u0625\u0635\u062F\u0627\u0631 \u062D\u0638\u0631", en: "Ban Issued" },
      banLifted: { ar: "\u0631\u0641\u0639 \u062D\u0638\u0631", en: "Ban Lifted" },
      passwordChanged: { ar: "\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", en: "Password Changed" },
      passwordResetRequested: { ar: "\u0637\u0644\u0628 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", en: "Password Reset Requested" },
      mfaEnabled: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Mfa Enabled" },
      mfaFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Mfa Failed" },
      mfaDisabled: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629", en: "Mfa Disabled" },
      subscriptionActivated: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0634\u062A\u0631\u0627\u0643", en: "Subscription Activated" },
      subscriptionRevoked: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0627\u0634\u062A\u0631\u0627\u0643", en: "Subscription Revoked" },
      fileAccess: { ar: "\u0648\u0635\u0648\u0644 \u0644\u0645\u0644\u0641", en: "File Access" },
      entitlementDenied: { ar: "\u0631\u0641\u0636 \u0627\u0633\u062A\u062D\u0642\u0627\u0642", en: "Entitlement Denied" },
      otpSent: { ar: "\u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u062A\u062D\u0642\u0642", en: "Otp Sent" },
      otpVerified: { ar: "\u062A\u062D\u0642\u0642 \u0631\u0645\u0632 OTP", en: "Otp Verified" },
      otpFailed: { ar: "\u0641\u0634\u0644 \u0631\u0645\u0632 OTP", en: "Otp Failed" },
      // Unknown event types: Arabic label; English is computed from the wire
      // value in the component (legacy split-camelCase), so `en` is unused.
      fallback: { ar: "\u062D\u062F\u062B \u0623\u0645\u0646\u064A", en: "Security event" }
    }
  },
  // ===== Sessions & devices tab =====
  sessions: {
    boundDevice: { ar: "\u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0645\u0631\u062A\u0628\u0637", en: "Bound device" },
    fingerprint: { ar: "\u0627\u0644\u0628\u0635\u0645\u0629", en: "Fingerprint" },
    revokeActiveTitle: { ar: "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629", en: "Revoke active sessions" },
    revokeActiveBody: { ar: "\u064A\u0646\u0647\u064A \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629 \u0639\u0644\u0649 \u0645\u062E\u062A\u0644\u0641 \u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0641\u0648\u0631\u0627\u064B. \u0633\u064A\u064F\u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0637\u0627\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u062C\u062F\u062F\u0627\u064B.", en: "This terminates every active session across devices immediately. The student must sign in again." },
    unbindBody: { ar: "\u064A\u0644\u063A\u064A \u0631\u0628\u0637 \u0628\u0635\u0645\u0629 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u062D\u0627\u0644\u064A\u0629\u060C \u0648\u0633\u064A\u064F\u0639\u0627\u062F \u0627\u0644\u062A\u062D\u0642\u0642 \u0639\u0646\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u062A\u0627\u0644\u064A. \u0644\u0627 \u064A\u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u0623\u062D\u062F\u0627\u062B.", en: "Removes the current device fingerprint binding; the server will re-verify at the next sign-in. Audit history is preserved." },
    listTitle: { ar: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062C\u0644\u0633\u0627\u062A", en: "Sessions list" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0644\u0633\u0627\u062A \u0645\u0633\u062C\u0644\u0629.", en: "No sessions recorded." },
    created: { ar: "\u0627\u0644\u0625\u0646\u0634\u0627\u0621", en: "Created" },
    lastActive: { ar: "\u0622\u062E\u0631 \u0646\u0634\u0627\u0637", en: "Last active" },
    revoked: { ar: "\u0623\u064F\u0646\u0647\u064A\u062A", en: "Revoked" },
    revokeThisTitle: { ar: "\u0625\u0646\u0647\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Revoke this session" },
    // Legacy unknown-session behavior: Arabic fixed label, raw value in English.
    statusUnknown: { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629", en: "{{status}}" },
    revokeConfirmTitle: { ar: "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Revoke session" },
    revokeConfirmBody: { ar: "\u0633\u064A\u064F\u0646\u0647\u0649 \u0646\u0634\u0627\u0637 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629 \u0641\u0648\u0631\u064B\u0627 \u0648\u0633\u064A\u064F\u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0637\u0627\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627 \u0639\u0644\u0649 \u0630\u0644\u0643 \u0627\u0644\u062C\u0647\u0627\u0632.", en: "This session is terminated immediately; the student must sign in again on that device." }
  },
  // ===== Academic progress tab =====
  academic: {
    questionsAnswered: { ar: "\u0625\u062C\u0627\u0628\u0627\u062A", en: "Questions answered" },
    accuracy: { ar: "\u0627\u0644\u062F\u0642\u0629", en: "Accuracy" },
    perSubject: { ar: "\u0627\u0644\u062A\u0642\u062F\u0645 \u062D\u0633\u0628 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Per-subject progress" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0642\u062F\u0645 \u0628\u0639\u062F. \u0633\u064A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0639\u0646\u062F \u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0637\u0627\u0644\u0628 \u0639\u0644\u0649 \u0627\u0644\u0623\u0633\u0626\u0644\u0629.", en: "No progress data yet. It will appear here once the student answers questions." },
    correct: { ar: "\u0635\u062D\u064A\u062D\u0629", en: "correct" },
    lastActivity: { ar: "\u0622\u062E\u0631 \u0646\u0634\u0627\u0637", en: "Last activity" }
  },
  // ===== Exams tab =====
  exams: {
    title: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0646\u062A\u0627\u0626\u062C", en: "Exams & results" },
    empty: { ar: "\u0644\u0645 \u064A\u062E\u0636 \u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628 \u0623\u064A \u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u0639\u062F.", en: "This student has not taken any exams yet." },
    inProgress: { ar: "\u0642\u064A\u062F \u0627\u0644\u062A\u0642\u062F\u0645", en: "In progress" },
    passed: { ar: "\u0646\u0627\u062C\u062D", en: "Passed" },
    failed: { ar: "\u0631\u0627\u0633\u0628", en: "Failed" },
    score: { ar: "\u0627\u0644\u062F\u0631\u062C\u0629", en: "Score" }
  },
  // ===== Subscriptions tab =====
  subscriptions: {
    title: { ar: "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u0627\u0644\u0623\u0643\u0648\u0627\u062F", en: "Subscriptions & codes" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0644\u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628.", en: "No subscriptions for this student." },
    scopeLabel: { ar: "\u0646\u0637\u0627\u0642", en: "Scope" },
    active: { ar: "\u0646\u0634\u0637", en: "Active" },
    expired: { ar: "\u0645\u0646\u062A\u0647\u064A", en: "Expired" },
    from: { ar: "\u0645\u0646", en: "From" },
    until: { ar: "\u0625\u0644\u0649", en: "Until" },
    revokedAt: { ar: "\u0623\u0644\u063A\u064A \u0641\u064A", en: "Revoked at" },
    revokeThisTitle: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0647\u0630\u0627 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", en: "Revoke this subscription" },
    revokeTitle: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", en: "Revoke subscription" },
    // {{scope}} exists only in the Arabic sentence (legacy behavior): the
    // English copy never interpolated the scope label.
    revokeBody: { ar: "\u0633\u064A\u0641\u0642\u062F \u0627\u0644\u0637\u0627\u0644\u0628 \u0648\u0635\u0648\u0644\u0647 \u0644\u0644\u0645\u062D\u062A\u0648\u0649 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642 \xAB{{scope}}\xBB \u062D\u062A\u0649 \u0646\u0647\u0627\u064A\u0629 \u0645\u062F\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639\u060C \u0648\u0633\u064A\u064F\u0633\u062C\u064E\u0651\u0644 \u0627\u0644\u0633\u0628\u0628 \u0641\u064A \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642.", en: "The student loses access to the content in this subscription\u2019s scope until it expires. This cannot be undone; the reason is recorded in the audit log." },
    confirmRevoke: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0625\u0628\u0637\u0627\u0644", en: "Confirm revoke" },
    revokeReasonLabel: { ar: "\u0633\u0628\u0628 \u0627\u0644\u0625\u0628\u0637\u0627\u0644", en: "Revoke reason" },
    revokeReasonPlaceholder: { ar: "\u0633\u0628\u0628 \u0648\u0627\u0636\u062D \u0648\u0622\u0645\u0646 \u0644\u0644\u062A\u062F\u0642\u064A\u0642.", en: "A clear, audit-safe reason." },
    // Legacy unknown-scope behavior: Arabic fixed label, raw value in English.
    scopeUnknown: { ar: "\u0646\u0637\u0627\u0642 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641", en: "{{scope}}" }
  },
  // ===== Reports tab =====
  reports: {
    title: { ar: "\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629", en: "Associated reports" },
    empty: { ar: "\u0644\u0645 \u064A\u0642\u062F\u0651\u0645 \u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628 \u0623\u064A \u0628\u0644\u0627\u063A.", en: "This student has not filed any reports." },
    reasonOther: { ar: "\u0623\u062E\u0631\u0649", en: "Other" },
    statusPending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631", en: "Pending" },
    statusReviewing: { ar: "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Reviewing" },
    statusResolved: { ar: "\u062A\u0645 \u0627\u0644\u062D\u0644", en: "Resolved" },
    statusRejected: { ar: "\u0645\u0631\u0641\u0648\u0636", en: "Rejected" },
    statusClosed: { ar: "\u0645\u063A\u0644\u0642", en: "Closed" }
  },
  // ===== Protected-action dialog (ban / revoke-sessions / unbind-device) =====
  dialog: {
    protectedAction: { ar: "\u0625\u062C\u0631\u0627\u0621 \u0645\u062D\u0645\u064A", en: "Protected action" },
    banTitle: { ar: "\u062D\u0638\u0631 \u062D\u0633\u0627\u0628 \u0627\u0644\u0637\u0627\u0644\u0628", en: "Ban student account" },
    revokeTitle: { ar: "\u0625\u0646\u0647\u0627\u0621 \u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0637\u0627\u0644\u0628", en: "Revoke student sessions" },
    unbindTitle: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0631\u0628\u0637 \u062C\u0647\u0627\u0632 \u0627\u0644\u0637\u0627\u0644\u0628", en: "Unbind student device" },
    confirmBan: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u0638\u0631", en: "Confirm ban" },
    confirmUnbind: { ar: "\u062A\u0623\u0643\u064A\u062F \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0628\u0637", en: "Confirm unbind" },
    scopeNoteBan: { ar: "\u064A\u064F\u0633\u062C\u0644 \u0627\u0644\u062E\u0627\u062F\u0645 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0633. \u064A\u0645\u0643\u0646 \u062A\u0631\u0643 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u0641\u0627\u0631\u063A\u0627\u064B \u0644\u0644\u062D\u0638\u0631 \u0627\u0644\u0645\u0641\u062A\u0648\u062D \u0648\u0641\u0642 \u0627\u0644\u0633\u064A\u0627\u0633\u0629.", en: "The server records this sensitive action. Leave expiry empty for an open-ended ban where policy permits." },
    scopeNoteRevoke: { ar: "\u0633\u064A\u0624\u062F\u064A \u0647\u0630\u0627 \u0625\u0644\u0649 \u0625\u0646\u0647\u0627\u0621 \u0648\u0635\u0648\u0644 \u0627\u0644\u0637\u0627\u0644\u0628 \u0645\u0646 \u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u0647\u064A\u0629.", en: "This ends the student\u2019s access on every device. Revoked sessions cannot be restored." },
    scopeNoteUnbind: { ar: "\u0633\u064A\u0637\u0644\u0628 \u0627\u0644\u062E\u0627\u062F\u0645 \u0627\u0644\u062A\u062D\u0642\u0642 \u0648\u0631\u0628\u0637 \u0627\u0644\u062C\u0647\u0627\u0632 \u0639\u0646\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u062A\u0627\u0644\u064A. \u0644\u0627 \u064A\u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0633\u062C\u0644 \u0627\u0644\u0623\u062D\u062F\u0627\u062B.", en: "The server will verify and bind a device at the next sign-in. This action preserves event history." },
    banReason: { ar: "\u0633\u0628\u0628 \u0627\u0644\u062D\u0638\u0631", en: "Ban reason" },
    banReasonPlaceholder: { ar: "\u0623\u062F\u062E\u0644 \u0633\u0628\u0628\u0627\u064B \u0648\u0627\u0636\u062D\u0627\u064B \u0648\u0622\u0645\u0646\u0627\u064B \u0644\u0644\u062A\u062F\u0642\u064A\u0642.", en: "Provide a clear, audit-safe reason." },
    optionalExpiry: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u062E\u062A\u064A\u0627\u0631\u064A", en: "Optional expiry date" }
  },
  // ===== Edit-profile modal =====
  editModal: {
    uploadAvatar: { ar: "\u0631\u0641\u0639 \u0635\u0648\u0631\u0629", en: "Upload avatar" },
    avatarHint: { ar: "JPG/PNG/WebP \xB7 \u062D\u062F \u0623\u0642\u0635\u0649 3MB", en: "JPG/PNG/WebP \xB7 max 3MB" },
    gender: { ar: "\u0627\u0644\u062C\u0646\u0633", en: "Gender" },
    phone: { ar: "\u0627\u0644\u0647\u0627\u062A\u0641", en: "Phone" },
    save: { ar: "\u062D\u0641\u0638", en: "Save" }
  },
  // ===== Create-student modal =====
  createModal: {
    title: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0637\u0627\u0644\u0628 \u062C\u062F\u064A\u062F", en: "Add new student" },
    phone: { ar: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", en: "Phone" },
    phoneHint: { ar: "\u0635\u064A\u063A\u0629 \u0633\u0648\u0631\u064A\u0629: \u064A\u0628\u062F\u0623 \u0628\u0640 09 \u0648\u064A\u062A\u0643\u0648\u0646 \u0645\u0646 10 \u0623\u0631\u0642\u0627\u0645.", en: "Syrian format: starts with 09, 10 digits." },
    password: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", en: "Password" },
    passwordHint: { ar: "8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", en: "At least 8 characters." },
    chooseUniversity: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "Choose university" },
    chooseCollege: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0643\u0644\u064A\u0629", en: "Choose college" },
    year: { ar: "\u0627\u0644\u0633\u0646\u0629", en: "Academic year" },
    chooseYear: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0646\u0629", en: "Choose year" },
    genderOptional: { ar: "\u0627\u0644\u062C\u0646\u0633 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Gender (optional)" },
    emailOptional: { ar: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Email (optional)" },
    submit: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628", en: "Create student" }
  },
  // ===== Confirm-reactivation dialog =====
  unban: {
    title: { ar: "\u062A\u0623\u0643\u064A\u062F \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644", en: "Confirm reactivation" },
    question: { ar: "\u0647\u0644 \u062A\u0631\u064A\u062F \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 {{name}}\u061F", en: "Reactivate {{name}}'s account?" },
    description: { ar: "\u0633\u064A\u064F\u0639\u0627\u062F \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u0648\u0631\u0627\u064B \u0648\u064A\u0645\u0643\u0646 \u0644\u0644\u0637\u0627\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0646 \u062C\u062F\u064A\u062F.", en: "The account will be reactivated immediately and the student may sign in again." }
  },
  // ===== Success / failure notices =====
  toasts: {
    sessionRevoked: { ar: "\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Session revoked" },
    sessionRevokeFailed: { ar: "\u0641\u0634\u0644 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629", en: "Revoke failed" },
    subscriptionRevoked: { ar: "\u062A\u0645 \u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", en: "Subscription revoked" },
    subscriptionRevokeFailed: { ar: "\u0641\u0634\u0644 \u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", en: "Revoke failed" },
    banned: { ar: "\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u0637\u0627\u0644\u0628 \u0648\u0625\u0646\u0647\u0627\u0621 \u062C\u0644\u0633\u0627\u062A\u0647 \u0648\u0641\u0642 \u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u062E\u0627\u062F\u0645.", en: "Student banned and their sessions were handled by the server policy." },
    sessionsRevoked: { ar: "\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629 \u0644\u0644\u0637\u0627\u0644\u0628.", en: "All active student sessions were revoked." },
    deviceUnbound: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0631\u0628\u0637 \u062C\u0647\u0627\u0632 \u0627\u0644\u0637\u0627\u0644\u0628. \u0633\u064A\u064F\u0639\u0627\u062F \u0627\u0644\u062A\u062D\u0642\u0642 \u0639\u0646\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u062A\u0627\u0644\u064A.", en: "Student device binding was removed. It will be verified again at the next sign-in." },
    reactivated: { ar: "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 \u0627\u0644\u0637\u0627\u0644\u0628.", en: "Student account reactivated." },
    profileUpdated: { ar: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0645\u0644\u0641 \u0627\u0644\u0637\u0627\u0644\u0628", en: "Student profile updated" },
    updateFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", en: "Update failed" },
    avatarTooLarge: { ar: "\u0627\u0644\u0635\u0648\u0631\u0629 \u0643\u0628\u064A\u0631\u0629 \u062C\u062F\u0627\u064B (\u0627\u0644\u062D\u062F 3MB)", en: "Image too large (max 3MB)" },
    avatarUploaded: { ar: "\u062A\u0645 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0634\u062E\u0635\u064A\u0629", en: "Avatar uploaded" },
    avatarUploadFailed: { ar: "\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629", en: "Avatar upload failed" },
    studentCreated: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062C\u0627\u062D.", en: "Student account created successfully." }
  },
  // ===== Error surfaces (permission denials + catch fallbacks) =====
  errors: {
    loadForbidden: { ar: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u0627\u0644\u0637\u0644\u0627\u0628 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643 \u0627\u0644\u062D\u0627\u0644\u064A.", en: "You do not have permission to view students within your current scope." },
    // Arabic twins added in PR-3-A — the legacy fallbacks were English-only.
    loadFallback: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0637\u0644\u0627\u0628.", en: "Unable to load students." },
    securityLogForbidden: { ar: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A \u0644\u0647\u0630\u0627 \u0627\u0644\u0637\u0627\u0644\u0628.", en: "You do not have permission to view this student\u2019s security log." },
    securityLogFallback: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A.", en: "Unable to load the security log." },
    actionFallback: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0627\u0644\u0645\u062D\u0645\u064A.", en: "The protected action could not be completed." },
    reactivateFallback: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0637\u0627\u0644\u0628.", en: "Unable to reactivate the student." },
    collegesLoadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0643\u0644\u064A\u0627\u062A.", en: "Unable to load colleges." },
    yearsLoadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u0646\u0648\u0627\u062A.", en: "Unable to load academic years." },
    createFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0637\u0627\u0644\u0628.", en: "Unable to create the student." }
  },
  // ===== Form validation messages =====
  validation: {
    banReasonRequired: { ar: "\u0623\u062F\u062E\u0644 \u0633\u0628\u0628 \u0627\u0644\u062D\u0638\u0631 \u0642\u0628\u0644 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629.", en: "Provide a ban reason before continuing." },
    fullNameRequired: { ar: "\u0623\u062F\u062E\u0644 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644.", en: "Enter the full name." },
    phoneInvalid: { ar: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0628\u0640 09 \u0648\u064A\u062A\u0643\u0648\u0646 \u0645\u0646 10 \u0623\u0631\u0642\u0627\u0645.", en: "Phone must start with 09 and be 10 digits." },
    passwordTooShort: { ar: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", en: "Password must be at least 8 characters." },
    cascadeRequired: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u062C\u0627\u0645\u0639\u0629 \u0648\u0627\u0644\u0643\u0644\u064A\u0629 \u0648\u0627\u0644\u0633\u0646\u0629.", en: "Choose university, college and academic year." }
  }
};

// apps/admin-web/src/lib/dictionary/questions.ts
var questionsDict = {
  // ===== Legacy status chip labels (byte-identical to the pre-PR-3 helper) =====
  statusDraft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" },
  statusReview: { ar: "\u0645\u0631\u0627\u062C\u0639\u0629", en: "Review" },
  statusPublished: { ar: "\u0645\u0646\u0634\u0648\u0631", en: "Published" },
  statusArchived: { ar: "\u0645\u0624\u0631\u0634\u0641", en: "Archived" },
  // ===== Static select option labels (toolbar filters + editor) =====
  typeOptions: {
    mcq: { ar: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F", en: "MCQ" },
    trueFalse: { ar: "\u0635\u062D \u0623\u0648 \u062E\u0637\u0623", en: "True / False" },
    multipleSelect: { ar: "\u0627\u062E\u062A\u064A\u0627\u0631\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629", en: "Multiple select" },
    essay: { ar: "\u062A\u062D\u0631\u064A\u0631\u064A", en: "Essay" },
    matching: { ar: "\u0648\u0635\u0644", en: "Matching" }
  },
  difficultyOptions: {
    easy: { ar: "\u0633\u0647\u0644", en: "Easy" },
    medium: { ar: "\u0645\u062A\u0648\u0633\u0637", en: "Medium" },
    hard: { ar: "\u0635\u0639\u0628", en: "Hard" }
  },
  // ===== Async error fallbacks (legacy Arabic-only → both locales) =====
  errors: {
    loadUniversities: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062C\u0627\u0645\u0639\u0627\u062A.", en: "Failed to load universities." },
    loadQuestions: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629.", en: "Failed to load questions." },
    loadColleges: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0643\u0644\u064A\u0627\u062A.", en: "Failed to load colleges." },
    loadYears: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u0646\u0648\u0627\u062A.", en: "Failed to load academic years." },
    loadSemesters: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0641\u0635\u0648\u0644.", en: "Failed to load semesters." },
    loadSubjects: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0648\u0627\u062F.", en: "Failed to load subjects." },
    loadLectures: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0627\u062A.", en: "Failed to load lectures." },
    openQuestion: { ar: "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Failed to open the question." },
    saveQuestion: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Failed to save the question." },
    updateStatus: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Failed to update the question status." },
    deleteQuestion: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Failed to delete the question." },
    openPreview: { ar: "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629.", en: "Failed to open the preview." },
    duplicateQuestion: { ar: "\u062A\u0639\u0630\u0631 \u062A\u0643\u0631\u0627\u0631 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Failed to duplicate the question." },
    bulkAction: { ar: "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0627\u0644\u062C\u0645\u0627\u0639\u064A.", en: "Failed to apply the bulk action." },
    uploadImage: { ar: "\u062A\u0639\u0630\u0631 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629.", en: "Failed to upload the image." }
  },
  // ===== Toasts / confirmations =====
  notices: {
    contextReset: { ar: "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0633\u064A\u0627\u0642 \u0627\u0644\u0645\u062D\u0641\u0648\u0638.", en: "Saved context reset." },
    questionUpdated: { ar: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Question updated." },
    savedAddAnother: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644. \u0623\u0636\u0641 \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u062A\u0627\u0644\u064A \u2014 \u0627\u0644\u0633\u064A\u0627\u0642 \u0645\u062D\u0641\u0648\u0638.", en: "Question saved. Add the next one \u2014 context kept." },
    savedDraft: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644 \u0643\u0645\u0633\u0648\u062F\u0629.", en: "Question saved as a draft." },
    unpublished: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0646\u0634\u0631 \u0627\u0644\u0633\u0624\u0627\u0644 \u0648\u0639\u0627\u062F \u0645\u0633\u0648\u062F\u0629.", en: "Question unpublished and returned to draft." },
    published: { ar: "\u062A\u0645 \u0646\u0634\u0631 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Question published." },
    archived: { ar: "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Question archived." },
    questionDeleted: { ar: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Question deleted." },
    duplicated: { ar: "\u062A\u0645 \u062A\u0643\u0631\u0627\u0631 \u0627\u0644\u0633\u0624\u0627\u0644 \u0643\u0645\u0633\u0648\u062F\u0629 \u062C\u062F\u064A\u062F\u0629.", en: "Question duplicated as a new draft." },
    bulkApplied: { ar: "\u062A\u0645 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0639\u0644\u0649 {{succeeded}} \u0645\u0646 {{requested}} \u0633\u0624\u0627\u0644.", en: "Applied to {{succeeded}} of {{requested}} questions." },
    imageAttached: { ar: "\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0627\u0644\u0635\u0648\u0631\u0629 \u0628\u0627\u0644\u062E\u064A\u0627\u0631.", en: "Image attached to the option." }
  },
  // ===== Editor-side validation =====
  validation: {
    pickSubjectFirst: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0627\u062F\u0629 \u0623\u0648\u0644\u0627\u064B.", en: "Pick a subject first." },
    writeQuestionText: { ar: "\u0627\u0643\u062A\u0628 \u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Write the question text." },
    writeModelAnswer: { ar: "\u0627\u0643\u062A\u0628 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629 \u0644\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u062A\u062D\u0631\u064A\u0631\u064A.", en: "Provide the model answer for the essay question." },
    twoOptionsAndCorrect: { ar: "\u0623\u062F\u062E\u0644 \u062E\u064A\u0627\u0631\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0648\u062D\u062F\u062F \u0625\u062C\u0627\u0628\u0629 \u0635\u062D\u064A\u062D\u0629.", en: "Provide at least two options and mark a correct answer." },
    writeExplanation: { ar: "\u0627\u0643\u062A\u0628 \u0634\u0631\u062D \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u0639\u0644\u0645\u064A.", en: "Write the scientific explanation." }
  },
  // ===== Option image upload =====
  upload: {
    notAnImage: { ar: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0642 \u0644\u064A\u0633 \u0635\u0648\u0631\u0629.", en: "The attached file is not an image." },
    exceedsSizeLimit: { ar: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062A\u062C\u0627\u0648\u0632 5 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.", en: "The image exceeds the 5 MB limit." },
    optionImageTitle: { ar: "\u0635\u0648\u0631\u0629 \u062E\u064A\u0627\u0631 \u0633\u0624\u0627\u0644", en: "Question option image" },
    storageFailed: { ar: "\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641 \u0625\u0644\u0649 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 ({{status}}).", en: "Storage upload failed ({{status}})." },
    publicUrlMissing: { ar: "\u062A\u0645 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629\u060C \u0644\u0643\u0646 \u0631\u0627\u0628\u0637\u0647\u0627 \u0627\u0644\u0639\u0627\u0645 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0648\u0644\u064A\u062F \u2014 \u0627\u0636\u0628\u0637 VITE_R2_PUBLIC_BASE \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0625\u0631\u0641\u0627\u0642\u060C \u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062F\u0648\u064A\u0627\u064B.", en: "Image uploaded, but its public URL cannot be derived \u2014 set VITE_R2_PUBLIC_BASE and re-attach, or paste the image URL manually." }
  },
  // ===== Page header =====
  header: {
    sectionLabel: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic content management" },
    title: { ar: "\u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Question Bank" },
    subtitle: { ar: "\u0623\u062F\u0627\u0631\u0629 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0627\u062F\u0629\u060C \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629\u060C \u0648\u0627\u0644\u0634\u0631\u062D \u0627\u0644\u0639\u0644\u0645\u064A.", en: "Manage subject questions, model answers, and scientific explanations." },
    newQuestion: { ar: "\u0633\u0624\u0627\u0644 \u062C\u062F\u064A\u062F", en: "New question" },
    importQuestions: { ar: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0623\u0633\u0626\u0644\u0629", en: "Import questions" }
  },
  // ===== Academic hierarchy filters =====
  filters: {
    university: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "University" },
    college: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629", en: "College" },
    year: { ar: "\u0627\u0644\u0633\u0646\u0629", en: "Year" },
    semester: { ar: "\u0627\u0644\u0641\u0635\u0644", en: "Semester" },
    subject: { ar: "\u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject" },
    select: { ar: "\u0627\u062E\u062A\u0631 {{label}}", en: "Select {{labelLower}}" }
  },
  // ===== Empty states =====
  empty: {
    pickSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0641\u062A\u062D \u0628\u0646\u0643 \u0623\u0633\u0626\u0644\u062A\u0647\u0627.", en: "Select a subject to open its question bank." },
    hierarchyHint: { ar: "\u0627\u0644\u062A\u062F\u0631\u062C \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0623\u0639\u0644\u0627\u0647 \u064A\u0642\u0648\u062F\u0643 \u0645\u0646 \u0627\u0644\u062C\u0627\u0645\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0627\u062F\u0629.", en: "The hierarchy above leads from university down to subject." },
    noQuestions: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629", en: "No questions" },
    noQuestionsFiltered: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0636\u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u062A\u0635\u0641\u064A\u0629.", en: "No questions match these filters." }
  },
  // ===== List toolbar =====
  toolbar: {
    searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0641\u064A \u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Search question text" },
    allTypes: { ar: "\u0643\u0644 \u0627\u0644\u0623\u0646\u0648\u0627\u0639", en: "All types" },
    allStatuses: { ar: "\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A", en: "All statuses" }
  },
  // ===== Bulk actions bar =====
  bulk: {
    toolbarLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u062C\u0645\u0627\u0639\u064A\u0629", en: "Bulk actions" },
    selected: { ar: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062F {{count}} \u0633\u0624\u0627\u0644", en: "{{count}} selected" },
    publishSelected: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0645\u062D\u062F\u062F", en: "Publish selected" },
    archiveSelected: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0645\u062D\u062F\u062F", en: "Archive selected" },
    clearSelection: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062D\u062F\u064A\u062F", en: "Clear selection" }
  },
  // ===== Question table =====
  table: {
    selectAll: { ar: "\u062A\u062D\u062F\u064A\u062F \u0643\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Select all questions" },
    colQuestion: { ar: "\u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Question" },
    colType: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    colDifficulty: { ar: "\u0627\u0644\u0635\u0639\u0648\u0628\u0629", en: "Difficulty" },
    colStatus: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
    colLecture: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "Lecture" },
    colTags: { ar: "\u0627\u0644\u0648\u0633\u0648\u0645", en: "Tags" },
    colAttempts: { ar: "\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A", en: "Attempts" },
    colCorrectRate: { ar: "\u0646\u0633\u0628\u0629 \u0627\u0644\u0625\u0635\u0627\u0628\u0629", en: "Correct rate" },
    colActions: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
    selectQuestion: { ar: "\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0633\u0624\u0627\u0644: {{text}}", en: "Select question: {{text}}" },
    subjectLevel: { ar: "\u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject-level" },
    optionsCountSuffix: { ar: "\u062E\u064A\u0627\u0631\u0627\u062A", en: "opts" },
    noAttempts: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0628\u0639\u062F", en: "No attempts yet" }
  },
  // ===== Row menu + action bar + confirm buttons =====
  actions: {
    edit: { ar: "\u062A\u0639\u062F\u064A\u0644", en: "Edit" },
    menuLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A: {{text}}", en: "Actions: {{text}}" },
    preview: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 (\u0643\u0645\u0627 \u064A\u0631\u0627\u0647\u0627 \u0627\u0644\u0637\u0627\u0644\u0628)", en: "Preview (student view)" },
    duplicate: { ar: "\u062A\u0643\u0631\u0627\u0631 \u0643\u0645\u0633\u0648\u062F\u0629 \u062C\u062F\u064A\u062F\u0629", en: "Duplicate as new draft" },
    publish: { ar: "\u0646\u0634\u0631", en: "Publish" },
    archive: { ar: "\u0623\u0631\u0634\u0641\u0629", en: "Archive" },
    unpublish: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0646\u0634\u0631", en: "Unpublish" },
    delete: { ar: "\u062D\u0630\u0641", en: "Delete" },
    hardDelete: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629)", en: "Hard delete (bypass archive)" }
  },
  // ===== Shared pager (English labels; the component default is Arabic) =====
  pager: {
    prev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    navLabel: { ar: "\u062A\u0635\u0641\u062D \u0627\u0644\u0635\u0641\u062D\u0627\u062A", en: "Question list pagination" },
    pageOf: { ar: "\u0635\u0641\u062D\u0629 {{page}} \u0645\u0646 {{totalPages}}", en: "Page {{page}} of {{totalPages}}" }
  },
  // ===== Slide-in editor =====
  editor: {
    tabs: {
      content: { ar: "\u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Content" },
      explanation: { ar: "\u0627\u0644\u0634\u0631\u062D \u0648\u0627\u0644\u0645\u0631\u0627\u062C\u0639", en: "Explanation & reference" },
      classification: { ar: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0648\u0627\u0644\u0648\u0633\u0648\u0645", en: "Classification & tags" },
      settings: { ar: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", en: "Settings" }
    },
    tablistLabel: { ar: "\u0623\u0642\u0633\u0627\u0645 \u0645\u062D\u0631\u0631 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Question editor sections" },
    editTitle: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Edit question" },
    questionTextLabel: { ar: "\u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Question text" },
    typeLocked: { ar: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0648\u0639 \u0628\u0639\u062F \u0627\u0644\u0625\u0646\u0634\u0627\u0621.", en: "Type cannot change after creation." },
    modelAnswerTitle: { ar: "\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629", en: "Essay model answer" },
    modelAnswerPlaceholder: { ar: "\u0647\u0630\u0647 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0633\u062A\u0638\u0647\u0631 \u0644\u0644\u0637\u0627\u0644\u0628 \u062A\u062D\u062A \u062C\u0648\u0627\u0628\u0647 \u0628\u0639\u062F \u0627\u0644\u062A\u0635\u062D\u064A\u062D.", en: "This answer appears under the student response after grading." },
    gradingNote: { ar: "\u064A\u064F\u062C\u0631\u0649 \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0622\u0644\u064A \u0628\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u0646\u0635 \u0628\u0639\u062F \u062A\u0648\u062D\u064A\u062F \u0627\u0644\u0645\u0633\u0627\u0641\u0627\u062A \u0648\u062D\u0627\u0644\u0629 \u0627\u0644\u0623\u062D\u0631\u0641.", en: "Automatic grading normalizes whitespace and letter case." },
    explanationLabel: { ar: "\u0627\u0644\u0634\u0631\u062D", en: "Explanation" },
    explanationPlaceholder: { ar: "\u0627\u0643\u062A\u0628 \u0627\u0644\u062A\u0648\u0636\u064A\u062D \u0627\u0644\u0639\u0644\u0645\u064A \u0644\u0644\u0633\u0624\u0627\u0644 \u0648\u0625\u062C\u0627\u0628\u062A\u0647.", en: "Write the scientific explanation shown after grading." },
    referenceLabel: { ar: "\u0627\u0644\u0645\u0631\u062C\u0639 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Reference (optional)" },
    lectureLabel: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Lecture (optional)" },
    subjectLevelOption: { ar: "\u0633\u0624\u0627\u0644 \u0639\u0627\u0645 \u0644\u0644\u0645\u0627\u062F\u0629", en: "Subject-level question" },
    tagsLabel: { ar: "\u0627\u0644\u0648\u0633\u0648\u0645 (\u0645\u0641\u0635\u0648\u0644\u0629 \u0628\u0641\u0648\u0627\u0635\u0644)", en: "Tags (comma-separated)" },
    yearLabel: { ar: "\u0633\u0646\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Exam year (optional)" },
    yearPlaceholder: { ar: "\u0645\u062B\u0627\u0644: 2024", en: "e.g. 2024" },
    paragraphTagLabel: { ar: "\u0648\u0633\u0645 \u0627\u0644\u0641\u0642\u0631\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A \u2014 \u0645\u0648\u0642\u0639 \u0627\u0644\u0633\u0624\u0627\u0644 \u0641\u064A \u0627\u0644\u0645\u0646\u0647\u0627\u062C)", en: "Paragraph tag (optional \u2014 position in curriculum)" },
    paragraphTagPlaceholder: { ar: "\u0645\u062B\u0627\u0644: \u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644", en: "e.g. Chapter 1" },
    usageTitle: { ar: "\u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645", en: "Usage" }
  },
  // ===== W21.1 Matching (وصل) board =====
  matching: {
    itemsTitle: { ar: "\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0648\u0635\u0644", en: "Matching items" },
    hintMulti: { ar: "\u0639\u0644\u0651\u0645 \u0644\u0643\u0644 \u0639\u0646\u0635\u0631 \u0643\u0644 \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u0644\u0647 \u2014 \u0625\u062C\u0627\u0628\u0629 \u0648\u0627\u062D\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", en: "Tick every correct target for each prompt \u2014 at least one." },
    hintSingle: { ar: "\u0627\u0631\u0628\u0637 \u0643\u0644 \u0639\u0646\u0635\u0631 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0628\u0625\u062C\u0627\u0628\u062A\u0647 \u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629.", en: "Pair every prompt with its target \u2014 each side used exactly once." },
    multiMapToggle: { ar: "\u0625\u062C\u0627\u0628\u0629 \u0645\u062A\u0639\u062F\u062F\u0629 \u0644\u0643\u0644 \u0639\u0646\u0635\u0631 (\u0648\u0635\u0644 \u0645\u062A\u0639\u062F\u062F)", en: "Multi-map (prompt \u2192 several targets)" },
    promptNumbering: { ar: "\u062A\u0631\u0642\u064A\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0648\u0644\u0649:", en: "Prompt numbering:" },
    targetNumbering: { ar: "\u062A\u0631\u0642\u064A\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629:", en: "Target numbering:" },
    numbering: {
      arabicLetters: { ar: "\u0623 \u0628 \u062C", en: "\u0623 \u0628 \u062C (Arabic)" },
      digits: { ar: "1 2 3", en: "1 2 3 (digits)" },
      latinLetters: { ar: "A B C", en: "A B C (Latin)" }
    },
    list1Title: { ar: "\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u2014 \u0627\u0644\u0639\u0646\u0627\u0635\u0631", en: "List 1 \u2014 prompts" },
    list2Title: { ar: "\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629 \u2014 \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A", en: "List 2 \u2014 targets" },
    promptPlaceholder: { ar: "\u0646\u0635 \u0627\u0644\u0639\u0646\u0635\u0631", en: "Prompt text" },
    targetPlaceholder: { ar: "\u0646\u0635 \u0627\u0644\u0625\u062C\u0627\u0628\u0629", en: "Target text" },
    removePrompt: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0639\u0646\u0635\u0631", en: "Remove prompt" },
    removeTarget: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0625\u062C\u0627\u0628\u0629", en: "Remove target" },
    addPrompt: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0639\u0646\u0635\u0631", en: "Add prompt" },
    addTarget: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0625\u062C\u0627\u0628\u0629", en: "Add target" },
    newItem: { ar: "(\u0639\u0646\u0635\u0631 \u062C\u062F\u064A\u062F)", en: "(new item)" },
    paired: { ar: "\u0645\u0631\u0628\u0648\u0637", en: "paired" },
    pairSelectLabel: { ar: "\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u0644\u0644\u0639\u0646\u0635\u0631 {{label}}", en: "Correct target for prompt {{index}}" },
    selectTargetPlaceholder: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629\u2026", en: "Select the correct target\u2026" },
    takenSuffix: { ar: " \u2014 \u0645\u0633\u062A\u062E\u062F\u0645 \u0644\u0639\u0646\u0635\u0631 \u0622\u062E\u0631", en: " \u2014 taken" },
    gradingMulti: { ar: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u062A\u0635\u062D\u064A\u062D (\u0648\u0635\u0644 \u0645\u062A\u0639\u062F\u062F): \u064A\u064F\u062D\u0633\u0628 \u0627\u0644\u0639\u0646\u0635\u0631 \u0635\u062D\u064A\u062D\u0627\u064B \u0641\u0642\u0637 \u0625\u0630\u0627 \u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0637\u0627\u0644\u0628 \u0645\u062C\u0645\u0648\u0639\u0629 \u0625\u062C\u0627\u0628\u0627\u062A\u0647 \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u0643\u0627\u0645\u0644\u0629 \u0628\u0644\u0627 \u0632\u064A\u0627\u062F\u0629 \u2014 \u0648\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u062A\u062A\u0637\u0644\u0628 \u0643\u0644 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0635\u062D\u064A\u062D\u0629.", en: "Multi-map grading: a prompt is correct only when the student selects exactly its full set of correct targets; full marks need every prompt correct." },
    gradingSingle: { ar: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u062A\u0635\u062D\u064A\u062D: \u062A\u064F\u062D\u0633\u0628 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0635\u062D\u064A\u062D\u0629 \u0641\u0642\u0637 \u0625\u0630\u0627 \u062A\u0637\u0627\u0628\u0642\u062A \u0643\u0644 \u0627\u0644\u0623\u0632\u0648\u0627\u062C \u2014 \u064A\u064F\u0639\u0631\u0636 \u0644\u0644\u0637\u0627\u0644\u0628 \u0628\u0639\u062F \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0632\u0648\u062C \u0627\u0644\u0635\u062D\u064A\u062D \u0644\u0643\u0644 \u0639\u0646\u0635\u0631 \u0623\u062E\u0637\u0623 \u0641\u064A\u0647.", en: "Grading is all-or-nothing across pairs \u2014 after grading the student sees the correct target for every wrong pair." }
  },
  // ===== Options editor =====
  options: {
    title: { ar: "\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A", en: "Options" },
    hintTrueFalse: { ar: "\u062D\u062F\u062F \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u062B\u0645 \u0623\u0636\u0641 \u0627\u0644\u0634\u0631\u062D.", en: "Choose the correct answer, then add the explanation." },
    hintDefault: { ar: "\u062D\u062F\u062F \u062E\u064A\u0627\u0631\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", en: "Mark at least one correct option." },
    moveUp: { ar: "\u0623\u0639\u0644\u0649", en: "Up" },
    moveDown: { ar: "\u0623\u0633\u0641\u0644", en: "Down" },
    remove: { ar: "\u062D\u0630\u0641", en: "Remove" },
    imageAlt: { ar: "\u0635\u0648\u0631\u0629 \u0627\u0644\u062E\u064A\u0627\u0631", en: "Option image" },
    removeImage: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0635\u0648\u0631\u0629", en: "Remove image" },
    uploading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u0631\u0641\u0639\u2026", en: "Uploading\u2026" },
    uploadImage: { ar: "\u0631\u0641\u0639 \u0635\u0648\u0631\u0629", en: "Upload image" },
    imageUrlPlaceholder: { ar: "\u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0639\u0627\u0645", en: "or paste a public image URL" },
    addOption: { ar: "\u0625\u0636\u0627\u0641\u0629 \u062E\u064A\u0627\u0631", en: "Add option" }
  },
  // ===== Editor settings tab =====
  settings: {
    publishStatusTitle: { ar: "\u062D\u0627\u0644\u0629 \u0627\u0644\u0646\u0634\u0631", en: "Publish status" },
    draftNewQuestion: { ar: "\u0645\u0633\u0648\u062F\u0629 (\u0633\u0624\u0627\u0644 \u062C\u062F\u064A\u062F)", en: "Draft (new question)" },
    actionBarNote: { ar: "\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0646\u0634\u0631/\u0627\u0644\u0623\u0631\u0634\u0641\u0629/\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0646\u0634\u0631 \u0641\u064A \u0634\u0631\u064A\u0637 \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0623\u0633\u0641\u0644 \u0627\u0644\u0645\u062D\u0631\u0631.", en: "Publish / archive / unpublish buttons live in the action bar below." },
    explanationScopeNote: { ar: "\u0645\u0644\u0627\u062D\u0638\u0629: \u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0634\u0631\u062D \u0628\u0639\u062F \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0625\u0639\u062F\u0627\u062F \u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u0644\u064A\u0633 \u0644\u0643\u0644 \u0633\u0624\u0627\u0644 \u2014 \u064A\u064F\u0636\u0628\u0637 \u0639\u0646\u062F \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0641\u064A \u0645\u0631\u0643\u0632 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A.", en: "Note: showing explanations after grading is an exam-level setting, not per-question \u2014 configure it when creating the exam in the Exams Center." }
  },
  // ===== Editor action bar =====
  actionBar: {
    close: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close" },
    resetContextTitle: { ar: "\u0645\u0633\u062D \u0627\u0644\u0633\u064A\u0627\u0642 \u0627\u0644\u0645\u062D\u0641\u0648\u0638 (\u0627\u0644\u0634\u0644\u0627\u0644 \u0648\u0627\u0644\u0646\u0648\u0639 \u0648\u0627\u0644\u0648\u0633\u0648\u0645 \u0648\u0627\u0644\u0633\u0646\u0629 \u0648\u0648\u0633\u0645 \u0627\u0644\u0641\u0642\u0631\u0629)", en: "Clear the saved context (cascade, type, tags, year, paragraph tag)" },
    resetContext: { ar: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0633\u064A\u0627\u0642", en: "Reset context" },
    saveAddAnotherTitle: { ar: "\u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644 \u0648\u0627\u0644\u0628\u062F\u0621 \u0628\u0627\u0644\u062A\u0627\u0644\u064A \u0645\u0639 \u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0638 \u0628\u0627\u0644\u0633\u064A\u0627\u0642 (\u0627\u0644\u0634\u0644\u0627\u0644\u060C \u0627\u0644\u0646\u0648\u0639\u060C \u0627\u0644\u0635\u0639\u0648\u0628\u0629\u060C \u0627\u0644\u0648\u0633\u0648\u0645\u060C \u0627\u0644\u0633\u0646\u0629\u060C \u0648\u0633\u0645 \u0627\u0644\u0641\u0642\u0631\u0629)", en: "Save this question and start the next with the context kept (cascade, type, difficulty, tags, year, paragraph tag)" },
    saveAddAnother: { ar: "\u062D\u0641\u0638 \u0648\u0625\u0636\u0627\u0641\u0629 \u0622\u062E\u0631", en: "Save & add another" },
    saveChanges: { ar: "\u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644", en: "Save changes" },
    saveAsDraft: { ar: "\u062D\u0641\u0638 \u0643\u0645\u0633\u0648\u062F\u0629", en: "Save as draft" }
  },
  // ===== Confirm dialog (publish / archive / unpublish / delete) =====
  confirm: {
    publishTitle: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Publish question" },
    archiveTitle: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Archive question" },
    unpublishTitle: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0646\u0634\u0631 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Unpublish question" },
    deleteTitle: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Delete question" },
    publishBody: { ar: "\u0633\u064A\u064F\u062A\u0627\u062D \u0627\u0644\u0633\u0624\u0627\u0644 \u0644\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0645\u062E\u0648\u0651\u0644\u064A\u0646 \u0636\u0645\u0646 \u0645\u0627\u062F\u062A\u0647.", en: "The question will become available to entitled students within its subject." },
    archiveBody: { ar: "\u0633\u064A\u064F\u062E\u0641\u0649 \u0627\u0644\u0633\u0624\u0627\u0644 \u0645\u0646 \u0627\u0644\u0637\u0644\u0627\u0628 \u0644\u0643\u0646\u0647 \u064A\u0628\u0642\u0649 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.", en: "The question will be hidden from students but kept in the database." },
    unpublishBody: { ar: "\u0633\u064A\u0639\u0648\u062F \u0627\u0644\u0633\u0624\u0627\u0644 \u0625\u0644\u0649 \u0645\u0633\u0648\u062F\u0629 \u0648\u064A\u064F\u062E\u0641\u0649 \u0639\u0646 \u0627\u0644\u0637\u0644\u0627\u0628 \u062D\u062A\u0649 \u0625\u0639\u0627\u062F\u0629 \u0646\u0634\u0631\u0647.", en: "The question returns to draft and stays hidden from students until republished." },
    deleteBody: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645. \u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.", en: "This action is permanent. The question will be removed permanently." },
    cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" }
  },
  // ===== W14.3 B.3: question preview (student view) =====
  preview: {
    title: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Question preview" },
    imageAlt: { ar: "\u0635\u0648\u0631\u0629 \u0645\u0631\u0641\u0642\u0629 \u0628\u0627\u0644\u0633\u0624\u0627\u0644", en: "Question image" },
    matchingNote: { ar: "\u0633\u0624\u0627\u0644 \u0648\u0635\u0644 \u2014 \u062A\u0639\u0631\u0636 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644 \u0641\u0642\u0637. \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0648\u0627\u0644\u0623\u0632\u0648\u0627\u062C \u062A\u064F\u062D\u0631\u064E\u0651\u0631 \u0648\u062A\u064F\u0639\u0627\u064A\u0646 \u0645\u0646 \u0645\u062D\u0631\u0631 \u0627\u0644\u0633\u0624\u0627\u0644.", en: "Matching question \u2014 the preview shows the question text only. Items and pairs are authored and reviewed in the question editor." },
    footerNote: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 \u0643\u0645\u0627 \u064A\u0631\u0627\u0647\u0627 \u0627\u0644\u0637\u0627\u0644\u0628 \u2014 \u062F\u0648\u0646 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u0623\u0648 \u0627\u0644\u0634\u0631\u062D.", en: "Previewed exactly as the student sees it \u2014 no correct answer or explanation." }
  },
  // ===== Hard delete dialog consequence =====
  hardDelete: {
    consequence: { ar: "\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644 \u0646\u0647\u0627\u0626\u064A\u064B\u0627 \u0645\u0639 \u062E\u064A\u0627\u0631\u0627\u062A\u0647 \u0648\u0635\u0648\u0631\u0647 \u0648\u0633\u062C\u0644\u0651 \u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647 \u0641\u064A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0645\u0645\u0627\u0631\u0633\u0629 (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629).", en: "The question is physically deleted with its options, images and usage history (bypassing archive)." }
  },
  // ===== QuestionImportModal — CSV row-error interpolation =====
  rowError: { ar: "\u0627\u0644\u0633\u0637\u0631 {{row}}: {{message}}", en: "Row {{row}}: {{message}}" }
};

// apps/admin-web/src/lib/dictionary/exams.ts
var examsDict = {
  // ExamsCenter page header.
  header: {
    kicker: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic content management" },
    title: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "Exams" },
    subtitle: { ar: "\u062A\u0635\u0645\u064A\u0645 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A\u060C \u0646\u0634\u0631\u0647\u0627\u060C \u0648\u0642\u0631\u0627\u0621\u0629 \u0646\u062A\u0627\u0626\u062C\u0647\u0627.", en: "Design, publish, and audit exam outcomes." },
    newExam: { ar: "\u0627\u062E\u062A\u0628\u0627\u0631 \u062C\u062F\u064A\u062F", en: "New exam" }
  },
  // Academic hierarchy filter bar (shared verbatim by both centers).
  filters: {
    university: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "University" },
    college: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629", en: "College" },
    year: { ar: "\u0627\u0644\u0633\u0646\u0629", en: "Year" },
    semester: { ar: "\u0627\u0644\u0641\u0635\u0644", en: "Semester" },
    subject: { ar: "\u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject" },
    select: { ar: "\u0627\u062E\u062A\u0631 {{label}}", en: "Select {{label}}" },
    pickSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0641\u062A\u062D \u0625\u062F\u0627\u0631\u0629 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A\u0650\u0647\u0627.", en: "Select a subject to manage its exams." },
    hierarchyHint: { ar: "\u0627\u0644\u062A\u062F\u0631\u062C \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0623\u0639\u0644\u0627\u0647 \u064A\u0642\u0648\u062F\u0643 \u0645\u0646 \u0627\u0644\u062C\u0627\u0645\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0627\u062F\u0629.", en: "The hierarchy above leads from university down to subject." }
  },
  // Exams list toolbar.
  toolbar: {
    searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0628\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0623\u0648 \u0631\u0627\u0628\u0637\u0647", en: "Search title or slug" },
    statusFilterA11y: { ar: "\u062A\u0635\u0641\u064A\u0629 \u062D\u0627\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Filter by exam status" },
    allStatuses: { ar: "\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A", en: "All statuses" }
  },
  // W2 pager — English overrides only; Arabic rides the @cms/ui Pagination defaults.
  pager: {
    prev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    navLabel: { ar: "\u062A\u0635\u0641\u062D \u0627\u0644\u0635\u0641\u062D\u0627\u062A", en: "Exam list pagination" },
    pageOf: { ar: "\u0635\u0641\u062D\u0629 {{page}} \u0645\u0646 {{total}}", en: "Page {{page}} of {{total}}" }
  },
  // Legacy default-Draft answer for wire values the old switch did not know (the registry would answer «غير محدد»/«Unspecified» there, which would change pre-PR-3 output).
  status: {
    draft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" }
  },
  // EXAM types only (W22.1) — question types ride lib/questionLabels.
  examType: {
    final: { ar: "\u0646\u0647\u0627\u0626\u064A", en: "Final" },
    midterm: { ar: "\u0646\u0635\u0641\u064A", en: "Midterm" },
    quiz: { ar: "\u0642\u0635\u064A\u0631", en: "Quiz" },
    practice: { ar: "\u062A\u062F\u0631\u064A\u0628\u064A", en: "Practice" }
  },
  // Attempt/result session statuses (ExamSessionStatus + legacy Abandoned/Expired aliases).
  resultStatus: {
    inProgress: { ar: "\u0642\u064A\u062F \u0627\u0644\u0623\u062F\u0627\u0621", en: "In progress" },
    completed: { ar: "\u0645\u0643\u062A\u0645\u0644", en: "Completed" },
    cancelled: { ar: "\u0645\u0644\u063A\u0649", en: "Cancelled" },
    timedOut: { ar: "\u0627\u0646\u062A\u0647\u0649 \u0648\u0642\u062A\u0647", en: "Timed out" },
    unknown: { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641", en: "Unknown" }
  },
  // Question report classification labels (D12).
  reportType: {
    typo: { ar: "\u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0635\u064A\u0627\u063A\u0629", en: "Typo" },
    wrongAnswer: { ar: "\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629 \u062E\u0627\u0637\u0626\u0629", en: "Wrong answer" },
    badImage: { ar: "\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0633\u0644\u064A\u0645\u0629", en: "Bad image" },
    other: { ar: "\u0623\u062E\u0631\u0649", en: "Other" }
  },
  // Question report triage statuses (D12).
  reportStatus: {
    reviewing: { ar: "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Reviewing" },
    resolved: { ar: "\u062A\u0645 \u0627\u0644\u062D\u0644", en: "Resolved" },
    rejected: { ar: "\u0645\u0631\u0641\u0648\u0636", en: "Rejected" },
    closed: { ar: "\u0645\u063A\u0644\u0642", en: "Closed" },
    pending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631", en: "Pending" }
  },
  // Byte-identical pairs reused by more than one surface of the two centers.
  shared: {
    noAttempts: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0628\u0639\u062F.", en: "No attempts yet." },
    type: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    subjectWide: { ar: "\u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject-wide" },
    durationMinutes: { ar: "\u0627\u0644\u0645\u062F\u0629 (\u062F\u0642\u064A\u0642\u0629)", en: "Duration (min)" },
    attempts: { ar: "\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A", en: "Attempts" }
  },
  // Count/unit words that ride next to interpolated numbers.
  units: {
    questions: { ar: "\u0633\u0624\u0627\u0644", en: "questions" },
    minutes: { ar: "\u062F\u0642\u064A\u0642\u0629", en: "min" }
  },
  // W14.3 D10 per-exam stats dashboard.
  stats: {
    title: { ar: "\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A: {{title}}", en: "Stats: {{title}}" },
    subtitle: { ar: "\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0648\u0627\u0644\u062F\u0631\u062C\u0627\u062A \u0648\u062A\u062D\u0644\u064A\u0644 \u0643\u0644 \u0633\u0624\u0627\u0644.", en: "Attempt metrics, score analytics, and per-question breakdown." },
    openQuestionBank: { ar: "\u0641\u062A\u062D \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Open question bank" },
    closeA11y: { ar: "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A", en: "Close stats" },
    metricsHint: { ar: "\u0633\u062A\u0638\u0647\u0631 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0647\u0646\u0627 \u0628\u0639\u062F \u0623\u0648\u0644 \u0645\u062D\u0627\u0648\u0644\u0629 \u0637\u0627\u0644\u0628.", en: "Metrics appear here after the first student attempt." },
    startedCard: { ar: "\u0628\u062F\u0623\u062A", en: "Started" },
    attemptsCard: { ar: "\u0645\u062D\u0627\u0648\u0644\u0627\u062A", en: "Attempts" },
    completedCard: { ar: "\u0623\u0643\u0645\u0644\u062A", en: "Completed" },
    inProgressCard: { ar: "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630", en: "In progress" },
    timedOutCard: { ar: "\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u062A\u0647\u0627", en: "Timed out" },
    cancelledCard: { ar: "\u0645\u0644\u063A\u0627\u0629", en: "Cancelled" },
    passVsFail: { ar: "\u0627\u0644\u0646\u062C\u0627\u062D \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0631\u0633\u0648\u0628", en: "Pass vs fail" },
    noGradedResults: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0635\u062D\u062D\u0629 \u0628\u0639\u062F.", en: "No graded results yet." },
    pass: { ar: "\u0646\u0627\u062C\u062D", en: "Pass" },
    fail: { ar: "\u0631\u0627\u0633\u0628", en: "Fail" },
    scores: { ar: "\u0627\u0644\u062F\u0631\u062C\u0627\u062A (\u0645\u0646 \u0627\u0644\u0645\u0635\u062D\u062D\u0629 \u0622\u0644\u064A\u0627\u064B)", en: "Scores (auto-graded)" },
    mean: { ar: "\u0627\u0644\u0645\u0639\u062F\u0644", en: "Mean" },
    median: { ar: "\u0627\u0644\u0648\u0633\u064A\u0637", en: "Median" },
    avgDuration: { ar: "\u0645\u062A\u0648\u0633\u0637 \u0632\u0645\u0646 \u0627\u0644\u062D\u0644", en: "Average duration" },
    durationValue: { ar: "{{minutes}} \u062F\u0642\u064A\u0642\u0629 {{seconds}} \u062B\u0627\u0646\u064A\u0629", en: "{{minutes}} min {{seconds}} sec" },
    distribution: { ar: "\u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u062F\u0631\u062C\u0627\u062A", en: "Score distribution" },
    questionStatsTitle: { ar: "\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u0623\u0633\u0626\u0644\u0629 ({{count}})", en: "Question stats ({{count}})" },
    noQuestions: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "This exam has no questions." },
    questionCol: { ar: "\u0627\u0644\u0633\u0624\u0627\u0644", en: "Question" },
    correctCol: { ar: "\u0625\u062C\u0627\u0628\u0627\u062A \u0635\u062D\u064A\u062D\u0629", en: "% correct" },
    mostCommonWrongCol: { ar: "\u0623\u0643\u062B\u0631 \u062E\u064A\u0627\u0631 \u062E\u0627\u0637\u0626", en: "Most common wrong" },
    avgTimeCol: { ar: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0632\u0645\u0646", en: "Avg time" },
    flagCol: { ar: "\u062A\u0646\u0628\u064A\u0647", en: "Flag" },
    secondsValue: { ar: "{{seconds}} \u062B", en: "{{seconds}} s" },
    needsReview: { ar: "\u064A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629", en: "Needs review" }
  },
  // Exams table + empty states.
  list: {
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "No exams" },
    emptyFiltered: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0636\u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u062A\u0635\u0641\u064A\u0629.", en: "No exams match this filter." },
    titleCol: { ar: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Exam title" },
    questionsCol: { ar: "\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Questions" },
    fromWord: { ar: "\u0645\u0646", en: "From" },
    untilWord: { ar: "\u0625\u0644\u0649", en: "Until" },
    maxAttemptsWord: { ar: "\u062D\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A", en: "Max attempts" },
    avgScoreWord: { ar: "\u0627\u0644\u0645\u0639\u062F\u0644", en: "Avg" }
  },
  // Row ⋮ menu entries; the shared verbs (edit/publish/archive/delete) come from the core `common.*` section.
  rowActions: {
    menuLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A {{title}}", en: "Actions for {{title}}" },
    stats: { ar: "\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A", en: "Stats" },
    unpublish: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0646\u0634\u0631 (\u0625\u0639\u0627\u062F\u0629 \u0625\u0644\u0649 \u0645\u0633\u0648\u062F\u0629)", en: "Unpublish (revert to draft)" },
    hardDelete: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629)", en: "Hard delete (bypass archive)" }
  },
  // W14.3 D12 question reports triage.
  reports: {
    title: { ar: "\u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Question reports" },
    subtitle: { ar: "\u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u0637\u0644\u0627\u0628 \u0639\u0646 \u0623\u062E\u0637\u0627\u0621 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u2014 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "Student reports about question errors \u2014 within your academic scope." },
    statusFilterA11y: { ar: "\u062A\u0635\u0641\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u0629", en: "Filter by status" },
    typeFilterA11y: { ar: "\u062A\u0635\u0641\u064A\u0629 \u0627\u0644\u0646\u0648\u0639", en: "Filter by type" },
    allTypes: { ar: "\u0643\u0644 \u0627\u0644\u0623\u0646\u0648\u0627\u0639", en: "All types" },
    closeA11y: { ar: "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Close reports" },
    emptyFiltered: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0636\u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u062A\u0635\u0641\u064A\u0629.", en: "No reports match this filter." },
    resolutionNotes: { ar: "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u062D\u0644:", en: "Resolution notes:" },
    screenshot: { ar: "\u0644\u0642\u0637\u0629 \u0627\u0644\u0634\u0627\u0634\u0629", en: "Screenshot" },
    resolveButton: { ar: "\u062D\u0644 \u0627\u0644\u0628\u0644\u0627\u063A", en: "Resolve" },
    rejectButton: { ar: "\u0631\u0641\u0636 \u0627\u0644\u0628\u0644\u0627\u063A", en: "Reject" },
    resolveDialog: { ar: "\u062D\u0644 \u0627\u0644\u0628\u0644\u0627\u063A", en: "Resolve report" },
    rejectDialog: { ar: "\u0631\u0641\u0636 \u0627\u0644\u0628\u0644\u0627\u063A", en: "Reject report" },
    notesLabel: { ar: "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u062D\u0644 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Resolution notes (optional)" },
    resolveAction: { ar: "\u062D\u0644", en: "Resolve" },
    rejectAction: { ar: "\u0631\u0641\u0636", en: "Reject" },
    resolvedToast: { ar: "\u062A\u0645 \u062D\u0644 \u0627\u0644\u0628\u0644\u0627\u063A \u0648\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A.", en: "Report resolved with notes recorded." },
    rejectedToast: { ar: "\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0628\u0644\u0627\u063A \u0648\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A.", en: "Report rejected with notes recorded." }
  },
  // Slide-in exam editor.
  editor: {
    editTitle: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Edit exam" },
    basicInfo: { ar: "\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629", en: "Basic info" },
    titleArLabel: { ar: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 (\u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629)", en: "Exam title (Arabic)" },
    titleEnLabel: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "English title (optional)" },
    slugLabel: { ar: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062E\u062A\u0635\u0631", en: "Slug" },
    lectureLabel: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Lecture (optional)" },
    descriptionLabel: { ar: "\u0627\u0644\u0648\u0635\u0641 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Description (optional)" },
    availabilityTitle: { ar: "\u0627\u0644\u0625\u062A\u0627\u062D\u0629 \u0648\u0627\u0644\u062A\u0648\u0642\u064A\u062A", en: "Availability & timing" },
    passingScoreLabel: { ar: "\u062F\u0631\u062C\u0629 \u0627\u0644\u0646\u062C\u0627\u062D %", en: "Passing score %" },
    displayOrderLabel: { ar: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0639\u0631\u0636", en: "Display order" },
    maxAttemptsLabel: { ar: "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A", en: "Max attempts" },
    unlimitedPlaceholder: { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F", en: "Unlimited" },
    availableFromLabel: { ar: "\u0645\u062A\u0627\u062D \u0645\u0646", en: "Available from" },
    availableUntilLabel: { ar: "\u0645\u062A\u0627\u062D \u062D\u062A\u0649", en: "Available until" },
    policiesTitle: { ar: "\u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Exam policies" },
    shuffleQuestions: { ar: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0639\u0634\u0648\u0627\u0626\u064A", en: "Shuffle questions" },
    shuffleOptions: { ar: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0639\u0634\u0648\u0627\u0626\u064A", en: "Shuffle options" },
    showResultsAfterSubmission: { ar: "\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0628\u0639\u062F \u0627\u0644\u062A\u0633\u0644\u064A\u0645", en: "Show results after submission" },
    allowReview: { ar: "\u0627\u0644\u0633\u0645\u0627\u062D \u0628\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Allow review" },
    showCorrectAnswers: { ar: "\u0639\u0631\u0636 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0635\u062D\u064A\u062D\u0629", en: "Show correct answers" },
    showExplanations: { ar: "\u0639\u0631\u0636 \u0627\u0644\u0634\u0631\u062D", en: "Show explanations" },
    saveDraft: { ar: "\u062D\u0641\u0638 \u0643\u0645\u0633\u0648\u062F\u0629", en: "Save as draft" }
  },
  // Question builder (selected ↔ candidates).
  compose: {
    title: { ar: "\u0628\u0646\u0627\u0621 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Question builder" },
    selectedTitle: { ar: "\u0623\u0633\u0626\u0644\u0629 \u0645\u062E\u062A\u0627\u0631\u0629", en: "Selected questions" },
    selectedEmpty: { ar: "\u0623\u0636\u0641 \u0623\u0633\u0626\u0644\u0629 \u0645\u0646\u0634\u0648\u0631\u0629 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629.", en: "Add published questions from the candidate list." },
    availableTitle: { ar: "\u0623\u0633\u0626\u0644\u0629 \u0645\u062A\u0627\u062D\u0629", en: "Available questions" },
    availableSubtitle: { ar: "\u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629 \u0648\u0627\u0644\u0645\u0635\u062D\u062D\u0629 \u0622\u0644\u064A\u0627\u064B", en: "Published, auto-graded" },
    searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0641\u064A \u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644", en: "Search question text" },
    noCandidates: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0645\u0624\u0647\u0644\u0629.", en: "No eligible questions." },
    moveUp: { ar: "\u0623\u0639\u0644\u0649", en: "Up" },
    moveDown: { ar: "\u0623\u0633\u0641\u0644", en: "Down" },
    remove: { ar: "\u0625\u0632\u0627\u0644\u0629", en: "Remove" }
  },
  // Per-exam results panel.
  results: {
    title: { ar: "\u0627\u0644\u0646\u062A\u0627\u0626\u062C", en: "Results" },
    studentCol: { ar: "\u0627\u0644\u0637\u0627\u0644\u0628", en: "Student" },
    scoreCol: { ar: "\u0627\u0644\u062F\u0631\u062C\u0629", en: "Score" },
    resultCol: { ar: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629", en: "Result" },
    answeredCol: { ar: "\u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A", en: "Answered" },
    correctCol: { ar: "\u0625\u062C\u0627\u0628\u0627\u062A \u0635\u062D\u064A\u062D\u0629", en: "Correct answers" },
    startedCol: { ar: "\u0627\u0644\u0628\u062F\u0627\u064A\u0629", en: "Started" },
    passed: { ar: "\u0646\u0627\u062C\u062D", en: "Passed" },
    failed: { ar: "\u0631\u0627\u0633\u0628", en: "Failed" }
  },
  // W-coverage student-view preview dialog.
  preview: {
    asStudent: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 \u0643\u0637\u0627\u0644\u0628", en: "Preview as student" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629\u2026", en: "Loading preview\u2026" },
    durationChip: { ar: "\u0627\u0644\u0645\u062F\u0629: {{minutes}} \u062F\u0642\u064A\u0642\u0629", en: "Duration: {{minutes}} min" },
    questionsChip: { ar: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629: {{count}}", en: "Questions: {{count}}" },
    note: { ar: "\u0647\u0630\u0647 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0643\u0645\u0627 \u064A\u0631\u0627\u0647\u0627 \u0627\u0644\u0637\u0627\u0644\u0628: \u0645\u0631\u062A\u0628\u0629 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u062E\u064A\u0627\u0631\u0627\u062A\u0647\u0627 \u062F\u0648\u0646 \u0623\u064A \u0645\u0624\u0634\u0631 \u0644\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0627\u0644\u0635\u062D\u064A\u062D\u0629.", en: "This is the student view: ordered questions and options, with no correctness indicators." }
  },
  // Lifecycle confirm dialog (publish / unpublish / archive / delete).
  confirm: {
    publishTitle: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Publish exam" },
    archiveTitle: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Archive exam" },
    unpublishTitle: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0646\u0634\u0631 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Unpublish exam" },
    deleteTitle: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Delete exam" },
    publishText: { ar: "\u0644\u0627 \u064A\u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631 \u0625\u0644\u0627 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629 \u0648\u0627\u0644\u0645\u0624\u0647\u0644\u0629.", en: "Only published, eligible questions can be used." },
    archiveText: { ar: "\u0633\u064A\u064F\u062E\u0641\u0649 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0637\u0644\u0627\u0628.", en: "The exam will be removed from student discovery." },
    unpublishText: { ar: "\u0633\u064A\u064F\u0639\u0627\u062F \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0625\u0644\u0649 \u0645\u0633\u0648\u062F\u0629 \u0648\u064A\u064F\u062E\u0641\u0649 \u0645\u0646 \u0627\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u062C\u062F\u062F. \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u062A\u062D\u062A\u0641\u0638 \u0628\u0644\u0642\u0637\u062A\u0647\u0627 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0648\u0644\u0627 \u062A\u062A\u0623\u062B\u0631.", en: "The exam reverts to draft and disappears for new students. Existing sessions keep their snapshot and are unaffected." },
    deleteText: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645. \u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0646\u0647\u0627\u0626\u064A\u0627\u064B.", en: "This action is permanent. The exam will be removed permanently." },
    unpublishAction: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0646\u0634\u0631", en: "Unpublish" }
  },
  // onNotice messages.
  toasts: {
    savedDraft: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u062A\u0643\u0648\u064A\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u062A\u0631\u062A\u064A\u0628 \u0623\u0633\u0626\u0644\u062A\u0647 \u0643\u0645\u0633\u0648\u062F\u0629.", en: "Exam configuration and question order saved as a draft." },
    published: { ar: "\u062A\u0645 \u0646\u0634\u0631 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Exam published." },
    unpublished: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0646\u0634\u0631 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u0625\u0639\u0627\u062F\u062A\u0647 \u0625\u0644\u0649 \u0645\u0633\u0648\u062F\u0629.", en: "Exam unpublished and reverted to draft." },
    archived: { ar: "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Exam archived." },
    deleted: { ar: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Exam deleted." }
  },
  // onError fallbacks. The Arabic-only catch/throw fallbacks gained a concise English translation in PR-3; the Arabic text is byte-identical.
  errors: {
    previewLoad: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not load the exam preview." },
    availabilityWindow: { ar: "\u064A\u062C\u0628 \u0623\u0646 \u064A\u0646\u062A\u0647\u064A \u0646\u0637\u0627\u0642 \u0627\u0644\u0625\u062A\u0627\u062D\u0629 \u0628\u0639\u062F \u0628\u062F\u0627\u064A\u062A\u0647.", en: "Availability end must be after its start." },
    loadUniversities: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062C\u0627\u0645\u0639\u0627\u062A.", en: "Could not load universities." },
    loadColleges: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0643\u0644\u064A\u0627\u062A.", en: "Could not load colleges." },
    loadYears: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u0646\u0648\u0627\u062A.", en: "Could not load years." },
    loadSemesters: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0641\u0635\u0648\u0644.", en: "Could not load semesters." },
    loadSubjects: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0648\u0627\u062F.", en: "Could not load subjects." },
    loadLectures: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0627\u062A.", en: "Could not load lectures." },
    loadExams: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A.", en: "Could not load exams." },
    loadCandidates: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0624\u0647\u0644\u0629 \u0644\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not load exam-eligible questions." },
    openExam: { ar: "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not open the exam." },
    missingExamId: { ar: "\u0644\u0645 \u064A\u0639\u064F\u062F \u0627\u0644\u062E\u0627\u062F\u0645 \u0628\u0645\u0639\u0631\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "The server did not return an exam id." },
    saveExam: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not save the exam." },
    updateStatus: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not update the exam status." },
    deleteExam: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not delete the exam." },
    loadResults: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not load the exam results." },
    loadStats: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not load the exam statistics." },
    loadReports: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u0623\u0633\u0626\u0644\u0629.", en: "Could not load question reports." },
    actOnReport: { ar: "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0625\u062C\u0631\u0627\u0621 \u0627\u0644\u0628\u0644\u0627\u063A.", en: "Could not apply the report action." }
  },
  // Command Center P1 physical-delete consequence (SuperAdmin).
  hardDelete: {
    consequence: { ar: "\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0646\u0647\u0627\u0626\u064A\u064B\u0627 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629) \u0645\u0639 \u062C\u0644\u0633\u0627\u062A\u0647 \u0648\u0646\u062A\u0627\u0626\u062C\u0647 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629.", en: "The exam is physically deleted (bypassing archive) with its sessions and results." }
  },
  // ExamCoursesCenter (W14.3 D1 exam-course bundles).
  examCourses: {
    header: {
      kicker: { ar: "\u0627\u0644\u062F\u0648\u0631\u0627\u062A \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Exam courses" },
      title: { ar: "\u0628\u0627\u0642\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0628\u064A\u0639", en: "Purchasable exam bundles" },
      subtitle: { ar: "\u0623\u0646\u0634\u0626 \u062F\u0648\u0631\u0627\u062A \u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629 \u0644\u0645\u0627\u062F\u0629 \u0648\u0627\u062D\u062F\u0629\u060C \u0631\u062A\u0651\u0628 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A\u0647\u0627\u060C \u0648\u0627\u0646\u0634\u0631\u0647\u0627 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631.", en: "Create per-subject bundles, order their exams, and publish them to the storefront." },
      newBundle: { ar: "\u062F\u0648\u0631\u0629 \u062C\u062F\u064A\u062F\u0629", en: "New bundle" }
    },
    filters: {
      pickSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0625\u062F\u0627\u0631\u0629 \u062F\u0648\u0631\u0627\u062A\u0647\u0627 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629.", en: "Select a subject to manage its exam bundles." }
    },
    // Bundle course types (R78 wire values).
    courseType: {
      first: { ar: "\u062F\u0648\u0631\u0629 \u0623\u0648\u0644\u0649", en: "First diet" },
      second: { ar: "\u062F\u0648\u0631\u0629 \u062B\u0627\u0646\u064A\u0629", en: "Second diet" },
      supplementary: { ar: "\u062F\u0648\u0631\u0629 \u062A\u0643\u0645\u064A\u0644\u064A\u0629", en: "Supplementary" },
      model: { ar: "\u062F\u0648\u0631\u0629 \u0646\u0645\u0648\u0630\u062C\u064A\u0629", en: "Model papers" },
      practice: { ar: "\u062F\u0648\u0631\u0629 \u062A\u062F\u0631\u064A\u0628\u064A\u0629", en: "Practice drills" }
    },
    // `deleted` is an ExamCourses-only wire value (published/archived/draft ride the publication registry).
    status: {
      deleted: { ar: "\u0645\u062D\u0630\u0648\u0641", en: "Deleted" }
    },
    semester: {
      first: { ar: "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644", en: "Semester 1" },
      second: { ar: "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062B\u0627\u0646\u064A", en: "Semester 2" },
      third: { ar: "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062B\u0627\u0644\u062B / \u0635\u064A\u0641\u064A", en: "Semester 3 / summer" },
      generic: { ar: "\u0627\u0644\u0641\u0635\u0644 {{value}}", en: "Semester {{value}}" }
    },
    pricing: {
      label: { ar: "\u0627\u0644\u0633\u0639\u0631", en: "Pricing" },
      free: { ar: "\u0645\u062C\u0627\u0646\u064A", en: "Free" },
      paid: { ar: "\u0645\u062F\u0641\u0648\u0639", en: "Paid" }
    },
    modelWord: { ar: "\u0646\u0645\u0648\u0630\u062C", en: "Model" },
    editor: {
      backToList: { ar: "\u0631\u062C\u0648\u0639 \u0625\u0644\u0649 \u0627\u0644\u0642\u0627\u0626\u0645\u0629", en: "Back to list" },
      newTitle: { ar: "\u062F\u0648\u0631\u0629 \u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629 \u062C\u062F\u064A\u062F\u0629", en: "New exam bundle" },
      editTitle: { ar: "\u062A\u0639\u062F\u064A\u0644: {{name}}", en: "Edit: {{name}}" },
      createBundle: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062F\u0648\u0631\u0629", en: "Create bundle" },
      saveChanges: { ar: "\u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A", en: "Save changes" },
      metadataTitle: { ar: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u0648\u0631\u0629", en: "Bundle metadata" },
      nameArLabel: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 *", en: "Arabic name *" },
      nameArPlaceholder: { ar: "\u0645\u062B\u0627\u0644: \u062F\u0648\u0631\u0629 \u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0646\u0635\u0641 \u0627\u0644\u0633\u0646\u0629", en: "e.g. Midterm exams bundle" },
      nameEnLabel: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629", en: "English name" },
      descriptionLabel: { ar: "\u0627\u0644\u0648\u0635\u0641", en: "Description" },
      yearLabel: { ar: "\u0627\u0644\u0633\u0646\u0629 *", en: "Year *" },
      semesterLabel: { ar: "\u0627\u0644\u0641\u0635\u0644 *", en: "Semester *" },
      typeLabel: { ar: "\u0646\u0648\u0639 \u0627\u0644\u062F\u0648\u0631\u0629 *", en: "Bundle type *" },
      sortOrderLabel: { ar: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0638\u0647\u0648\u0631", en: "Display sort order" },
      coverLabel: { ar: "\u0635\u0648\u0631\u0629 \u0627\u0644\u063A\u0644\u0627\u0641", en: "Cover image" },
      coverAlt: { ar: "\u063A\u0644\u0627\u0641 \u0627\u0644\u062F\u0648\u0631\u0629", en: "Bundle cover" },
      removeCoverA11y: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u063A\u0644\u0627\u0641", en: "Remove cover" },
      uploadImage: { ar: "\u0631\u0641\u0639 \u0635\u0648\u0631\u0629", en: "Upload image" },
      coverUrlPlaceholder: { ar: "\u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629", en: "or paste an image URL" },
      examsTitle: { ar: "\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u0648\u0631\u0629 ({{count}})", en: "Bundle exams ({{count}})" },
      addExam: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0627\u062E\u062A\u0628\u0627\u0631", en: "Add exam" },
      noExams: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0641\u064A \u0627\u0644\u062F\u0648\u0631\u0629 \u0628\u0639\u062F \u2014 \u0623\u0636\u0641 \u0623\u0648\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0645\u0627\u062F\u0629.", en: "No exams in this bundle yet \u2014 add the first one from the subject bank." },
      moveUp: { ar: "\u062A\u062D\u0631\u064A\u0643 \u0644\u0623\u0639\u0644\u0649", en: "Move up" },
      moveDown: { ar: "\u062A\u062D\u0631\u064A\u0643 \u0644\u0623\u0633\u0641\u0644", en: "Move down" },
      removeExam: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Remove exam" },
      createFirstHint: { ar: "\u0623\u0646\u0634\u0626 \u0627\u0644\u062F\u0648\u0631\u0629 \u0623\u0648\u0644\u0627\u064B \u2014 \u0628\u0639\u062F\u0647\u0627 \u064A\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0627\u062F\u0629 \u0648\u062A\u0631\u062A\u064A\u0628\u0647\u0627.", en: "Create the bundle first \u2014 then you can add and order the subject exams." }
    },
    list: {
      empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062F\u0648\u0631\u0627\u062A \u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "No exam bundles" },
      emptyHint: { ar: "\u0623\u0646\u0634\u0626 \u0623\u0648\u0644 \u062F\u0648\u0631\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 \u0628\u0632\u0631 \xAB\u062F\u0648\u0631\u0629 \u062C\u062F\u064A\u062F\u0629\xBB.", en: 'Create the first bundle for this subject with "New bundle".' },
      bundleCol: { ar: "\u0627\u0644\u062F\u0648\u0631\u0629", en: "Bundle" },
      yearSemesterCol: { ar: "\u0627\u0644\u0633\u0646\u0629 / \u0627\u0644\u0641\u0635\u0644", en: "Year / Semester" },
      examsCol: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "Exams" }
    },
    actions: {
      manage: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062F\u0648\u0631\u0629", en: "Manage bundle" },
      preview: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629", en: "Preview" }
    },
    // Exam picker modal (edit mode).
    picker: {
      dialogA11y: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0627\u062E\u062A\u0628\u0627\u0631 \u0625\u0644\u0649 \u0627\u0644\u062F\u0648\u0631\u0629", en: "Add exam to bundle" },
      title: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Add an exam from the subject bank" },
      searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0628\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Search by exam title" },
      empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0625\u0636\u0627\u0641\u0629 \u2014 \u0643\u0644 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0627\u062F\u0629 \u0645\u0636\u0627\u0641\u0629 \u0628\u0627\u0644\u0641\u0639\u0644.", en: "Nothing left to add \u2014 every subject exam is already in the bundle." },
      add: { ar: "\u0625\u0636\u0627\u0641\u0629", en: "Add" }
    },
    // Student storefront preview modal.
    preview: {
      dialogA11y: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629: {{name}}", en: "Preview: {{name}}" },
      examsTitle: { ar: "\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u0648\u0631\u0629 ({{count}}) \u2014 \u0628\u062A\u0631\u062A\u064A\u0628 \u0638\u0647\u0648\u0631\u0647\u0627 \u0644\u0644\u0637\u0627\u0644\u0628", en: "Bundle exams ({{count}}) \u2014 in student order" },
      noExams: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u062F\u0648\u0631\u0629 \u0628\u0639\u062F.", en: "No exams in this bundle yet." }
    },
    confirm: {
      publishTitle: { ar: "\u0646\u0634\u0631 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Publish bundle" },
      archiveTitle: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Archive bundle" },
      deleteTitle: { ar: "\u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Delete bundle" },
      publishText: { ar: "\u0633\u062A\u0635\u0628\u062D \u0627\u0644\u062F\u0648\u0631\u0629 \u0638\u0627\u0647\u0631\u0629 \u0641\u064A \u0645\u062A\u062C\u0631 \u0627\u0644\u0637\u0644\u0627\u0628 \u062D\u0633\u0628 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A\u0647\u0645.", en: "The bundle becomes visible in the student storefront per subscriptions." },
      archiveText: { ar: "\u0633\u062A\u064F\u062E\u0641\u0649 \u0627\u0644\u062F\u0648\u0631\u0629 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0637\u0644\u0627\u0628 \u0645\u0639 \u0627\u0644\u062D\u0641\u0627\u0638 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A\u0647\u0627.", en: "The bundle is hidden from students; its data is preserved." },
      deleteText: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645. \u0633\u064A\u064F\u062D\u0630\u0641 \u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u062F\u0648\u0631\u0629 \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631.", en: "This action is permanent. The bundle content is removed from the storefront." }
    },
    toasts: {
      saved: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Bundle saved." },
      created: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629 \u2014 \u0623\u0636\u0641 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A\u0647\u0627 \u0645\u0646 \u0632\u0631 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A.", en: "Bundle created \u2014 manage its exams next." },
      published: { ar: "\u062A\u0645 \u0646\u0634\u0631 \u0627\u0644\u062F\u0648\u0631\u0629 \u2014 \u0633\u062A\u0638\u0647\u0631 \u0644\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0645\u062E\u0648\u0651\u0644\u064A\u0646.", en: "Bundle published for entitled students." },
      archived: { ar: "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u062F\u0648\u0631\u0629 \u0648\u0625\u062E\u0641\u0627\u0624\u0647\u0627 \u0639\u0646 \u0627\u0644\u0637\u0644\u0627\u0628.", en: "Bundle archived and hidden from students." },
      deleted: { ar: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629.", en: "Bundle deleted." },
      examAdded: { ar: "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0625\u0644\u0649 \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Exam added to the bundle." },
      examRemoved: { ar: "\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Exam removed from the bundle." },
      coverAttached: { ar: "\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0635\u0648\u0631\u0629 \u0627\u0644\u063A\u0644\u0627\u0641.", en: "Cover image attached." }
    },
    errors: {
      invalidYear: { ar: "\u0627\u0644\u0633\u0646\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0631\u0642\u0645\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B (2000-2100).", en: "Year must be a valid number (2000-2100)." },
      notAnImage: { ar: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0642 \u0644\u064A\u0633 \u0635\u0648\u0631\u0629.", en: "The attached file is not an image." },
      imageTooLarge: { ar: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062A\u062C\u0627\u0648\u0632 5 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.", en: "The image exceeds the 5 MB limit." },
      storageUpload: { ar: "\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641 \u0625\u0644\u0649 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 ({{status}}).", en: "Storage upload failed ({{status}})." },
      missingPublicBase: { ar: "\u062A\u0645 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629\u060C \u0644\u0643\u0646 \u0631\u0627\u0628\u0637\u0647\u0627 \u0627\u0644\u0639\u0627\u0645 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0648\u0644\u064A\u062F \u2014 \u0627\u0636\u0628\u0637 VITE_R2_PUBLIC_BASE \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0625\u0631\u0641\u0627\u0642\u060C \u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062F\u0648\u064A\u0627\u064B.", en: "Image uploaded, but its public URL cannot be derived \u2014 set VITE_R2_PUBLIC_BASE and re-attach, or paste the image URL manually." },
      loadCourses: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062F\u0648\u0631\u0627\u062A \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629.", en: "Could not load exam bundles." },
      loadPicker: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A.", en: "Could not load the exam list." },
      saveCourse: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u062F\u0648\u0631\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629.", en: "Could not save the exam bundle." },
      lifecycle: { ar: "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.", en: "Could not apply the action." },
      deleteCourse: { ar: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Could not delete the bundle." },
      loadDetail: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Could not load the bundle details." },
      loadPreview: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u062F\u0648\u0631\u0629.", en: "Could not load the bundle preview." },
      addExam: { ar: "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not add the exam." },
      removeExam: { ar: "\u062A\u0639\u0630\u0631 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", en: "Could not remove the exam." },
      reorder: { ar: "\u062A\u0639\u0630\u0631 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0631\u062A\u064A\u0628.", en: "Could not reorder the exams." },
      uploadCover: { ar: "\u062A\u0639\u0630\u0631 \u0631\u0641\u0639 \u0635\u0648\u0631\u0629 \u0627\u0644\u063A\u0644\u0627\u0641.", en: "Could not upload the cover image." }
    },
    cover: {
      defaultTitle: { ar: "\u063A\u0644\u0627\u0641 \u062F\u0648\u0631\u0629 \u0627\u0645\u062A\u062D\u0627\u0646\u064A\u0629", en: "Exam-course cover" }
    }
  }
};

// apps/admin-web/src/lib/dictionary/courses.ts
var coursesDict = {
  // ===== CoursesCenter — toolbar, table, course form drawers (`copy` object) =====
  title: { ar: "\u0627\u0644\u0643\u0648\u0631\u0633\u0627\u062A", en: "Courses" },
  desc: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0648\u0625\u062F\u0627\u0631\u0629 \u0643\u0648\u0631\u0633\u0627\u062A \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0648\u062D\u0644\u0642\u0627\u062A\u0647\u0627 (\u0631\u0641\u0639 \u0648\u0633\u0627\u0626\u0637 \u062D\u062A\u0649 2.5GB \u0623\u0648 \u064A\u0648\u062A\u064A\u0648\u0628).", en: "Create and manage video courses and their episodes (media upload up to 2.5GB, or YouTube)." },
  create: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0643\u0648\u0631\u0633", en: "Create course" },
  refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
  episodes: { ar: "\u062D\u0644\u0642\u0627\u062A", en: "Episodes" },
  episodesCount: { ar: "\u0627\u0644\u062D\u0644\u0642\u0627\u062A", en: "Episodes" },
  views: { ar: "\u0645\u0634\u0627\u0647\u062F\u0627\u062A", en: "Views" },
  created: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621", en: "Created" },
  status: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
  subject: { ar: "\u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject" },
  actions: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
  publish: { ar: "\u0646\u0634\u0631", en: "Publish" },
  archive: { ar: "\u0623\u0631\u0634\u0641\u0629", en: "Archive" },
  delete: { ar: "\u062D\u0630\u0641", en: "Delete" },
  edit: { ar: "\u062A\u0639\u062F\u064A\u0644", en: "Edit" },
  noSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0645\u0646 \u0627\u0644\u062A\u062F\u0631\u062C \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0623\u0639\u0644\u0627\u0647 \u0644\u0639\u0631\u0636 \u0643\u0648\u0631\u0633\u0627\u062A\u0647\u0627 \u0623\u0648 \u0625\u0646\u0634\u0627\u0621 \u0643\u0648\u0631\u0633 \u062C\u062F\u064A\u062F.", en: "Pick a subject in the hierarchy above to list or create its courses." },
  noCourses: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0643\u0648\u0631\u0633\u0627\u062A \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 \u0628\u0639\u062F.", en: "No courses in this subject yet." },
  formTitle: { ar: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0643\u0648\u0631\u0633", en: "Course title" },
  formDesc: { ar: "\u0627\u0644\u0648\u0635\u0641", en: "Description" },
  formCover: { ar: "\u0631\u0627\u0628\u0637 \u0635\u0648\u0631\u0629 \u0627\u0644\u063A\u0644\u0627\u0641 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Cover image URL (optional)" },
  save: { ar: "\u062D\u0641\u0638", en: "Save" },
  cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
  createCourse: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0643\u0648\u0631\u0633 \u062C\u062F\u064A\u062F", en: "Create new course" },
  editCourse: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0643\u0648\u0631\u0633", en: "Edit course" },
  // Shared episode vocabulary (main copy + EpisodesManager buildCopy — byte-identical).
  addEpisode: { ar: "\u0625\u0636\u0627\u0641\u0629 \u062D\u0644\u0642\u0629", en: "Add episode" },
  youtubeId: { ar: "\u0645\u0639\u0631\u0651\u0641 \u0641\u064A\u062F\u064A\u0648 \u064A\u0648\u062A\u064A\u0648\u0628", en: "YouTube video id" },
  episodeTitle: { ar: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062D\u0644\u0642\u0629", en: "Episode title" },
  episodeNumber: { ar: "\u0631\u0642\u0645 \u0627\u0644\u062D\u0644\u0642\u0629", en: "Episode number" },
  duration: { ar: "\u0627\u0644\u0645\u062F\u0629 (\u062B\u0627\u0646\u064A\u0629\u060C \u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Duration (seconds, optional)" },
  add: { ar: "\u0625\u0636\u0627\u0641\u0629", en: "Add" },
  uploadVideo: { ar: "\u0631\u0641\u0639 \u0648\u0633\u0627\u0626\u0637 (\u0641\u064A\u062F\u064A\u0648/\u0635\u0648\u062A)", en: "Upload media (video/audio)" },
  uploading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u0631\u0641\u0639\u2026", en: "Uploading\u2026" },
  abort: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0641\u0639", en: "Abort upload" },
  incomplete: { ar: "\u0644\u0645 \u064A\u0643\u062A\u0645\u0644 \u0627\u0644\u0631\u0641\u0639", en: "Upload incomplete" },
  ready: { ar: "\u062C\u0627\u0647\u0632", en: "Ready" },
  close: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close" },
  selectFile: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0644\u0641 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0623\u0648 \u0627\u0644\u0635\u0648\u062A", en: "Choose a video or audio file" },
  deleteEpisode: { ar: "\u062D\u0630\u0641 \u0627\u0644\u062D\u0644\u0642\u0629", en: "Delete episode" },
  // ===== Course status badge (the local statusLabel helper) =====
  courseStatus: {
    published: { ar: "\u0645\u0646\u0634\u0648\u0631", en: "Published" },
    archived: { ar: "\u0645\u0624\u0631\u0634\u0641", en: "Archived" },
    draft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" }
  },
  // ===== Confirm dialogs, row actions, hard delete =====
  confirm: {
    publishTitle: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0643\u0648\u0631\u0633", en: "Publish course" },
    archiveTitle: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0643\u0648\u0631\u0633", en: "Archive course" },
    publishDescription: { ar: '\u0633\u064A\u0635\u0628\u062D \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}" \u0645\u0639 \u062C\u0645\u064A\u0639 \u062D\u0644\u0642\u0627\u062A\u0647 \u0645\u0631\u0626\u064A\u064B\u0627 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0637\u0644\u0627\u0628.', en: '"{{title}}" and all its episodes will become visible to all students.' },
    archiveDescription: { ar: '\u0633\u064A\u064F\u062E\u0641\u0649 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}" \u0645\u0646 \u0627\u0643\u062A\u0634\u0627\u0641 \u0627\u0644\u0637\u0644\u0627\u0628. \u064A\u0645\u0643\u0646 \u0627\u0633\u062A\u0639\u0627\u062F\u062A\u0647 \u0628\u0627\u0644\u0646\u0634\u0631 \u0644\u0627\u062D\u0642\u064B\u0627.', en: '"{{title}}" will be hidden from student discovery. It can be re-published later.' },
    deleteTitle: { ar: "\u062D\u0630\u0641 \u0627\u0644\u0643\u0648\u0631\u0633 \u0646\u0647\u0627\u0626\u064A\u064B\u0627", en: "Permanently delete course" },
    deleteDescription: { ar: '\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}" \u0646\u0647\u0627\u0626\u064A\u064B\u0627 \u0645\u0639 \u062C\u0645\u064A\u0639 \u062D\u0644\u0642\u0627\u062A\u0647 \u0648\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0627\u0644\u0645\u062E\u0632\u0646\u0629. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.', en: '"{{title}}" will be permanently deleted together with all its episodes and stored videos. This cannot be undone.' },
    deleteAcknowledge: { ar: "\u0623\u0641\u0647\u0645 \u0623\u0646 \u0627\u0644\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646\u0647", en: "I understand this deletion is permanent and cannot be undone" },
    hardDeleteAction: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629)", en: "Hard delete (bypass archive)" },
    hardDeleteConsequence: { ar: "\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0643\u0648\u0631\u0633 \u0646\u0647\u0627\u0626\u064A\u064B\u0627 \u0645\u0639 \u062C\u0645\u064A\u0639 \u062D\u0644\u0642\u0627\u062A\u0647 (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629).", en: "The course is physically deleted with all its episodes (bypassing archive)." },
    rowActionsLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A {{title}}", en: "Actions for {{title}}" },
    episodeDeleteDescription: { ar: '\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u062D\u0644\u0642\u0629 "{{title}}"{{storedVideo}} \u0646\u0647\u0627\u0626\u064A\u064B\u0627. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.', en: '"{{title}}"{{storedVideo}} will be permanently deleted. This cannot be undone.' },
    episodeDeleteStoredVideo: { ar: " \u0645\u0639 \u0645\u0644\u0641 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0627\u0644\u0645\u062E\u0632\u0646", en: " and its stored video" }
  },
  // ===== Toasts & catch fallbacks =====
  feedback: {
    loadFailed: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0643\u0648\u0631\u0633\u0627\u062A.", en: "Failed to load courses." },
    createValidation: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0648\u0623\u062F\u062E\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0643\u0648\u0631\u0633.", en: "Select a subject and enter a course title." },
    created: { ar: '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}".', en: 'Course "{{title}}" created.' },
    createFailed: { ar: "\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0643\u0648\u0631\u0633.", en: "Failed to create course." },
    updated: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u0643\u0648\u0631\u0633.", en: "Course updated." },
    updateFailed: { ar: "\u0641\u0634\u0644 \u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A.", en: "Failed to update." },
    publishToast: { ar: '\u062A\u0645 \u0646\u0634\u0631 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}".', en: 'Course "{{title}}" published.' },
    archiveToast: { ar: '\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}".', en: 'Course "{{title}}" archived.' },
    deleteToast: { ar: '\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0643\u0648\u0631\u0633 "{{title}}".', en: 'Course "{{title}}" deleted.' },
    deleteFailed: { ar: "\u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0643\u0648\u0631\u0633.", en: "Failed to delete course." },
    actionFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.", en: "Action failed." },
    youtubeValidation: { ar: "\u0623\u0643\u0645\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062D\u0644\u0642\u0629 \u0648\u0631\u0642\u0645\u0647\u0627 \u0648\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u064A\u0648\u062A\u064A\u0648\u0628.", en: "Fill episode title, number and YouTube id." },
    youtubeAdded: { ar: "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u062D\u0644\u0642\u0629 \u0627\u0644\u064A\u0648\u062A\u064A\u0648\u0628.", en: "YouTube episode added." },
    episodeDeleted: { ar: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u062D\u0644\u0642\u0629.", en: "Episode deleted." },
    uploadValidation: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0644\u0641 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0648\u0623\u062F\u062E\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062D\u0644\u0642\u0629 \u0648\u0631\u0642\u0645\u0647\u0627.", en: "Choose a video file, episode title and number." },
    unrecognizedMediaType: { ar: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0641 \xAB{{fileName}}\xBB \u2014 \u0627\u0644\u0635\u064A\u063A \u0627\u0644\u0645\u062F\u0639\u0648\u0645\u0629: MP4, WebM, MOV, MP3, M4A, WAV.", en: 'Unrecognized media type "{{fileName}}" \u2014 supported formats: MP4, WebM, MOV, MP3, M4A, WAV.' },
    uploadAborted: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0641\u0639 \u0648\u062D\u0630\u0641 \u0627\u0644\u062D\u0644\u0642\u0629 \u063A\u064A\u0631 \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629.", en: "Upload aborted; the incomplete episode was removed." },
    processingTimeout: { ar: "\u0627\u0633\u062A\u063A\u0631\u0642 \u0627\u0644\u062A\u0631\u0645\u064A\u0632 \u0648\u0642\u062A\u0627\u064B \u0637\u0648\u064A\u0644\u0627\u064B \u062C\u062F\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0623\u0648 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645.", en: "Transcoding is taking too long. Please try again or contact support." },
    processingFailed: { ar: "\u0641\u0634\u0644\u062A \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.", en: "Server-side video processing failed." },
    processingFailedHuman: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062C\u0647\u064A\u0632 \u0646\u0633\u062E \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u062D\u0644\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.", en: "The server could not prepare watchable copies for this episode." },
    processingCancelled: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0647\u0630\u0627 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0637\u0644\u0628\u0643. \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\u060C \u0639\u062F\u0651\u0644 \u0627\u0644\u062D\u0644\u0642\u0629 \u0623\u0648 \u0627\u0631\u0641\u0639 \u0645\u0644\u0641\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B.", en: "Processing was cancelled at your request. To retry, edit the episode or upload a new file." },
    processingCancelledToast: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u2014 \u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u0622\u0646 \u0628\u062D\u0627\u0644\u0629 \xAB\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629\xBB.", en: "Processing aborted \u2014 the episode is now marked Failed." },
    // Previously an Arabic-only inline literal (describeUploadError) — both locales now.
    uploadTransientError: { ar: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0645\u0624\u0642\u062A \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0631\u0641\u0639 \u2014 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\u060C \u0648\u0625\u0646 \u0627\u0633\u062A\u0645\u0631 \u0627\u0644\u062E\u0637\u0623 \u0641\u062A\u062D\u0642\u0651\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B.", en: "A transient server error occurred during the upload \u2014 retry, and if it persists check the connection and try again later." }
  },
  // ===== EpisodesManager (buildCopy keys that differ from the shared vocabulary) =====
  manager: {
    episodes: { ar: "\u0627\u0644\u062D\u0644\u0642\u0627\u062A", en: "Episodes" },
    retry: { ar: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629", en: "Retry" },
    retrying: { ar: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\u2026", en: "Retrying\u2026" },
    editEpisode: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0644\u0642\u0629", en: "Edit episode" },
    processingChip: { ar: "\u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing" }
  },
  // ===== SinglePutUploadPanel (copy2 + the human state machine) =====
  upload: {
    start: { ar: "\u0628\u062F\u0621 \u0627\u0644\u0631\u0641\u0639", en: "Start upload" },
    another: { ar: "\u0631\u0641\u0639 \u0648\u0633\u0627\u0626\u0637 \u0623\u062E\u0631\u0649", en: "Upload another media file" },
    details: { ar: "\u0639\u0631\u0636 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0642\u0646\u064A\u0629", en: "View technical details" },
    initiating: { ar: "\u062C\u0627\u0631\u064D \u062A\u0647\u064A\u0626\u0629 \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0641\u0639\u2026", en: "Requesting the upload URL\u2026" },
    completing: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0648\u0639\u2026", en: "Verifying the uploaded file\u2026" },
    readyTitle: { ar: "\u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u062C\u0627\u0647\u0632 \u0644\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u2705", en: "The video is ready to watch \u2705" },
    readyBody: { ar: "\u0627\u0643\u062A\u0645\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u2014 \u064A\u0645\u0643\u0646\u0643 \u0631\u0641\u0639 \u0648\u0633\u0627\u0626\u0637 \u0623\u062E\u0631\u0649 \u0623\u0648 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0644\u0648\u062D\u0629.", en: "Processing finished \u2014 you can upload another media file or close the panel." },
    failedTitle: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0625\u062A\u0645\u0627\u0645 \u0627\u0644\u0631\u0641\u0639", en: "Upload failed" },
    cancelledTitle: { ar: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing cancelled" },
    cancelledStatusHint: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645: \xAB\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629\xBB \u2014 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u062A\u0643\u0648\u0646 \u0628\u0631\u0641\u0639 \u062C\u062F\u064A\u062F \u0623\u0648 \u0628\u0639\u062F \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062D\u0644\u0642\u0629.", en: "Server status: Processing failed \u2014 retry with a new upload or after editing the episode." },
    retryHint: { ar: "\u0627\u0636\u063A\u0637 \xAB\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\xBB \u0644\u0625\u0639\u0627\u062F\u0629 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0644\u0641 \u0643\u0627\u0645\u0644\u0627\u064B \u2014 \u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062C\u0632\u0627\u0621 \u0645\u062D\u0641\u0648\u0638\u0629 \u0641\u064A \u0627\u0644\u0631\u0641\u0639 \u0627\u0644\u0623\u062D\u0627\u062F\u064A. \u0625\u0646 \u0627\u0633\u062A\u0645\u0631 \u062E\u0637\u0623 403 \u0641\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0631\u0627\u0628\u0637: \u0623\u0644\u063A\u0650 \u0627\u0644\u0631\u0641\u0639 \u0648\u0627\u0628\u062F\u0623 \u0645\u0646 \u062C\u062F\u064A\u062F.", en: "Press Retry to re-send the entire file \u2014 a single PUT keeps no partial parts. A persistent 403 means the URL expired: cancel and start a fresh upload." },
    restartHint: { ar: "\u0627\u0636\u063A\u0637 \xAB\u0628\u062F\u0621 \u0627\u0644\u0631\u0641\u0639\xBB \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", en: "Press Start upload to try again." },
    cancelProcessing: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Cancel processing" }
  },
  // ===== EpisodeEditModal =====
  episodeEdit: {
    number: { ar: "\u0631\u0642\u0645 \u0627\u0644\u062D\u0644\u0642\u0629", en: "Episode number" },
    duration: { ar: "\u0627\u0644\u0645\u062F\u0629 (\u062B\u0627\u0646\u064A\u0629\u060C \u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Duration (seconds, optional)" },
    save: { ar: "\u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A", en: "Save changes" },
    cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
    heading: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0644\u0642\u0629", en: "Edit episode" },
    sub: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0648\u0635\u0641 \u0648\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0639\u0648\u0628\u0629 \u064A\u0638\u0647\u0631\u0648\u0646 \u0644\u0644\u0637\u0627\u0644\u0628 \u0641\u064A \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u0634\u063A\u0651\u0644", en: "Title, description and difficulty are shown to the student on the player page" },
    saved: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0644\u0642\u0629.", en: "Episode updated." },
    updateFailed: { ar: "\u0641\u0634\u0644 \u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A.", en: "Failed to update episode." }
  },
  // ===== EpisodeMetadataFields =====
  metadataFields: {
    titleLabel: { ar: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062D\u0644\u0642\u0629", en: "Episode title" },
    // The legacy copy carried an explicit English label for the Arabic
    // placeholder branch — preserved byte-identically (same text both locales).
    titleLabelEn: { ar: "Episode title", en: "Episode title" },
    descriptionLabel: { ar: "\u0627\u0644\u0648\u0635\u0641 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Description (optional)" },
    difficultyLabel: { ar: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0639\u0648\u0628\u0629", en: "Difficulty" },
    qualityLabel: { ar: "\u062C\u0648\u062F\u0629 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing quality" },
    titleRequired: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628", en: "Title is required" },
    descriptionPlaceholder: { ar: "\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631 \u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u062D\u0644\u0642\u0629 \u2014 \u064A\u0638\u0647\u0631 \u0644\u0644\u0637\u0627\u0644\u0628 \u0623\u0633\u0641\u0644 \u0627\u0644\u0645\u0634\u063A\u0651\u0644", en: "A short description of the episode \u2014 shown to the student under the player" }
  },
  // ===== ContentCenter =====
  content: {
    title: { ar: "\u0635\u0641\u062D\u0627\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Content Pages" },
    description: { ar: "\u062A\u062D\u0631\u064A\u0631 \u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0648\u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629 \u0648\u0635\u0641\u062D\u0629 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u2014 \u062A\u0638\u0647\u0631 \u0644\u0644\u0637\u0644\u0627\u0628 \u0645\u0628\u0627\u0634\u0631\u0629 \u0628\u0639\u062F \u0627\u0644\u062D\u0641\u0638.", en: "Edit Terms, Privacy and Contact \u2014 students see changes immediately after save." },
    loadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0635\u0641\u062D\u0627\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Could not load content pages" },
    saved: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0646\u062C\u0627\u062D", en: "Page saved" },
    saveFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062D\u0641\u0638 \u0627\u0644\u0635\u0641\u062D\u0629. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u0627\u064B.", en: "Could not save the page. Try again." },
    lastUpdated: { ar: "\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B", en: "Updated" },
    edit: { ar: "\u062A\u062D\u0631\u064A\u0631", en: "Edit" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0641\u062D\u0627\u062A \u0645\u062D\u062A\u0648\u0649 \u0628\u0639\u062F.", en: "No content pages yet." }
  }
};

// apps/admin-web/src/lib/dictionary/library.ts
var libraryDict = {
  // ===== Page header =====
  header: {
    eyebrow: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0631\u0642\u0645\u064A", en: "Digital content management" },
    title: { ar: "\u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0648\u0627\u0644\u0645\u0644\u0641\u0627\u062A", en: "Library & Files Center" },
    desc: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0631\u0642\u0645\u064A\u0629: \u0631\u0641\u0639\u060C \u0646\u0634\u0631\u060C \u0623\u0631\u0634\u0641\u0629\u060C \u062D\u0630\u0641.", en: "Manage library files: upload, publish, archive, delete." }
  },
  // ===== Push 4: documents | courses tab bar =====
  tabs: {
    files: { ar: "\u0627\u0644\u0645\u0644\u0641\u0627\u062A", en: "Documents" },
    courses: { ar: "\u0627\u0644\u0643\u0648\u0631\u0633\u0627\u062A", en: "Courses" }
  },
  // ===== Field labels (hierarchy filters, table columns, edit modal) =====
  fields: {
    university: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "University" },
    college: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629", en: "College" },
    year: { ar: "\u0627\u0644\u0633\u0646\u0629", en: "Year" },
    semester: { ar: "\u0627\u0644\u0641\u0635\u0644", en: "Semester" },
    subject: { ar: "\u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject" },
    lecture: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "Lecture" },
    category: { ar: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641", en: "Category" },
    file: { ar: "\u0627\u0644\u0645\u0644\u0641", en: "File" },
    title: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646", en: "Title" },
    description: { ar: "\u0627\u0644\u0648\u0635\u0641", en: "Description" },
    type: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    size: { ar: "\u0627\u0644\u062D\u062C\u0645", en: "Size" },
    scan: { ar: "\u0627\u0644\u0641\u062D\u0635", en: "Scan" },
    created: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621", en: "Created" },
    actions: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" }
  },
  // ===== Toolbar (search · status/category filters · refresh) =====
  toolbar: {
    search: { ar: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0639\u0646\u0648\u0627\u0646", en: "Search by title" },
    categoryAll: { ar: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641: \u0627\u0644\u0643\u0644", en: "Category: All" },
    refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026", en: "Loading\u2026" },
    addFile: { ar: "\u0631\u0641\u0639 \u0645\u0644\u0641", en: "Upload file" }
  },
  // ===== Empty states =====
  list: {
    noFiles: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0644\u0641\u0627\u062A \u0645\u0637\u0627\u0628\u0642\u0629.", en: "No matching files." },
    noSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0639\u0631\u0636 \u0645\u0644\u0641\u0627\u062A\u0647\u0627.", en: "Select a subject to view its files." },
    noSubjectHint: { ar: "\u0627\u0644\u062A\u062F\u0631\u062C \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0623\u0639\u0644\u0627\u0647 \u064A\u0642\u0648\u062F\u0643 \u0645\u0646 \u0627\u0644\u062C\u0627\u0645\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0627\u062F\u0629.", en: "The hierarchy above leads from university down to subject." },
    noFilesHint: { ar: "\u062C\u0631\u0651\u0628 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u0623\u0648 \u0627\u0644\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u064A\u0629.", en: "Try adjusting the filters or search keywords." }
  },
  // ===== Row-actions ⋮ menu =====
  actions: {
    publish: { ar: "\u0646\u0634\u0631", en: "Publish" },
    archive: { ar: "\u0623\u0631\u0634\u0641\u0629", en: "Archive" },
    delete: { ar: "\u062D\u0630\u0641", en: "Delete" },
    rowMenuLabel: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A {{title}}", en: "Actions for {{title}}" },
    convertToImages: { ar: "\u062A\u062D\u0648\u064A\u0644 \u0625\u0644\u0649 \u0635\u0648\u0631 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062C\u0648\u062F\u0629", en: "Convert to high-quality images" },
    convertNotice: { ar: "\u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629 \u0633\u062A\u0643\u0648\u0646 \u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0627\u062F\u0645 (Wave 12).", en: "This feature will be available in the next update (Wave 12)." },
    editMetadata: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", en: "Edit metadata" },
    hardDelete: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629)", en: "Hard delete (bypass archive)" }
  },
  // ===== Slide-in upload panel =====
  upload: {
    panelEyebrow: { ar: "\u0631\u0641\u0639 \u0645\u0644\u0641 \u062C\u062F\u064A\u062F", en: "Upload new file" },
    panelTitle: { ar: "\u0631\u0641\u0639 \u0645\u0644\u0641 \u062C\u062F\u064A\u062F", en: "New file upload" },
    submit: { ar: "\u0631\u0641\u0639", en: "Upload" },
    uploading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u0631\u0641\u0639\u2026", en: "Uploading\u2026" },
    progress: { ar: "\u0627\u0644\u062A\u0642\u062F\u0645", en: "Progress" },
    selectFile: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0644\u0641\u0627\u064B", en: "Choose file" },
    fillRequired: { ar: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 \u0648\u0645\u0627\u062F\u0629 \u0648\u0639\u0646\u0648\u0627\u0646", en: "Please select a file, subject, and title" },
    selectSubjectForm: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Select subject" },
    selectLectureForm: { ar: "\u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject-level" },
    html: {
      previewTitle: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 \u062A\u0641\u0627\u0639\u0644\u064A\u0629", en: "Interactive preview" },
      localOnly: { ar: "\u0645\u062D\u0644\u064A\u0629 \u0641\u0642\u0637", en: "Local only" },
      previewFrameTitle: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629 \u062A\u0641\u0627\u0639\u0644\u064A\u0629 \u0644\u0644\u062F\u0631\u0633", en: "Interactive lesson preview" },
      previewNote: { ar: "\u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u062A\u0639\u0645\u0644 \u062F\u0627\u062E\u0644 \u0645\u062A\u0635\u0641\u062D\u0643 \u0641\u0642\u0637 \u2014 \u0644\u0645 \u064A\u064F\u0631\u0641\u0639 \u0623\u064A \u0645\u0644\u0641 \u0628\u0639\u062F\u060C \u0648\u062A\u0639\u0645\u0644 \u0628\u0646\u0641\u0633 \u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0642\u0641\u0635 \u0627\u0644\u062A\u064A \u0633\u064A\u0631\u0627\u0647\u0627 \u0627\u0644\u0637\u0644\u0627\u0628.", en: "The preview runs inside your browser only \u2014 nothing is uploaded yet, and it uses the same sandbox rules students will get." },
      enableScripts: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0633\u0643\u0631\u0628\u062A\u0627\u062A \u0627\u0644\u062A\u0641\u0627\u0639\u0644\u064A\u0629", en: "Enable interactive scripts" },
      enableScriptsHint: { ar: "\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0633\u064A\u0639\u0645\u0644 \u062F\u0627\u062E\u0644 \u0642\u0641\u0635 \u062D\u0645\u0627\u064A\u0629 (Sandbox) \u0648\u0644\u0627 \u064A\u0645\u0643\u0646\u0647 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0623\u064A \u0633\u064A\u0631\u0641\u0631 \u062E\u0627\u0631\u062C\u064A.", en: "Content runs inside a sandbox cage and cannot contact any external server." },
      chipCsp: { ar: "\u062D\u0645\u0627\u064A\u0629 CSP \u0645\u0641\u0639\u0651\u0644\u0629", en: "CSP shield on" },
      chipVirus: { ar: "\u0641\u062D\u0635 \u0641\u064A\u0631\u0648\u0633\u064A \u062A\u0644\u0642\u0627\u0626\u064A", en: "Virus scanned" },
      chipSandbox: { ar: "\u0642\u0641\u0635 \u062D\u0645\u0627\u064A\u0629 \u0645\u0639\u0632\u0648\u0644", en: "Isolated sandbox" },
      sizeLabel: { ar: "\u062D\u062C\u0645 \u0627\u0644\u0645\u0644\u0641", en: "File size" },
      sizeError: { ar: "\u0627\u0644\u062D\u062C\u0645 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 ({{limit}} \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A) \u2014 \u0623\u0632\u0644 \u0627\u0644\u0645\u0644\u0641 \u0648\u0627\u062E\u062A\u0631 \u0645\u0644\u0641\u064B\u0627 \u0623\u0635\u063A\u0631.", en: "Exceeds the {{limit}} MB limit \u2014 remove it and pick a smaller file." }
    }
  },
  // ===== Processing trackers (Ghostscript PDF + HTML sanitize/CSP) =====
  processing: {
    pdfReadyBroken: { ar: '\u062A\u0645 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u0645\u0644\u0641 "{{title}}" \u2014 \u0628\u0647 \u0645\u0634\u0627\u0643\u0644 \u0641\u064A \u0627\u0644\u0646\u0635\u060C \u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0648\u0636\u0639 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A.', en: 'Prepared "{{title}}" \u2014 text issues detected; fallback rendering is active.' },
    pdfReadyFixed: { ar: '\u062A\u0645 \u0625\u0635\u0644\u0627\u062D \u062E\u0637\u0648\u0637 \u0627\u0644\u0645\u0644\u0641 "{{title}}" \u0628\u0646\u062C\u0627\u062D.', en: 'Font processing finished for "{{title}}".' },
    pdfFailedHuman: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0625\u0635\u0644\u0627\u062D \u062E\u0637\u0648\u0637 \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645. \u064A\u0645\u0643\u0646 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0625\u0639\u0627\u062F\u0629 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641.", en: "Font processing failed on the server. Retry by uploading the file again." },
    htmlReady: { ar: '\u062A\u0645 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u062A\u0641\u0627\u0639\u0644\u064A "{{title}}" \u0628\u0646\u062C\u0627\u062D \u2014 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0645\u0641\u0639\u0651\u0644\u0629 \u0648\u062C\u0627\u0647\u0632 \u0644\u0644\u0637\u0644\u0627\u0628.', en: 'Interactive lesson "{{title}}" is ready \u2014 protection applied.' },
    htmlFailedHuman: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062C\u0647\u064A\u0632 \u0647\u0630\u0627 \u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u062A\u0641\u0627\u0639\u0644\u064A \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645. \u064A\u0645\u0643\u0646 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0625\u0639\u0627\u062F\u0629 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641.", en: "Failed to prepare this interactive lesson on the server. Retry by uploading the file again." },
    uploadedNotice: { ar: "\u062A\u0645 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641 \u0628\u0646\u062C\u0627\u062D.", en: "File uploaded successfully." },
    pollTimeout: { ar: "\u062A\u062C\u0627\u0648\u0632\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0645\u0647\u0644\u0629 (15 \u062F\u0642\u064A\u0642\u0629) \u2014 \u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u062D\u062F\u064A\u062B. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B.", en: "Processing exceeded the 15-minute watchdog \u2014 polling stopped. Retry later." },
    pdfTitle: { ar: "\u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u062E\u0637\u0648\u0637", en: "Font processing" },
    pdfTooltip: { ar: "\u0647\u0630\u0647 \u0627\u0644\u062E\u0637\u0648\u0629 \u062A\u0636\u0645\u0646 \u0623\u0646 \u0627\u0644\u0646\u0635 \u0627\u0644\u0639\u0631\u0628\u064A \u0633\u064A\u0638\u0647\u0631 \u0645\u062A\u0635\u0644\u0627\u064B \u0648\u0633\u0644\u064A\u0645\u0627\u064B \u0639\u0644\u0649 \u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629.", en: "This step ensures Arabic text renders connected and correct on every device." },
    pdfFailedStep: { ar: "\u062A\u0639\u0630\u0631 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0645\u0644\u0641 \u274C", en: "The file could not be processed \u274C" },
    errorHeadline: { ar: "\u062A\u0639\u0630\u0631 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0645\u0644\u0641", en: "The file could not be processed" },
    htmlTitle: { ar: "\u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u062A\u0641\u0627\u0639\u0644\u064A", en: "Interactive lesson processing" },
    htmlFailedStep: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062F\u0631\u0633 \u274C", en: "The lesson could not be prepared \u274C" },
    htmlReadyBadge: { ar: "\u062C\u0627\u0647\u0632 \u2014 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0645\u0641\u0639\u0651\u0644\u0629 \u0648\u0642\u0641\u0635 \u0627\u0644\u0633\u0643\u0631\u0628\u062A\u0627\u062A \u064A\u0639\u0645\u0644", en: "Ready \u2014 protection applied, sandbox active" },
    // mediaProcessing.ts — the episode-row chip labels.
    failed: { ar: "\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing failed" },
    ready: { ar: "\u062C\u0627\u0647\u0632", en: "Ready" },
    chip: { ar: "\u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629: {{rung}}", en: "Processing: {{rung}}" }
  },
  // ===== ProcessingTimeline.tsx (upload stats strip + shared bar) =====
  timeline: {
    speed: { ar: "\u0627\u0644\u0633\u0631\u0639\u0629", en: "Speed" },
    eta: { ar: "\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u062A\u0628\u0642\u064A", en: "ETA" },
    parts: { ar: "{{uploaded}} \u0645\u0646 \u0623\u0635\u0644 {{total}} \xB7 {{completed}}/{{parts}} \u0623\u062C\u0632\u0627\u0621", en: "{{uploaded}} of {{total}} \xB7 {{completed}}/{{parts}} parts" },
    barUploading: { ar: "\u062C\u0627\u0631\u064D \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641\u2026", en: "Uploading the file\u2026" },
    barProcessing: { ar: "\u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645", en: "Server-side processing" },
    uploadProgressA11y: { ar: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0631\u0641\u0639", en: "Upload progress" },
    processingProgressA11y: { ar: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing progress" }
  },
  // ===== ProcessingErrorModal.tsx =====
  errorModal: {
    headlineDefault: { ar: "\u0639\u0630\u0631\u0627\u064B\u060C \u062A\u0639\u0630\u0631 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0641\u064A\u062F\u064A\u0648.", en: "Sorry \u2014 the video could not be processed." },
    detailsForSupport: { ar: "\u062A\u0641\u0627\u0635\u064A\u0644 \u062A\u0642\u0646\u064A\u0629 \u0644\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", en: "Technical details for support" },
    titleFallback: { ar: "\u062A\u0639\u0630\u0651\u0631\u062A \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0641\u064A\u062F\u064A\u0648", en: "Video processing failed" },
    description: { ar: "\u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u0628\u0633\u0651\u0637\u0629 \u0623\u0648\u0644\u0627\u064B\u060C \u0648\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0639\u0646\u062F \u0627\u0644\u062D\u0627\u062C\u0629", en: "Human message first, technical details on demand" },
    humanDefault: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0625\u0644\u0649 \u0635\u064A\u063A \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629. \u062D\u0627\u0648\u0644 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\u060C \u0648\u0625\u0646 \u0627\u0633\u062A\u0645\u0631\u062A \u0627\u0644\u0645\u0634\u0643\u0644\u0629 \u0641\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A \u0645\u0639 \u0631\u0642\u0645 \u0627\u0644\u062D\u0644\u0642\u0629.", en: "The video could not be converted into watchable formats. Try again; if it keeps failing, contact support with the episode id." },
    copied: { ar: "\u062A\u0645 \u0627\u0644\u0646\u0633\u062E \u2713", en: "Copied \u2713" },
    copyError: { ar: "\u0646\u0633\u062E \u0627\u0644\u062E\u0637\u0623", en: "Copy error" },
    retrying: { ar: "\u062C\u0627\u0631\u064D \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629\u2026", en: "Retrying\u2026" },
    retry: { ar: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629", en: "Retry" }
  },
  // ===== Lifecycle confirm dialogs (publish/archive/hard delete) =====
  confirm: {
    publishTitle: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0645\u0644\u0641", en: "Publish file" },
    publishDescription: { ar: '\u0633\u064A\u0635\u0628\u062D \u0627\u0644\u0645\u0644\u0641 "{{title}}" \u0645\u0631\u0626\u064A\u064B\u0627 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0637\u0644\u0627\u0628 \u0636\u0645\u0646 \u0627\u0644\u0645\u0627\u062F\u0629 \u0648\u0633\u064A\u0638\u0647\u0631 \u0641\u064A \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0628\u062D\u062B.', en: '"{{title}}" will become visible to all students of the subject and appear in search results.' },
    archiveTitle: { ar: "\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0645\u0644\u0641", en: "Archive file" },
    archiveDescription: { ar: '\u0633\u064A\u064F\u062E\u0641\u0649 \u0627\u0644\u0645\u0644\u0641 "{{title}}" \u0645\u0646 \u0627\u0643\u062A\u0634\u0627\u0641 \u0627\u0644\u0637\u0644\u0627\u0628. \u064A\u0645\u0643\u0646 \u0627\u0633\u062A\u0639\u0627\u062F\u062A\u0647 \u0628\u0627\u0644\u0646\u0634\u0631 \u0644\u0627\u062D\u0642\u064B\u0627 \u0648\u0644\u0627 \u064A\u064F\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A\u064B\u0627.', en: '"{{title}}" will be hidden from student discovery. It can be re-published later and is not permanently deleted.' },
    deleteTitle: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u0630\u0641", en: "Confirm delete" },
    deleteText: { ar: "\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u062F\u0627\u0626\u0645. \u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0648\u0627\u0644\u0642\u0627\u0639\u062F\u0629.", en: "This is permanent. The file will be removed from storage and database." },
    deleteButton: { ar: "\u062D\u0630\u0641 \u0646\u0647\u0627\u0626\u064A", en: "Delete permanently" },
    hardDeleteConsequence: { ar: "\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0646\u0647\u0627\u0626\u064A\u064B\u0627 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0639 \u0639\u0644\u0627\u0645\u0627\u062A\u0647 \u0648\u062A\u0639\u0644\u064A\u0642\u0627\u062A\u0647 \u0648\u0645\u0634\u0627\u0647\u062F\u0627\u062A\u0647 (\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0623\u0631\u0634\u0641\u0629).", en: "The file is physically deleted with its bookmarks, annotations and views (bypassing archive)." }
  },
  // ===== Metadata edit modal (PUT /library/{id}) =====
  metadata: {
    title: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0644\u0641", en: "Edit file metadata" },
    descriptionPlaceholder: { ar: "\u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u064B\u0627 \u0644\u0644\u0645\u0633\u062D", en: "Leave empty to clear" },
    tagsLabel: { ar: "\u0627\u0644\u0648\u0633\u0648\u0645 (\u0641\u0627\u0635\u0644\u0629 \u0628\u064A\u0646 \u0643\u0644 \u0648\u0633\u0645)", en: "Tags (comma-separated)" },
    noLecture: { ar: "\u0628\u062F\u0648\u0646 \u0645\u062D\u0627\u0636\u0631\u0629", en: "No lecture" },
    difficulty: { ar: "\u0627\u0644\u0635\u0639\u0648\u0628\u0629", en: "Difficulty" },
    unchanged: { ar: "\u0628\u062F\u0648\u0646 \u062A\u063A\u064A\u064A\u0631", en: "Unchanged" },
    targetQuality: { ar: "\u062C\u0648\u062F\u0629 \u0627\u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629", en: "Transcoding target quality" }
  },
  // ===== Handler fallbacks (legacy Arabic-only — now bilingual) =====
  errors: {
    loadUniversities: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062C\u0627\u0645\u0639\u0627\u062A.", en: "Could not load universities." },
    loadFiles: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0644\u0641\u0627\u062A.", en: "Could not load files." },
    validation: { ar: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 \u0648\u0645\u0627\u062F\u0629 \u0648\u0639\u0646\u0648\u0627\u0646.", en: "Please select a file, subject, and title." },
    htmlTooLarge: { ar: "\u062D\u062C\u0645 \u0645\u0644\u0641 HTML \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 ({{limit}} \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A)", en: "HTML file exceeds the {{limit}} MB limit" },
    upload: { ar: "\u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641.", en: "File upload failed." },
    publish: { ar: "\u0641\u0634\u0644 \u0646\u0634\u0631 \u0627\u0644\u0645\u0644\u0641.", en: "Failed to publish the file." },
    archive: { ar: "\u0641\u0634\u0644\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0645\u0644\u0641.", en: "Failed to archive the file." },
    updateMetadata: { ar: "\u0641\u0634\u0644 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0644\u0641.", en: "Failed to update file metadata." },
    delete: { ar: "\u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641.", en: "Failed to delete the file." }
  }
};

// apps/admin-web/src/lib/dictionary/codes.ts
var codesDict = {
  // ===== Cross-modal shared labels (Cancel/Close/Activate/Revoke + revoke-reason copy) =====
  cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
  close: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close" },
  activate: { ar: "\u062A\u0641\u0639\u064A\u0644", en: "Activate" },
  revoke: { ar: "\u0625\u0628\u0637\u0627\u0644", en: "Revoke" },
  confirmRevoke: { ar: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0625\u0628\u0637\u0627\u0644", en: "Confirm revoke" },
  revokeReason: { ar: "\u0633\u0628\u0628 \u0627\u0644\u0625\u0628\u0637\u0627\u0644", en: "Revoke reason" },
  revokeReasonPlaceholder: { ar: "\u0633\u0628\u0628 \u0648\u0627\u0636\u062D \u0648\u0622\u0645\u0646 \u0644\u0644\u062A\u062F\u0642\u064A\u0642.", en: "A clear, audit-safe reason." },
  redemptionDetail: { ar: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0641\u0639\u064A\u0644\u0627\u062A", en: "Redemption detail" },
  // ===== Header =====
  header: {
    eyebrow: { ar: "\u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Access policy" },
    title: { ar: "\u0631\u0645\u0648\u0632 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Access codes" },
    subtitle: { ar: "\u0633\u062C\u0644 \u0648\u0627\u062D\u062F \u062E\u0641\u064A\u0641: \u0625\u0646\u0634\u0627\u0621 \u0645\u0646 \u0646\u0627\u0641\u0630\u0629 \u0645\u0631\u0643\u0651\u0632\u0629\u060C \u0648\u062A\u0635\u0641\u064A\u0629 \u062D\u0633\u0628 \u0627\u0644\u0633\u0646\u0629 \u0648\u0627\u0644\u0645\u0627\u062F\u0629\u060C \u0648\u062A\u0641\u0635\u064A\u0644 \u0643\u0644 \u062A\u0641\u0639\u064A\u0644.", en: "One light ledger: focused create modal, year/subject filters, per-redemption detail." },
    refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
    generate: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0631\u0645\u0648\u0632", en: "Generate codes" }
  },
  // ===== Ledger panel + filters =====
  ledger: {
    eyebrow: { ar: "\u0633\u062C\u0644 \u0627\u0644\u0631\u0645\u0648\u0632", en: "Code ledger" },
    title: { ar: "\u0627\u0644\u0623\u0643\u0648\u0627\u062F \u0648\u0627\u0644\u062A\u0641\u0639\u064A\u0644\u0627\u062A", en: "Codes & redemptions" },
    exportCsv: { ar: "\u062A\u0635\u062F\u064A\u0631 CSV", en: "Export CSV" },
    revokeSelected: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0645\u062D\u062F\u062F", en: "Revoke selected" },
    search: { ar: "\u0628\u062D\u062B", en: "Search" },
    searchPlaceholder: { ar: "\u0628\u062D\u062B \u0628\u0627\u0644\u0643\u0648\u062F...", en: "Search by code..." },
    allStatuses: { ar: "\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A", en: "All status" },
    // Filter dropdown copy (byte-identical to the pre-PR-3 options — note the
    // legacy «ملغي» wording, distinct from the chip glossary «مُبطَل»).
    statusActive: { ar: "\u0646\u0634\u0637", en: "Active" },
    statusUsed: { ar: "\u0645\u0633\u062A\u062E\u062F\u0645", en: "Used" },
    statusRevoked: { ar: "\u0645\u0644\u063A\u064A", en: "Revoked" },
    statusExpired: { ar: "\u0645\u0646\u062A\u0647\u064A", en: "Expired" },
    allScopes: { ar: "\u0643\u0644 \u0627\u0644\u0646\u0637\u0627\u0642\u0627\u062A", en: "All scopes" },
    scopeSubject: { ar: "\u0645\u0627\u062F\u0629", en: "Subject" },
    scopeYear: { ar: "\u0633\u0646\u0629", en: "Year" },
    scopeSemester: { ar: "\u0641\u0635\u0644", en: "Semester" },
    scopeCollege: { ar: "\u0643\u0644\u064A\u0629", en: "College" },
    scopeUniversity: { ar: "\u062C\u0627\u0645\u0639\u0629", en: "University" },
    academicFilter: { ar: "\u062A\u0635\u0641\u064A\u0629 \u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629:", en: "Academic filter:" },
    university: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "University" },
    college: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629", en: "College" },
    allYears: { ar: "\u0643\u0644 \u0627\u0644\u0633\u0646\u0648\u0627\u062A", en: "All years" },
    allSemesters: { ar: "\u0643\u0644 \u0627\u0644\u0641\u0635\u0648\u0644", en: "All semesters" },
    allSubjects: { ar: "\u0643\u0644 \u0627\u0644\u0645\u0648\u0627\u062F", en: "All subjects" },
    clearAcademic: { ar: "\u0645\u0633\u062D \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629", en: "Clear academic" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0631\u0645\u0648\u0632 \u0636\u0645\u0646 \u0646\u0637\u0627\u0642\u0643.", en: "No codes exist in your scope." }
  },
  // ===== Ledger row =====
  row: {
    selectCode: { ar: "\u062A\u062D\u062F\u064A\u062F {{code}}", en: "Select {{code}}" },
    copy: { ar: "\u0646\u0633\u062E", en: "Copy" },
    publicCode: { ar: "\u0639\u0627\u0645", en: "Public" },
    privateCode: { ar: "\u062E\u0627\u0635", en: "Private" },
    redemptionCount: { ar: "{{count}} \u062A\u0641\u0639\u064A\u0644 \u2014 \u0627\u0636\u063A\u0637 \u0627\u0644\u0639\u064A\u0646 \u0644\u0644\u062A\u0641\u0627\u0635\u064A\u0644", en: "{{count}} redemption(s) \u2014 open the eye for detail" },
    noRedemptionsYet: { ar: "\u0644\u0645 \u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u0628\u0639\u062F", en: "No redemptions yet" },
    activateForStudent: { ar: "\u062A\u0641\u0639\u064A\u0644 \u064A\u062F\u0648\u064A \u0644\u0637\u0627\u0644\u0628", en: "Activate for student" },
    revokeAll: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0634\u0627\u0645\u0644", en: "Revoke all" }
  },
  // ===== Generate modal =====
  generateModal: {
    title: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0631\u0645\u0648\u0632 \u0648\u0635\u0648\u0644", en: "Generate access codes" },
    subtitle: { ar: "\u0646\u0637\u0627\u0642 \u0645\u0636\u0628\u0648\u0637 \u0648\u0646\u0648\u0639 \u0645\u062D\u062A\u0648\u0649 \u0645\u062D\u062F\u062F \u0644\u0643\u0644 \u062F\u0641\u0639\u0629.", en: "A controlled scope and content type per batch." },
    contentScope: { ar: "\u0646\u0648\u0639 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Content scope" },
    publicFreeCode: { ar: "\u0631\u0645\u0632 \u0639\u0627\u0645 \u0645\u062C\u0627\u0646\u064A", en: "Public free code" },
    publicFreeCodeNote: { ar: "\u064A\u0645\u0643\u0646 \u0644\u0643\u0644 \u0637\u0627\u0644\u0628 \u0645\u0633\u062C\u0651\u0644 \u0627\u0633\u062A\u0631\u062F\u0627\u062F\u0647 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629.", en: "Each registered student may redeem it once." },
    academicYear: { ar: "\u0627\u0644\u0633\u0646\u0629", en: "Academic year" },
    chooseUniversity: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u062C\u0627\u0645\u0639\u0629", en: "Choose university" },
    chooseCollege: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0643\u0644\u064A\u0629", en: "Choose college" },
    chooseYear: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0646\u0629", en: "Choose year" },
    semester: { ar: "\u0627\u0644\u0641\u0635\u0644", en: "Semester" },
    chooseSemester: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0641\u0635\u0644", en: "Choose semester" },
    subject: { ar: "\u0627\u0644\u0645\u0627\u062F\u0629", en: "Subject" },
    chooseSubject: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Choose subject" },
    quantity: { ar: "\u0627\u0644\u0643\u0645\u064A\u0629", en: "Quantity" },
    durationDays: { ar: "\u0627\u0644\u0645\u062F\u0629 \u0628\u0627\u0644\u0623\u064A\u0627\u0645", en: "Duration in days" },
    durationHint: { ar: "0 = \u0648\u0635\u0648\u0644 \u062F\u0627\u0626\u0645", en: "0 = permanent access" },
    prefix: { ar: "\u0628\u0627\u062F\u0626\u0629 \u0627\u0644\u0631\u0645\u0632 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Code prefix (optional)" },
    expiry: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0631\u0645\u0632 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Code expiry (optional)" },
    publicScopeNote: { ar: "\u0645\u062A\u0627\u062D \u0644\u0643\u0644 \u0637\u0627\u0644\u0628 \u0645\u0633\u062C\u0644 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629.", en: "available once to every registered student." },
    privateScopeNote: { ar: "\u064A\u0645\u0644\u0643\u0647 \u0623\u0648\u0644 \u0637\u0627\u0644\u0628 \u0645\u0633\u062C\u0644 \u064A\u0633\u062A\u0631\u062F\u0647 \u2014 \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0631\u0628\u0637\u0647 \u0628\u0637\u0627\u0644\u0628 \u062B\u0627\u0646\u064D.", en: "owned by the first student to redeem it \u2014 never a second student." },
    submit: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0631\u0645\u0648\u0632", en: "Generate codes" }
  },
  // ===== Redemptions detail modal =====
  redemptionsModal: {
    subtitle: { ar: "\u0645\u0646 \u0641\u0639\u0651\u0644 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632\u060C \u0648\u0645\u0627\u0630\u0627 \u064A\u0641\u062A\u062D\u060C \u0648\u0645\u062A\u0649 \u064A\u0646\u062A\u0647\u064A.", en: "Who activated this code, what it unlocks, and when it ends." },
    empty: { ar: "\u0644\u0645 \u064A\u064F\u0641\u0639\u0651\u0644 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0628\u0639\u062F.", en: "No redemptions yet." },
    from: { ar: "\u0645\u0646", en: "from" },
    until: { ar: "\u0625\u0644\u0649", en: "until" },
    permanent: { ar: "\u062F\u0627\u0626\u0645", en: "permanent" }
  },
  // ===== Manual activation modal =====
  activateModal: {
    title: { ar: "\u062A\u0641\u0639\u064A\u0644 \u064A\u062F\u0648\u064A \u0644\u0644\u0643\u0648\u062F", en: "Manual code activation" },
    subtitle: { ar: "\u0627\u062E\u062A\u0631 \u0637\u0627\u0644\u0628\u064B\u0627 \u0644\u062A\u0641\u0639\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062F \u0644\u0647 \u0645\u0628\u0627\u0634\u0631\u0629.", en: "Select a student to activate this code for." },
    searchLabel: { ar: "\u0628\u062D\u062B \u0639\u0646 \u0637\u0627\u0644\u0628", en: "Search student" },
    searchPlaceholder: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0647\u0627\u062A\u0641...", en: "Name or phone..." }
  },
  // ===== Revoke confirmation modal =====
  revokeModal: {
    title: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0631\u0645\u0632", en: "Revoke code" },
    subtitle: { ar: "\u0633\u064A\u064F\u0633\u062D\u0628 \u0648\u0635\u0648\u0644 \u062C\u0645\u064A\u0639 \u0645\u0646 \u0627\u0633\u062A\u0631\u062F \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639.", en: "All students who redeemed this code will lose access. This cannot be undone." },
    provideReason: { ar: "\u0623\u062F\u062E\u0644 \u0633\u0628\u0628 \u0627\u0644\u0625\u0628\u0637\u0627\u0644.", en: "Provide a revoke reason." }
  },
  // ===== Bulk revoke confirm =====
  bulkRevoke: {
    title: { ar: "\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0631\u0645\u0648\u0632 \u0627\u0644\u0645\u062D\u062F\u062F\u0629", en: "Revoke selected codes" },
    description: { ar: "\u0633\u064A\u064F\u0628\u0637\u064E\u0644 {{count}} \u0631\u0645\u0632\u060C \u0648\u0633\u064A\u0641\u0642\u062F \u062C\u0645\u064A\u0639 \u0627\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0630\u064A\u0646 \u0627\u0633\u062A\u0631\u062F\u0648\u0647\u0627 \u0648\u0635\u0648\u0644\u0647\u0645 \u0644\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0645\u0631\u062A\u0628\u0637 \u0628\u0647\u0627. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639\u060C \u0648\u0633\u064A\u064F\u0633\u062C\u064E\u0651\u0644 \u0627\u0644\u0633\u0628\u0628 \u0641\u064A \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642.", en: "{{count}} code(s) will be revoked \u2014 every student who redeemed them loses access to the linked content. This cannot be undone; the reason is recorded in the audit log." },
    success: { ar: "\u062A\u0645 \u0625\u0628\u0637\u0627\u0644 {{count}} \u0643\u0648\u062F.", en: "{{count}} code(s) revoked." },
    partialFailure: { ar: "\u0623\u064F\u0628\u0637\u0644 {{success}} \u0643\u0648\u062F\u060C \u0648\u0641\u0634\u0644 {{failed}}: {{list}}", en: "{{success}} code(s) revoked; {{failed}} failed: {{list}}" },
    listSeparator: { ar: "\u060C ", en: ", " }
  },
  // ===== Toasts (success notices) =====
  toasts: {
    generated: { ar: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 {{count}} \u0631\u0645\u0632 \u0648\u0635\u0648\u0644.", en: "{{count}} access code(s) created." },
    revoked: { ar: "\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0631\u0645\u0632 \u0648\u0633\u064F\u062D\u0628 \u0648\u0635\u0648\u0644 {{count}} \u0627\u0634\u062A\u0631\u0627\u0643\u064B\u0627.", en: "Code revoked; {{count}} subscription(s) withdrawn." },
    copied: { ar: "\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u0643\u0648\u062F.", en: "Code copied." },
    activated: { ar: "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0643\u0648\u062F \u0644\u0644\u0637\u0627\u0644\u0628.", en: "Code activated for student." }
  },
  // ===== Inline operator-facing errors =====
  errors: {
    chooseScopeFirst: { ar: "\u0627\u062E\u062A\u0631 \u0646\u0637\u0627\u0642 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0623\u0648\u0644\u064B\u0627.", en: "Choose the academic code scope first." },
    copyFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0646\u0633\u062E.", en: "Copy failed." },
    noCodesToExport: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0643\u0648\u0627\u062F \u0644\u0644\u062A\u0635\u062F\u064A\u0631.", en: "No codes to export." },
    selectStudentFirst: { ar: "\u0627\u062E\u062A\u0631 \u0637\u0627\u0644\u0628\u064B\u0627 \u0623\u0648\u0644\u0627\u064B.", en: "Select a student first." }
  },
  // ===== Legacy «unknown» status labels =====
  // CodesCenter legacy behavior: an unrecognized wire status rendered Arabic
  // «غير معروف»/«غير معروفة» but passed the raw value through in English, so
  // the `en` sides below are placeholders that never render (English keeps the
  // raw pass-through in the thin component wrappers).
  statuses: {
    unknownCode: { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641", en: "Unknown" },
    unknownRedemption: { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629", en: "Unknown" }
  },
  // ===== OfflineCenter — offline question-package ledger =====
  offline: {
    title: { ar: "\u0627\u0644\u062D\u0632\u0645 \u062F\u0648\u0646 \u0627\u062A\u0635\u0627\u0644 (\u062D\u0632\u0645 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0634\u0641\u0651\u0631\u0629)", en: "Offline packages" },
    subtitle: { ar: "\u0631\u0624\u064A\u0629 \u0648\u0625\u0628\u0637\u0627\u0644 \u0641\u0642\u0637 \u2014 \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u064A\u062A\u0645 \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0637\u0627\u0644\u0628 \u0639\u0628\u0631 \u0627\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0645\u0634\u0641\u0651\u0631\u0629 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0627\u0644\u062C\u0647\u0627\u0632.", en: "Visibility + revocation only \u2014 issuance happens from the student app." },
    refreshLabel: { ar: "\u062A\u062D\u062F\u064A\u062B \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062D\u0632\u0645", en: "Refresh packages" },
    refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
    studentUuid: { ar: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 (UUID\u060C \u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Student UUID (optional)" },
    filter: { ar: "\u062A\u0635\u0641\u064A\u0629", en: "Filter" },
    // Legacy Arabic-only `.catch` fallbacks — both locales provided (PR-3).
    loadFailed: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062D\u0632\u0645 \u062F\u0648\u0646 \u0627\u062A\u0635\u0627\u0644.", en: "Failed to load offline packages." },
    revokeFailed: { ar: "\u062A\u0639\u0630\u0631 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062D\u0632\u0645\u0629.", en: "Failed to revoke the package." },
    listFailed: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u2014 \u062D\u0627\u0648\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B.", en: "Failed to load \u2014 try refreshing." },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0632\u0645 \u0645\u0633\u062C\u0651\u0644\u0629 \u0628\u0639\u062F.", en: "No packages recorded yet." },
    columns: {
      student: { ar: "\u0627\u0644\u0637\u0627\u0644\u0628", en: "Student" },
      installation: { ar: "\u0627\u0644\u062A\u062B\u0628\u064A\u062A", en: "Installation" },
      status: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
      issued: { ar: "\u0627\u0644\u0625\u0635\u062F\u0627\u0631", en: "Issued" },
      expires: { ar: "\u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629", en: "Expires" },
      action: { ar: "\u0625\u062C\u0631\u0627\u0621", en: "Action" }
    },
    revokePackageLabel: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062D\u0632\u0645\u0629 {{id}}", en: "Revoke package" },
    revoke: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Revoke" },
    confirmTitle: { ar: "\u062A\u0623\u0643\u064A\u062F \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062D\u0632\u0645\u0629", en: "Confirm revocation" },
    confirmText: { ar: "\u0633\u062A\u062A\u0648\u0642\u0641 \u0627\u0644\u062D\u0632\u0645\u0629 {{packageId}} \u0644\u0644\u0637\u0627\u0644\u0628 {{studentName}} \u0639\u0646\u062F \u0623\u0648\u0644 \u0627\u062A\u0635\u0627\u0644 \u062A\u0627\u0644\u064D \u2014 \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0641\u062A\u062D\u0647\u0627 \u0623\u0648 \u062A\u0633\u062F\u064A\u062F \u0625\u062C\u0627\u0628\u0627\u062A \u0645\u0646\u0647\u0627 \u0628\u0639\u062F \u0630\u0644\u0643.", en: "Package {{packageId}} stops at the device's next online contact." },
    cancel: { ar: "\u062A\u0631\u0627\u062C\u0639", en: "Cancel" },
    revokePackage: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062D\u0632\u0645\u0629", en: "Revoke" }
  }
};

// apps/admin-web/src/lib/dictionary/academic.ts
var academicDict = {
  // ===== Shared action labels (reused across stage rows, lecture cards, dialogs) =====
  cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
  save: { ar: "\u062D\u0641\u0638", en: "Save" },
  add: { ar: "\u0625\u0636\u0627\u0641\u0629", en: "Add" },
  publish: { ar: "\u0646\u0634\u0631", en: "Publish" },
  archive: { ar: "\u0623\u0631\u0634\u0641\u0629", en: "Archive" },
  restore: { ar: "\u0627\u0633\u062A\u0639\u0627\u062F\u0629", en: "Restore" },
  archived: { ar: "\u0645\u0624\u0631\u0634\u0641", en: "Archived" },
  // ===== Page header =====
  header: {
    eyebrow: { ar: "\u0627\u0644\u0628\u0646\u064A\u0629 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629", en: "Academic Structure" },
    title: { ar: "\u0645\u0646 \u0627\u0644\u062C\u0627\u0645\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "University to lecture" },
    subtitle: { ar: "\u062A\u0646\u0642\u0651\u0644 \u0639\u0628\u0631 \u0627\u0644\u0647\u0631\u0645 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u060C \u0623\u0636\u0641 \u0627\u0644\u0639\u0646\u0627\u0635\u0631\u060C \u0648\u0623\u0631\u0634\u0641 \u0623\u0648 \u0627\u0633\u062A\u0639\u062F \u062D\u0633\u0628 \u0627\u0644\u062D\u0627\u062C\u0629.", en: "Navigate the academic hierarchy, add items, and archive or restore as needed." },
    hideArchived: { ar: "\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0645\u0624\u0631\u0634\u0641", en: "Hide archived" },
    showArchived: { ar: "\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0645\u0624\u0631\u0634\u0641", en: "Show archived" }
  },
  // ===== Stage column titles (5-column board) =====
  stages: {
    universities: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0627\u062A", en: "Universities" },
    colleges: { ar: "\u0627\u0644\u0643\u0644\u064A\u0627\u062A", en: "Colleges" },
    years: { ar: "\u0627\u0644\u0633\u0646\u0648\u0627\u062A", en: "Years" },
    semesters: { ar: "\u0627\u0644\u0641\u0635\u0648\u0644", en: "Semesters" },
    subjects: { ar: "\u0627\u0644\u0645\u0648\u0627\u062F", en: "Subjects" }
  },
  // ===== Stage list empty states =====
  stageList: {
    // Legacy wording — no trailing period and «أولاً» spelling; distinct from
    // the thrown `errors.parentFirst` below.
    selectParentFirst: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0623\u0628 \u0623\u0648\u0644\u0627\u064B", en: "Select parent first" },
    noItems: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0639\u0646\u0627\u0635\u0631 \u0628\u0639\u062F", en: "No items yet" }
  },
  // ===== Quick-create form (inline per-stage) =====
  quickForm: {
    arabicName: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0639\u0631\u0628\u064A", en: "Arabic name" },
    englishName: { ar: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "English name (optional)" },
    order: { ar: "\u0627\u0644\u062A\u0631\u062A\u064A\u0628", en: "Order" },
    subjectCode: { ar: "\u0631\u0645\u0632 \u0627\u0644\u0645\u0627\u062F\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Subject code (optional)" }
  },
  // ===== Lecture strip =====
  lectures: {
    eyebrow: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0627\u062A", en: "Lectures" },
    forSubject: { ar: "\u0645\u062D\u0627\u0636\u0631\u0627\u062A \u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629", en: "Lectures for selected subject" },
    selectSubject: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0639\u0631\u0636 \u0645\u062D\u0627\u0636\u0631\u0627\u062A\u0647\u0627", en: "Select a subject to view lectures" },
    add: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062D\u0627\u0636\u0631\u0629", en: "Add lecture" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062D\u0627\u0636\u0631\u0627\u062A \u0628\u0639\u062F.", en: "No lectures yet." },
    selectToBegin: { ar: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u0644\u0644\u0628\u062F\u0621.", en: "Select a subject to begin." },
    duration: { ar: "{{count}} \u062F", en: "{{count}} min" },
    instructor: { ar: "\u0627\u0644\u0645\u062D\u0627\u0636\u0631: {{name}}", en: "Instructor: {{name}}" },
    source: { ar: "\u0627\u0644\u0645\u0635\u062F\u0631: {{name}}", en: "Source: {{name}}" },
    draft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" },
    published: { ar: "\u0645\u0646\u0634\u0648\u0631", en: "Published" }
  },
  // ===== Full lecture create form =====
  lectureForm: {
    newLecture: { ar: "\u0645\u062D\u0627\u0636\u0631\u0629 \u062C\u062F\u064A\u062F\u0629", en: "New lecture" },
    addToHierarchy: { ar: "\u0625\u0636\u0627\u0641\u0629 \u0645\u062D\u0627\u0636\u0631\u0629 \u0625\u0644\u0649 \u0627\u0644\u0647\u064A\u0643\u0644", en: "Add a lecture to the hierarchy" },
    arabicTitle: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0639\u0631\u0628\u064A", en: "Arabic title" },
    englishTitle: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A", en: "English title" },
    lectureNumber: { ar: "\u0631\u0642\u0645 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "Lecture number" },
    duration: { ar: "\u0627\u0644\u0645\u062F\u0629 \u0628\u0627\u0644\u062F\u0642\u0627\u0626\u0642", en: "Duration (minutes)" },
    instructorName: { ar: "\u0627\u0633\u0645 \u0627\u0644\u0645\u062D\u0627\u0636\u0631", en: "Instructor name" },
    sourceReference: { ar: "\u0627\u0644\u0645\u0635\u062F\u0631 \u0623\u0648 \u0627\u0644\u0645\u0631\u062C\u0639", en: "Source / reference" },
    description: { ar: "\u0648\u0635\u0641 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "Lecture description" }
  },
  // ===== Publish-lecture confirm =====
  publishConfirm: {
    title: { ar: "\u0646\u0634\u0631 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629", en: "Publish lecture" },
    description: { ar: '\u0633\u062A\u0635\u0628\u062D \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629 "{{title}}" \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0645\u062E\u0648\u0651\u0644\u064A\u0646 \u0628\u0627\u0644\u0645\u0627\u062F\u0629\u060C \u0648\u0633\u062A\u0638\u0647\u0631 \u0641\u064A \u0642\u0627\u0626\u0645\u0629 \u0645\u062D\u0627\u0636\u0631\u0627\u062A\u0647\u0627.', en: '"{{title}}" will become available to students entitled to the subject and appear in its lecture list.' }
  },
  // ===== Archive / restore confirm =====
  archiveConfirm: {
    restoreTitle: { ar: '\u0627\u0633\u062A\u0639\u0627\u062F\u0629 "{{name}}"\u061F', en: 'Restore "{{name}}"?' },
    archiveTitle: { ar: '\u0623\u0631\u0634\u0641\u0629 "{{name}}"\u061F', en: 'Archive "{{name}}"?' },
    restoreText: { ar: "\u0633\u064A\u064F\u0639\u0627\u062F \u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0639\u0646\u0635\u0631 \u0644\u0644\u0637\u0644\u0627\u0628 \u0636\u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0627\u062A\u0647\u0645.", en: "The item will become visible to students within their scope." },
    archiveText: { ar: "\u0633\u064A\u064F\u062E\u0641\u0649 \u0627\u0644\u0639\u0646\u0635\u0631 \u0639\u0646 \u0627\u0644\u0637\u0644\u0627\u0628 \u062F\u0648\u0646 \u062D\u0630\u0641\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B.", en: "The item will be hidden from students without permanent deletion." }
  },
  // ===== Toasts (success notices) =====
  toasts: {
    itemRestored: { ar: "\u062A\u0645\u062A \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "Academic item restored." },
    itemArchived: { ar: "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A \u0648\u0625\u062E\u0641\u0627\u0624\u0647 \u0639\u0646 \u0627\u0644\u0637\u0644\u0627\u0628.", en: "Academic item archived and hidden from students." },
    lecturePublished: { ar: "\u062A\u0645 \u0646\u0634\u0631 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629 \u0648\u0623\u0635\u0628\u062D\u062A \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0645\u062E\u0648\u0651\u0644\u064A\u0646.", en: "Lecture published for entitled students." },
    itemSaved: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A.", en: "Academic item saved." },
    lectureSaved: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0645\u062D\u0627\u0636\u0631\u0629.", en: "Lecture saved." }
  },
  // ===== Inline operator-facing errors =====
  errors: {
    parentFirst: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0623\u0628 \u0623\u0648\u0644\u064B\u0627.", en: "Select the parent item first." }
  }
};

// apps/admin-web/src/lib/dictionary/reports.ts
var reportsDict = {
  // ===== ReportsTabs — shell furniture =====
  header: {
    title: { ar: "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A", en: "Analytics Center" },
    desc: { ar: "8 \u062A\u0628\u0648\u064A\u0628\u0627\u062A \u062A\u062D\u0644\u064A\u0644\u064A\u0629 \u0634\u0627\u0645\u0644\u0629", en: "8 comprehensive analytics tabs" },
    dateRange: { ar: "\u0627\u0644\u0641\u062A\u0631\u0629", en: "Date range" },
    lastUpdate: { ar: "\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B", en: "Last updated" },
    refresh: { ar: "\u062A\u062D\u062F\u064A\u062B", en: "Refresh" },
    tabDenied: { ar: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0645\u0641\u062A\u0627\u062D \u0647\u0630\u0627 \u0627\u0644\u062A\u0628\u0648\u064A\u0628.", en: "You do not have the key for this tab." }
  },
  // ===== ReportsTabs — the 8 tab labels (keyed by TABS.key) =====
  tabs: {
    overview: { ar: "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629", en: "Overview" },
    students: { ar: "\u0627\u0644\u0637\u0644\u0627\u0628", en: "Students" },
    academic: { ar: "\u0627\u0644\u0623\u062F\u0627\u0621 \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A", en: "Academic" },
    exams: { ar: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", en: "Exams" },
    questions: { ar: "\u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Questions" },
    content: { ar: "\u0627\u0644\u0645\u062D\u062A\u0648\u0649", en: "Content" },
    codes: { ar: "\u0627\u0644\u0623\u0643\u0648\u0627\u062F", en: "Codes" },
    operations: { ar: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644", en: "Operations" }
  },
  // ===== ReportsTabs — date-range preset labels (DATE_PRESETS.labelKey) =====
  presets: {
    last7: { ar: "7 \u0623\u064A\u0627\u0645", en: "7 days" },
    last30: { ar: "30 \u064A\u0648\u0645", en: "30 days" },
    last90: { ar: "90 \u064A\u0648\u0645", en: "90 days" },
    last6m: { ar: "6 \u0623\u0634\u0647\u0631", en: "6 months" },
    last12m: { ar: "\u0633\u0646\u0629", en: "12 months" }
  },
  // ===== Stat-card labels (shared across the analytics tabs) =====
  stats: {
    totalStudents: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0637\u0644\u0627\u0628", en: "Total Students" },
    totalQuestions: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Total Questions" },
    totalAnswers: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A", en: "Total Answers" },
    platformAccuracy: { ar: "\u062F\u0642\u0629 \u0627\u0644\u0645\u0646\u0635\u0629", en: "Platform Accuracy" },
    examSessions: { ar: "\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", en: "Exam Sessions" },
    libraryViews: { ar: "\u0645\u0634\u0627\u0647\u062F\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629", en: "Library Views" },
    newRegistrations: { ar: "\u062A\u0633\u062C\u064A\u0644\u0627\u062A \u062C\u062F\u064A\u062F\u0629", en: "New Registrations" },
    activeStudents: { ar: "\u0637\u0644\u0627\u0628 \u0646\u0634\u0637\u0648\u0646", en: "Active Students" },
    inactiveStudents: { ar: "\u0637\u0644\u0627\u0628 \u063A\u064A\u0631 \u0646\u0634\u0637\u064A\u0646", en: "Inactive Students" },
    published: { ar: "\u0645\u0646\u0634\u0648\u0631\u0629", en: "Published" },
    drafts: { ar: "\u0645\u0633\u0648\u062F\u0627\u062A", en: "Drafts" },
    archived: { ar: "\u0645\u0624\u0631\u0634\u0641\u0629", en: "Archived" },
    completionRate: { ar: "\u0645\u0639\u062F\u0644 \u0627\u0644\u0625\u0643\u0645\u0627\u0644", en: "Completion Rate" },
    passRate: { ar: "\u0645\u0639\u062F\u0644 \u0627\u0644\u0646\u062C\u0627\u062D", en: "Pass Rate" },
    publishedFiles: { ar: "\u0645\u0644\u0641\u0627\u062A \u0645\u0646\u0634\u0648\u0631\u0629", en: "Published Files" },
    storageMb: { ar: "\u0627\u0644\u0645\u0633\u0627\u062D\u0629 (MB)", en: "Storage (MB)" },
    totalViews: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0627\u062A", en: "Total Views" },
    pendingScans: { ar: "\u0641\u062D\u0648\u0635 \u0645\u0639\u0644\u0642\u0629", en: "Pending Scans" },
    totalIssued: { ar: "\u0623\u0643\u0648\u0627\u062F \u0635\u0627\u062F\u0631\u0629", en: "Total Issued" },
    activated: { ar: "\u0645\u0641\u0639\u0651\u0644\u0629", en: "Activated" },
    activationRate: { ar: "\u0646\u0633\u0628\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644", en: "Activation Rate" },
    estimatedValue: { ar: "\u0642\u064A\u0645\u0629 \u062A\u0642\u062F\u064A\u0631\u064A\u0629", en: "Estimated Value" },
    securityEvents: { ar: "\u0623\u062D\u062F\u0627\u062B \u0623\u0645\u0646\u064A\u0629", en: "Security Events" },
    successfulLogins: { ar: "\u062F\u062E\u0648\u0644 \u0646\u0627\u062C\u062D", en: "Successful Logins" },
    failedLogins: { ar: "\u062F\u062E\u0648\u0644 \u0641\u0627\u0634\u0644", en: "Failed Logins" },
    loginSuccessRate: { ar: "\u0645\u0639\u062F\u0644 \u0627\u0644\u0646\u062C\u0627\u062D", en: "Login Success Rate" }
  },
  // ===== Chart / section titles + exam metric rows =====
  charts: {
    studentGrowth: { ar: "\u0646\u0645\u0648 \u0627\u0644\u0637\u0644\u0627\u0628", en: "Student Growth" },
    dailyRegistrations: { ar: "\u0627\u0644\u062A\u0633\u062C\u064A\u0644\u0627\u062A \u0627\u0644\u064A\u0648\u0645\u064A\u0629", en: "Daily Registrations" },
    passRatesBySubject: { ar: "\u0646\u0633\u0628 \u0627\u0644\u0646\u062C\u0627\u062D \u062D\u0633\u0628 \u0627\u0644\u0645\u0627\u062F\u0629", en: "Pass Rates by Subject" },
    hardestQuestions: { ar: "\u0623\u0635\u0639\u0628 10 \u0623\u0633\u0626\u0644\u0629", en: "Top 10 Hardest Questions" },
    scoreDistribution: { ar: "\u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u062F\u0631\u062C\u0627\u062A", en: "Score Distribution" },
    metrics: { ar: "\u0645\u0639\u062F\u0644\u0627\u062A", en: "Metrics" },
    totalSessions: { ar: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062C\u0644\u0633\u0627\u062A", en: "Total Sessions" },
    completedSessions: { ar: "\u062C\u0644\u0633\u0627\u062A \u0645\u0643\u062A\u0645\u0644\u0629", en: "Completed" },
    avgDuration: { ar: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0645\u062F\u0629 (\u062F\u0642\u064A\u0642\u0629)", en: "Avg Duration (min)" },
    mostReported: { ar: "\u0623\u0643\u062B\u0631 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0625\u0628\u0644\u0627\u063A\u0627\u064B", en: "Most Reported Questions" },
    topAttempted: { ar: "\u0627\u0644\u0623\u0643\u062B\u0631 \u0645\u062D\u0627\u0648\u0644\u0629", en: "Top Attempted" },
    viewsByType: { ar: "\u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0627\u062A \u062D\u0633\u0628 \u0627\u0644\u0646\u0648\u0639", en: "Views by Type" },
    dailyActivations: { ar: "\u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u064A\u0648\u0645\u064A", en: "Daily Activations" },
    eventsByType: { ar: "\u0627\u0644\u0623\u062D\u062F\u0627\u062B \u062D\u0633\u0628 \u0627\u0644\u0646\u0648\u0639", en: "Events by Type" }
  },
  // ===== ReportsModeration =====
  moderation: {
    title: { ar: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Reports Moderation" },
    desc: { ar: "\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A + \u0627\u0646\u062A\u0642\u0627\u0644 \u0627\u0644\u062D\u0627\u0644\u0629 + \u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0645\u0633\u0624\u0648\u0644", en: "Review reports + transition status + assign" },
    search: { ar: "\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0648\u0635\u0641...", en: "Search description..." },
    status: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629", en: "Status" },
    clear: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0641\u0644\u0627\u062A\u0631", en: "Clear filters" },
    question: { ar: "\u0627\u0644\u0633\u0624\u0627\u0644", en: "Question" },
    student: { ar: "\u0627\u0644\u0637\u0627\u0644\u0628", en: "Student" },
    reason: { ar: "\u0627\u0644\u0633\u0628\u0628", en: "Reason" },
    assigned: { ar: "\u0627\u0644\u0645\u0633\u0624\u0648\u0644", en: "Assigned" },
    created: { ar: "\u0627\u0644\u0625\u0646\u0634\u0627\u0621", en: "Created" },
    updated: { ar: "\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B", en: "Updated" },
    actions: { ar: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
    transition: { ar: "\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u0629", en: "Transition status" },
    notes: { ar: "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u062D\u0644 (\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0644\u0631\u0641\u0636)", en: "Resolution notes (required for rejection)" },
    save: { ar: "\u062D\u0641\u0638", en: "Save" },
    cancel: { ar: "\u0625\u0644\u063A\u0627\u0621", en: "Cancel" },
    noTransitions: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u0646\u062A\u0642\u0627\u0644\u0627\u062A \u0645\u062A\u0627\u062D\u0629", en: "No transitions available" },
    noNotes: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0644\u0627\u062D\u0638\u0627\u062A", en: "No notes" },
    prev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    page: { ar: "\u0635\u0641\u062D\u0629", en: "Page" },
    of: { ar: "\u0645\u0646", en: "of" },
    showing: { ar: "\u0639\u0631\u0636", en: "Showing" },
    results: { ar: "\u0646\u062A\u0627\u0626\u062C", en: "results" },
    noData: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A", en: "No reports found" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644...", en: "Loading..." },
    resolvedBy: { ar: "\u062D\u0644\u0651\u0647", en: "Resolved by" },
    reviewedBy: { ar: "\u0631\u0627\u062C\u0639\u0647", en: "Reviewed by" },
    assign: { ar: "\u062A\u0639\u064A\u064A\u0646", en: "Assign" },
    assignTitle: { ar: "\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0628\u0644\u0627\u063A \u0644\u0645\u062F\u064A\u0631", en: "Assign report to an administrator" },
    assignBody: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0639\u0646 \u0645\u0631\u0627\u062C\u0639\u0629 \u0647\u0630\u0627 \u0627\u0644\u0628\u0644\u0627\u063A. \u0633\u064A\u0638\u0647\u0631 \u0627\u0633\u0645\u0647 \u0641\u064A \u0639\u0645\u0648\u062F \xAB\u0627\u0644\u0645\u0633\u0624\u0648\u0644\xBB.", en: "Choose the administrator responsible for reviewing this report. Their name shows in the Assigned column." },
    selectAdmin: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u062F\u064A\u0631", en: "Select administrator" },
    assignOk: { ar: "\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0644\u0644\u0628\u0644\u0627\u063A", en: "Report assigned" },
    assignFail: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062A\u0639\u064A\u064A\u0646", en: "Assign failed" },
    currentStatus: { ar: "\u0627\u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", en: "Current status" },
    loadError: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Could not load reports" },
    statusUpdatedToast: { ar: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0628\u0644\u0627\u063A", en: "Report status updated" },
    updateFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", en: "Update failed" },
    adminsLoadError: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062F\u0631\u0627\u0621", en: "Could not load administrators" },
    // STATUS_OPTIONS labels (filter select, keyed by labelKey).
    statusAll: { ar: "\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A", en: "All statuses" },
    statusPending: { ar: "\u0645\u0639\u0644\u0651\u0642", en: "Pending" },
    statusReviewing: { ar: "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Reviewing" },
    statusResolved: { ar: "\u0645\u062D\u0644\u0648\u0644", en: "Resolved" },
    statusRejected: { ar: "\u0645\u0631\u0641\u0648\u0636", en: "Rejected" },
    statusClosed: { ar: "\u0645\u063A\u0644\u0642", en: "Closed" }
  }
};

// apps/admin-web/src/lib/dictionary/audit.ts
var auditDict = {
  // ===== Shared severity vocabulary =====
  severity: {
    critical: { ar: "\u062D\u0631\u062C", en: "Critical" },
    warning: { ar: "\u062A\u062D\u0630\u064A\u0631", en: "Warning" },
    info: { ar: "\u0645\u0639\u0644\u0648\u0645\u0627\u062A", en: "Info" },
    heading: { ar: "\u0627\u0644\u062E\u0637\u0648\u0631\u0629", en: "Severity" }
  },
  // ===== Security event-type labels (AuditCenter + AuditLogViewer) =====
  eventTypes: {
    loginSuccess: { ar: "\u0646\u062C\u0627\u062D \u0627\u0644\u062F\u062E\u0648\u0644", en: "Login Success" },
    loginFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062F\u062E\u0648\u0644", en: "Login Failed" },
    logout: { ar: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C", en: "Logout" },
    sessionCreated: { ar: "\u0625\u0646\u0634\u0627\u0621 \u062C\u0644\u0633\u0629", en: "Session Created" },
    sessionRevoked: { ar: "\u0625\u0646\u0647\u0627\u0621 \u062C\u0644\u0633\u0629", en: "Session Revoked" },
    deviceRegistered: { ar: "\u062A\u0633\u062C\u064A\u0644 \u062C\u0647\u0627\u0632", en: "Device Registered" },
    deviceChange: { ar: "\u062A\u063A\u064A\u064A\u0631 \u062C\u0647\u0627\u0632", en: "Device Change" },
    banIssued: { ar: "\u062A\u0637\u0628\u064A\u0642 \u062D\u0638\u0631", en: "Ban Issued" },
    banLifted: { ar: "\u0631\u0641\u0639 \u062D\u0638\u0631", en: "Ban Lifted" },
    mfaEnabled: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A", en: "MFA Enabled" },
    mfaDisabled: { ar: "\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A", en: "MFA Disabled" },
    permissionChange: { ar: "\u062A\u063A\u064A\u064A\u0631 \u0635\u0644\u0627\u062D\u064A\u0629", en: "Permission Change" },
    roleChange: { ar: "\u062A\u063A\u064A\u064A\u0631 \u062F\u0648\u0631", en: "Role Change" },
    subscriptionActivated: { ar: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0634\u062A\u0631\u0627\u0643", en: "Subscription Activated" },
    subscriptionRevoked: { ar: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0634\u062A\u0631\u0627\u0643", en: "Subscription Revoked" },
    fileAccess: { ar: "\u0648\u0635\u0648\u0644 \u0644\u0645\u0644\u0641", en: "File Access" },
    fileAccessDenied: { ar: "\u0631\u0641\u0636 \u0648\u0635\u0648\u0644 \u0644\u0645\u0644\u0641", en: "File Access Denied" },
    fileScanRejected: { ar: "\u0631\u0641\u0636 \u0641\u062D\u0635 \u0645\u0644\u0641", en: "File Scan Rejected" },
    securityAlert: { ar: "\u062A\u0646\u0628\u064A\u0647 \u0623\u0645\u0646\u064A", en: "Security Alert" },
    suspiciousActivity: { ar: "\u0646\u0634\u0627\u0637 \u0645\u0634\u0628\u0648\u0647", en: "Suspicious Activity" }
  },
  // ===== Actor chips ({{name}} interpolation) =====
  actor: {
    admin: { ar: "\u0645\u062F\u064A\u0631 \xB7 {{name}}", en: "Admin \xB7 {{name}}" },
    student: { ar: "\u0637\u0627\u0644\u0628 \xB7 {{name}}", en: "Student \xB7 {{name}}" },
    system: { ar: "\u0627\u0644\u0646\u0638\u0627\u0645", en: "System" }
  },
  // ===== Shared table column headings =====
  headings: {
    time: { ar: "\u0627\u0644\u0648\u0642\u062A", en: "Time" },
    type: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    description: { ar: "\u0627\u0644\u0648\u0635\u0641", en: "Description" },
    actor: { ar: "\u0627\u0644\u0641\u0627\u0639\u0644", en: "Actor" }
  },
  // ===== AuditCenter =====
  center: {
    eyebrow: { ar: "\u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u0645\u0624\u0633\u0633\u064A", en: "Institutional assurance" },
    title: { ar: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A", en: "Security Audit" },
    subtitle: { ar: "\u0633\u062C\u0644 \u0632\u0645\u0646\u064A \u0644\u0644\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062D\u0633\u0627\u0633\u0629 \u0639\u0628\u0631 \u0627\u0644\u0645\u0646\u0635\u0629: \u0627\u0644\u062F\u062E\u0648\u0644\u060C \u0627\u0644\u0623\u062C\u0647\u0632\u0629\u060C \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u060C \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0634\u0628\u0648\u0647\u0629.", en: "Chronological log of sensitive platform events: sign-ins, devices, multi-factor, and suspicious attempts." },
    searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0623\u062D\u062F\u0627\u062B", en: "Search events" },
    severityAll: { ar: "\u0627\u0644\u062E\u0637\u0648\u0631\u0629: \u0627\u0644\u0643\u0644", en: "Severity: All" },
    eventTypeAll: { ar: "\u0627\u0644\u0646\u0648\u0639: \u0627\u0644\u0643\u0644", en: "Event type: All" },
    dateFrom: { ar: "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E", en: "From date" },
    dateTo: { ar: "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E", en: "To date" },
    clearFilters: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062A\u0635\u0641\u064A\u0629", en: "Clear filters" },
    emptyTitle: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0623\u0645\u0646\u064A\u0629", en: "No security events" },
    emptyNoEvents: { ar: "\u0644\u0645 \u062A\u064F\u0633\u062C\u064E\u0651\u0644 \u0623\u062D\u062F\u0627\u062B \u0636\u0645\u0646 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629.", en: "No events are visible within your current permissions." },
    emptyFiltered: { ar: "\u0639\u062F\u0651\u0644 \u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u0644\u0631\u0624\u064A\u0629 \u0627\u0644\u0645\u0632\u064A\u062F.", en: "Adjust the filters to see more." },
    errorForbidden: { ar: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A. \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645.", en: "You do not have permission to view the security audit. This feature is reserved for super-administrators." },
    errorLoad: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0623\u0645\u0646\u064A.", en: "Unable to load the security audit." }
  },
  // ===== AuditLogViewer =====
  viewer: {
    title: { ar: "\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u0643\u0627\u0645\u0644", en: "Full Audit Log" },
    desc: { ar: "\u0643\u0644 \u0627\u0644\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u0623\u0645\u0646\u064A\u0629 \u0645\u0639 \u0641\u0644\u0627\u062A\u0631 \u0648\u062A\u0631\u0642\u064A\u0645 \u0635\u0641\u062D\u0627\u062A", en: "All security events with filters + pagination" },
    search: { ar: "\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0648\u0635\u0641...", en: "Search description..." },
    severity: { ar: "\u0627\u0644\u062E\u0637\u0648\u0631\u0629", en: "Severity" },
    eventType: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Event type" },
    dateFrom: { ar: "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E", en: "From date" },
    dateTo: { ar: "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E", en: "To date" },
    clear: { ar: "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0641\u0644\u0627\u062A\u0631", en: "Clear filters" },
    // Legacy Arabic header carried a typo («الوصصف») — preserved byte-identical.
    descriptionHeader: { ar: "\u0627\u0644\u0648\u0635\u0635\u0641", en: "Description" },
    ip: { ar: "IP", en: "IP" },
    correlation: { ar: "\u0645\u0639\u0631\u0641 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637", en: "Correlation ID" },
    severityAll: { ar: "\u0643\u0644 \u0627\u0644\u062E\u0637\u0648\u0631\u0629", en: "All severities" },
    eventTypeAll: { ar: "\u0643\u0644 \u0627\u0644\u0623\u0646\u0648\u0627\u0639", en: "All types" },
    exportCsv: { ar: "\u062A\u0635\u062F\u064A\u0631 CSV", en: "Export CSV" },
    noData: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u062C\u0644\u0627\u062A", en: "No audit log entries" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644...", en: "Loading..." },
    prev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    page: { ar: "\u0635\u0641\u062D\u0629", en: "Page" },
    of: { ar: "\u0645\u0646", en: "of" },
    showing: { ar: "\u0639\u0631\u0636", en: "Showing" },
    results: { ar: "\u0627\u0644\u0646\u062A\u0627\u0626\u062C", en: "Results" },
    loadError: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0633\u062C\u0644", en: "Could not load audit logs" }
  },
  // ===== ActivityMonitor =====
  activity: {
    title: { ar: "\u0645\u0631\u0627\u0642\u0628\u0629 \u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u062F\u0631\u0627\u0621", en: "Admin activity monitor" },
    desc: { ar: "\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0648\u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0648\u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0646\u062C\u0632\u0629 (\u0623\u0633\u0626\u0644\u0629\u060C \u0645\u0644\u0641\u0627\u062A\u060C \u0623\u0643\u0648\u0627\u062F).", en: "Admin sessions, devices, and completed work (questions, files, codes)." },
    adminFilterPlaceholder: { ar: "\u0641\u0644\u062A\u0631\u0629 \u0628\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u062F\u064A\u0631 (UUID)", en: "Filter by admin id (UUID)" },
    apply: { ar: "\u062A\u0637\u0628\u064A\u0642", en: "Apply" },
    sectionsAria: { ar: "\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629", en: "Monitor sections" },
    tabSessions: { ar: "\u0627\u0644\u062C\u0644\u0633\u0627\u062A", en: "Sessions" },
    tabLogs: { ar: "\u0633\u062C\u0644 \u0627\u0644\u0646\u0634\u0627\u0637", en: "Activity logs" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026", en: "Loading\u2026" },
    sessionsEmpty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0644\u0633\u0627\u062A \u0625\u062F\u0627\u0631\u064A\u0629 \u0628\u0639\u062F.", en: "No admin sessions yet." },
    logsEmpty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0646\u0634\u0627\u0637 \u0628\u0639\u062F.", en: "No activity events yet." },
    noIp: { ar: "IP \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631", en: "no IP" },
    sessionActive: { ar: "\u0646\u0634\u0637\u0629", en: "Active" },
    sessionClosed: { ar: "\u0645\u063A\u0644\u0642\u0629", en: "Closed" },
    duration: { ar: "\u0627\u0644\u0645\u062F\u0629", en: "Duration" },
    questions: { ar: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629", en: "Questions" },
    files: { ar: "\u0627\u0644\u0645\u0644\u0641\u0627\u062A", en: "Files" },
    codes: { ar: "\u0627\u0644\u0623\u0643\u0648\u0627\u062F", en: "Codes" },
    started: { ar: "\u0628\u062F\u0623\u062A", en: "Started" },
    lastActivity: { ar: "\u0622\u062E\u0631 \u0646\u0634\u0627\u0637", en: "Last activity" },
    closed: { ar: "\u0623\u064F\u063A\u0644\u0642\u062A", en: "Closed" },
    admin: { ar: "\u0627\u0644\u0645\u062F\u064A\u0631", en: "Admin" },
    action: { ar: "\u0627\u0644\u0625\u062C\u0631\u0627\u0621", en: "Action" },
    details: { ar: "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", en: "Details" },
    actionCreateQuestion: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0633\u0624\u0627\u0644", en: "Question created" },
    actionUploadFile: { ar: "\u0631\u0641\u0639 \u0645\u0644\u0641", en: "File uploaded" },
    actionGenerateCode: { ar: "\u062A\u0648\u0644\u064A\u062F \u0623\u0643\u0648\u0627\u062F", en: "Codes generated" },
    chipSize: { ar: "\u0627\u0644\u062D\u062C\u0645", en: "size" },
    chipQty: { ar: "\u0627\u0644\u0643\u0645\u064A\u0629", en: "qty" },
    pagerPage: { ar: "\u0635\u0641\u062D\u0629 {{page}} \u0645\u0646 {{totalPages}}", en: "Page {{page}} of {{totalPages}}" },
    pagerPrev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Prev" },
    pagerNext: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    loadSessionsError: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062C\u0644\u0633\u0627\u062A.", en: "Could not load sessions." },
    loadLogsError: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0633\u062C\u0644 \u0627\u0644\u0646\u0634\u0627\u0637.", en: "Could not load activity logs." }
  },
  // ===== DashboardFeeds =====
  feeds: {
    recentTitle: { ar: "\u0627\u0644\u0646\u0634\u0627\u0637 \u0627\u0644\u0623\u062E\u064A\u0631", en: "Recent activity" },
    topSubjects: { ar: "\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u0623\u0643\u062B\u0631 \u0646\u0634\u0627\u0637\u064B\u0627", en: "Most active subjects" },
    reportsTitle: { ar: "\u0645\u0644\u062E\u0635 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Reports summary" },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026", en: "Loading\u2026" },
    failed: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0628\u0637\u0627\u0642\u0629", en: "Could not load this card" },
    noActivity: { ar: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0646\u0634\u0627\u0637 \u062D\u062F\u064A\u062B", en: "No recent activity" },
    noSubjects: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0634\u0627\u0637 \u0644\u0644\u0645\u0648\u0627\u062F", en: "No subject activity data" },
    answered: { ar: "\u0625\u062C\u0627\u0628\u0629", en: "answered" },
    accuracy: { ar: "\u0627\u0644\u062F\u0642\u0629", en: "accuracy" },
    activeStudents: { ar: "\u0637\u0644\u0627\u0628 \u0646\u0634\u0637\u0648\u0646", en: "active students" },
    pending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Pending" },
    resolved: { ar: "\u0645\u062D\u0644\u0648\u0644\u0629", en: "Resolved" },
    rejected: { ar: "\u0645\u0631\u0641\u0648\u0636\u0629", en: "Rejected" },
    total: { ar: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A", en: "Total" },
    viewReports: { ar: "\u0627\u0641\u062A\u062D \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A", en: "Open reports moderation" }
  }
};

// apps/admin-web/src/lib/dictionary/admincenters.ts
var admincentersDict = {
  // ===== AdminsCenter (local furniture) =====
  adminsCenter: {
    eyebrow: { ar: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629", en: "Central administration" },
    description: {
      ar: "\u062A\u064F\u062F\u0627\u0631 \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0648\u0627\u0644\u0646\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u0624\u0633\u0633\u064A.",
      en: "Manage administrators, their roles and academic scopes from this institutional center."
    },
    emptyHint: { ar: "\u0639\u062F\u0651\u0644 \u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u0623\u0648 \u0623\u0636\u0641 \u0645\u062F\u064A\u0631\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B.", en: "Adjust filters or add a new administrator." },
    identityColumn: { ar: "\u0627\u0644\u0645\u062F\u064A\u0631", en: "Administrator" },
    phoneLabel: { ar: "\u0647\u0627\u062A\u0641: {{phone}}", en: "Phone: {{phone}}" },
    createdLabel: { ar: "\u0623\u064F\u0646\u0634\u0626 \u0641\u064A {{date}}", en: "Created {{date}}" },
    dialogEyebrow: { ar: "\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A", en: "Administrative action" },
    dialogClose: { ar: "\u0625\u063A\u0644\u0627\u0642", en: "Close dialog" },
    resetSessionsNotice: {
      ar: "\u0633\u064A\u062A\u0645 \u0625\u0628\u0637\u0627\u0644 \u062C\u0645\u064A\u0639 \u062C\u0644\u0633\u0627\u062A {{name}} \u0641\u0648\u0631\u064B\u0627.",
      en: "All {{name}}'s live sessions will be invalidated immediately."
    },
    roleNamePatternHint: {
      ar: "\u0623\u062D\u0631\u0641 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648\u0634\u0631\u0637\u0629 \u0633\u0641\u0644\u064A\u0629 \u0641\u0642\u0637\u060C \u0645\u0646 3 \u0625\u0644\u0649 50 \u0631\u0645\u0632\u064B\u0627.",
      en: "Letters, numbers and underscores only; 3\u201350 characters."
    },
    roleEmptyPermissionsNote: {
      ar: "\u064A\u0646\u0634\u0623 \u0627\u0644\u062F\u0648\u0631 \u0628\u0644\u0627 \u0635\u0644\u0627\u062D\u064A\u0627\u062A. \u0623\u0636\u0641 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0642\u0628\u0644 \u062A\u0639\u064A\u064A\u0646\u0647 \u0644\u0623\u064A \u0645\u062F\u064A\u0631.",
      en: "The role begins with no permissions. Add grants before assigning it."
    }
  },
  // ===== RolesCenter (local furniture) =====
  rolesCenter: {
    eyebrow: { ar: "\u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u0648\u0635\u0648\u0644", en: "Access policy" },
    policyHint: {
      ar: "\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0627\u0644\u0646\u0638\u0627\u0645\u064A\u0629 \u0645\u062D\u0645\u064A\u0629 \u0645\u0646 \u0627\u0644\u062D\u0630\u0641\u061B \u064A\u0645\u0643\u0646 \u062A\u0639\u0637\u064A\u0644\u0647\u0627 \u0645\u0624\u0642\u062A\u0627\u064B. \u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0627\u0644\u0645\u062E\u0635\u0635\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062D\u0630\u0641 \u0627\u0644\u0646\u0647\u0627\u0626\u064A.",
      en: "System roles are protected from deletion but can be disabled. Custom roles can be permanently deleted."
    },
    emptyHint: { ar: "\u0623\u0646\u0634\u0626 \u0623\u0648\u0644 \u062F\u0648\u0631 \u0645\u062E\u0635\u0635 \u0644\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0644\u0627\u062D\u0642\u0627\u064B.", en: "Create your first custom role to assign permissions later." },
    noDescription: { ar: "\u062F\u0648\u0631 \u0628\u0644\u0627 \u0648\u0635\u0641 \u0625\u0636\u0627\u0641\u064A.", en: "Role without an additional description." },
    matrixButtonTitle: { ar: "\u062A\u0639\u062F\u064A\u0644 \u0645\u0635\u0641\u0648\u0641\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Edit permission matrix" },
    uiKeysButtonTitle: { ar: "\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u0629 (64 \u0645\u0641\u062A\u0627\u062D\u0627\u064B)", en: "Advanced UI permissions (62 keys)" },
    uiKeysButton: { ar: "\u0627\u0644\u0648\u0627\u062C\u0647\u0629", en: "UI keys" },
    superAdminLocked: { ar: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u0637\u064A\u0644 \u062F\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645", en: "Super-admin role cannot be disabled" }
  },
  // ===== SettingsCenter =====
  settings: {
    loadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", en: "Could not load settings" },
    savedToast: { ar: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0625\u0639\u062F\u0627\u062F", en: "Setting updated" },
    saveFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", en: "Update failed" },
    noDefaultToast: { ar: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0648\u0635\u0641 \u0644\u0647\u0630\u0627 \u0627\u0644\u0625\u0639\u062F\u0627\u062F", en: "No description for default value" },
    resetToast: { ar: "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646", en: "Reset to default" },
    resetFailed: { ar: "\u0641\u0634\u0644\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646", en: "Reset failed" },
    generalCategory: { ar: "\u0639\u0627\u0645", en: "General" },
    description: {
      ar: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062A\u0639\u062F\u064A\u0644 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0645\u062F\u064A\u0631 (\u0645\u0641\u0635\u0648\u0644\u0629 \u0639\u0646 \u0627\u0644\u0623\u0633\u0631\u0627\u0631)",
      en: "Admin-editable platform config (separated from secrets)"
    },
    search: { ar: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0623\u0648 \u0627\u0644\u0642\u064A\u0645\u0629...", en: "Search by key or value..." },
    reset: { ar: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646", en: "Reset" },
    locked: { ar: "\u0645\u0642\u0641\u0644 \u2014 \u064A\u062A\u0637\u0644\u0628 super_admin", en: "Locked \u2014 requires super_admin" },
    noData: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0639\u062F\u0627\u062F\u0627\u062A", en: "No settings found" },
    resetConfirmTitle: { ar: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F", en: "Reset setting" },
    resetConfirmDescription: {
      ar: '\u0633\u064A\u062A\u0645 \u0627\u0633\u062A\u0628\u062F\u0627\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0640 "{{key}}" ({{current}}) \u0628\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 "{{defaultValue}}".',
      en: '"{{key}}" will be reset from its current value ({{current}}) to the default "{{defaultValue}}".'
    },
    resetConfirmLabel: { ar: "\u062A\u0623\u0643\u064A\u062F \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646", en: "Confirm reset" }
  },
  // ===== Permission editors (PermissionMatrixEditor + UiPermissionsEditor) =====
  permissions: {
    // Shared by both editors (identical wording in the originals).
    loadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Could not load permissions" },
    savedToast: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Permissions saved" },
    saveFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638", en: "Save failed" },
    unsavedChanges: { ar: "\u062A\u063A\u064A\u064A\u0631\u0627\u062A \u063A\u064A\u0631 \u0645\u062D\u0641\u0648\u0638\u0629", en: "Unsaved changes" },
    grantsLabel: { ar: "\u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0645\u0646\u0648\u062D\u0629", en: "grants" },
    matrix: {
      title: { ar: "\u0645\u0635\u0641\u0648\u0641\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", en: "Permission Matrix" },
      desc: { ar: "\u062D\u062F\u062F \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0644\u0643\u0644 \u0645\u0648\u0631\u062F. \u0643\u0644 \u062E\u0644\u064A\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062A\u0628\u062F\u064A\u0644.", en: "Toggle permissions per resource. Each cell is independent." },
      resource: { ar: "\u0627\u0644\u0645\u0648\u0631\u062F", en: "Resource" },
      scope: { ar: "\u0627\u0644\u0646\u0637\u0627\u0642", en: "Scope" },
      actions: { ar: "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A", en: "Actions" },
      reset: { ar: "\u062A\u0631\u0627\u062C\u0639", en: "Reset" },
      systemLocked: { ar: "\u062F\u0648\u0631 \u0646\u0638\u0627\u0645 \u2014 \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0641\u0642\u0637", en: "System role \u2014 read only" },
      noGrants: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0645\u0645\u0646\u0648\u062D\u0629 \u0628\u0639\u062F", en: "No permissions granted yet" }
    },
    ui: {
      title: { ar: "\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u0629", en: "Advanced UI Permissions" },
      desc: {
        ar: "\u062D\u062F\u062F \u0645\u0627 \u064A\u0638\u0647\u0631 \u0644\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646 \u0644\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0631 \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 (64 \u0645\u0641\u062A\u0627\u062D\u0627\u064B: \u0645\u0634\u0627\u0647\u062F + \u0623\u0642\u0633\u0627\u0645 + \u0623\u0632\u0631\u0627\u0631).",
        en: "Choose what assigned administrators see in the console (64 keys: views + tabs + buttons)."
      },
      loadFailed: { ar: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629", en: "Could not load UI permissions" },
      configured: { ar: "\u0645\u064F\u0647\u064A\u0623", en: "Configured" },
      notConfigured: { ar: "\u063A\u064A\u0631 \u0645\u064F\u0647\u064A\u0623 \u2014 \u0648\u0635\u0648\u0644 \u0643\u0627\u0645\u0644", en: "Not configured \u2014 full access" },
      systemLocked: { ar: "\u062F\u0648\u0631 \u0646\u0638\u0627\u0645 \u2014 \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0641\u0642\u0637 (\u064A\u0634\u0645\u0644 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645)", en: "System role \u2014 read only (includes super_admin)" },
      save: { ar: "\u062D\u0641\u0638 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D", en: "Save keys" },
      resetToFull: { ar: "\u0625\u0639\u0627\u062F\u0629 \u0625\u0644\u0649 \u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u0643\u0627\u0645\u0644", en: "Reset to full access" },
      selected: { ar: "\u0645\u0641\u0627\u062A\u064A\u062D \u0645\u062D\u062F\u062F\u0629", en: "keys selected" },
      searchPlaceholder: { ar: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u2026 (\u0645\u062B\u0627\u0644: btn:codes.export)", en: "Search by label or key\u2026 (e.g. btn:codes.export)" },
      noMatches: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0641\u0627\u062A\u064A\u062D \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0628\u062D\u062B", en: "No keys match the search" },
      templates: { ar: "\u0642\u0648\u0627\u0644\u0628 \u0628\u062F\u0627\u064A\u0629 \u0633\u0631\u064A\u0639\u0629", en: "Quick-start templates" },
      unconfiguredTitle: { ar: "\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0631 \u063A\u064A\u0631 \u0645\u064F\u0647\u064A\u0623 \u0628\u0639\u062F", en: "This role is not configured yet" },
      unconfiguredBody: {
        ar: "NULL \u064A\u0639\u0646\u064A \u0648\u0635\u0648\u0644\u0627\u064B \u0643\u0627\u0645\u0644\u0627\u064B: \u0643\u0644 \u0627\u0644\u0645\u0634\u0627\u0647\u062F \u0648\u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0648\u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646 \u2014 \u062F\u0648\u0646 \u0623\u064A \u062A\u063A\u064A\u064A\u0631 \u0641\u064A \u0627\u0644\u0633\u0644\u0648\u0643. \u0623\u0648\u0644 \u062D\u0641\u0638 \u064A\u062B\u0628\u0651\u062A \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u061B \u0628\u0639\u062F\u0647\u0627 \u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u062F\u064A\u0631 \u0641\u0642\u0637 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0645\u062D\u062F\u062F\u0629. \u0645\u0644\u0627\u062D\u0638\u0629 \u0623\u0645\u0646\u064A\u0629 (\u0637\u0628\u0642\u062A\u0627\u0646): \u0647\u0630\u0647 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u062A\u064F\u062E\u0641\u064A \u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0641\u0642\u0637 \u2014 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u062D\u0642\u064A\u0642\u064A\u0629 \u062A\u0628\u0642\u0649 \u0641\u064A \u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0640 API ([Authorize] + \u0641\u062D\u0648\u0635\u0627\u062A \u0627\u0644\u0646\u0637\u0627\u0642). \u0645\u0641\u062A\u0627\u062D view:codes \u0644\u0627 \u064A\u0645\u0646\u062D \u0635\u0644\u0627\u062D\u064A\u0629 codes:view \u0627\u0644\u0643\u0644\u0627\u0633\u064A\u0643\u064A\u0629.",
        en: "NULL means full access: every view, tab and button shows for assigned administrators \u2014 zero behavior change. The first save pins the list; after that only the selected keys render. Security note (two layers): these keys only hide UI elements \u2014 the REAL boundary stays in the API policies ([Authorize] + scope checks). view:codes never grants the classic codes:view permission."
      },
      emptyTree: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0632\u0631\u0627\u0631 \u0623\u0648 \u0623\u0642\u0633\u0627\u0645 \u062A\u062D\u062A \u0647\u0630\u0627 \u0627\u0644\u0645\u0634\u0647\u062F.", en: "No buttons or tabs under this view." },
      views: { ar: "\u0627\u0644\u0645\u0634\u0627\u0647\u062F", en: "Views" },
      saveOk: { ar: "\u062A\u0645 \u062D\u0641\u0638 \u0645\u0641\u0627\u062A\u064A\u062D \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629", en: "UI permission keys saved" },
      resetOk: { ar: "\u0623\u064F\u0639\u064A\u062F \u0627\u0644\u062F\u0648\u0631 \u0625\u0644\u0649 \u063A\u064A\u0631 \u0645\u064F\u0647\u064A\u0623 (\u0648\u0635\u0648\u0644 \u0643\u0627\u0645\u0644)", en: "Role reset to unconfigured (full access)" },
      confirmReset: {
        ar: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062F\u0648\u0631 \u0625\u0644\u0649 \u063A\u064A\u0631 \u0645\u064F\u0647\u064A\u0623 (NULL = \u0648\u0635\u0648\u0644 \u0643\u0627\u0645\u0644 \u0644\u0643\u0644 \u0627\u0644\u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u0645\u0639\u064A\u0651\u0646\u064A\u0646)\u061F",
        en: "Reset the role to unconfigured (NULL = full access for every assigned administrator)?"
      },
      resetAcknowledge: {
        ar: "\u0623\u0641\u0647\u0645 \u0623\u0646 \u0647\u0630\u0627 \u064A\u0645\u0646\u062D \u0648\u0635\u0648\u0644\u064B\u0627 \u0643\u0627\u0645\u0644\u064B\u0627 \u0644\u0643\u0644 \u0645\u062F\u0631\u0627\u0621 \u0627\u0644\u062F\u0648\u0631 \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0625\u0644\u0627 \u0628\u062D\u0641\u0638 \u0642\u0627\u0626\u0645\u0629 \u062C\u062F\u064A\u062F\u0629",
        en: "I understand this grants full access to every administrator of the role and can only be undone by saving a new list"
      }
    }
  }
};

// apps/admin-web/src/lib/dictionary/notifications.ts
var notificationsDict = {
  sentToast: { ar: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0625\u0644\u0649 {{count}} \u0637\u0627\u0644\u0628", en: "Notification sent to {{count}} recipients" },
  sendFailed: { ar: "\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644", en: "Send failed" },
  // ===== NotificationCompose =====
  compose: {
    title: { ar: "\u0625\u0646\u0634\u0627\u0621 \u0625\u0634\u0639\u0627\u0631", en: "Compose Notification" },
    desc: { ar: "\u0623\u0631\u0633\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u064B \u0645\u0633\u062A\u0647\u062F\u0641\u0627\u064B \u0644\u0644\u0637\u0644\u0627\u0628", en: "Send a targeted notification to students" },
    notifTitle: { ar: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646", en: "Title" },
    notifBody: { ar: "\u0627\u0644\u0646\u0635", en: "Body" },
    notifType: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    audience: { ar: "\u0627\u0644\u062C\u0645\u0647\u0648\u0631 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641", en: "Target audience" },
    target: { ar: "\u0627\u0644\u0647\u062F\u0641", en: "Target" },
    schedule: { ar: "\u0627\u0644\u062C\u062F\u0648\u0644\u0629", en: "Scheduling" },
    immediate: { ar: "\u0625\u0631\u0633\u0627\u0644 \u0641\u0648\u0631\u064A", en: "Send immediately" },
    scheduled: { ar: "\u0645\u062C\u062F\u0648\u0644", en: "Scheduled" },
    expiry: { ar: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", en: "Expiry date (optional)" },
    preview: { ar: "\u0645\u0639\u0627\u064A\u0646\u0629", en: "Preview" },
    send: { ar: "\u0625\u0631\u0633\u0627\u0644", en: "Send" },
    selectTarget: { ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0647\u062F\u0641", en: "Select target" },
    noTarget: { ar: "\u0644\u0627 \u064A\u062D\u062A\u0627\u062C \u0647\u062F\u0641\u0627\u064B", en: "No target needed" },
    contextUniversity: { ar: "\u0627\u0644\u062C\u0627\u0645\u0639\u0629 (\u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0647\u062F\u0641)", en: "University (to reach the target)" },
    contextCollege: { ar: "\u0627\u0644\u0643\u0644\u064A\u0629 (\u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0647\u062F\u0641)", en: "College (to reach the target)" },
    contextYear: { ar: "\u0627\u0644\u0633\u0646\u0629 (\u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0647\u062F\u0641)", en: "Year (to reach the target)" },
    contextSemester: { ar: "\u0627\u0644\u0641\u0635\u0644 (\u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0627\u062F\u0629)", en: "Semester (to reach the subject)" },
    needTargetHint: {
      ar: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0647\u062F\u0641 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0644\u0627\u0647 \u0644\u0625\u062A\u0627\u062D\u0629 \u0632\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u2014 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0644\u0627 \u064A\u0639\u0645\u0644 \u0628\u062F\u0648\u0646 \u0647\u062F\u0641 \u0635\u0627\u0644\u062D.",
      en: "Pick the target above to enable Send \u2014 sending requires a valid target."
    },
    titlePlaceholder: { ar: "\u0627\u0643\u062A\u0628 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0634\u0639\u0627\u0631...", en: "Enter notification title..." },
    bodyPlaceholder: { ar: "\u0627\u0643\u062A\u0628 \u0646\u0635 \u0627\u0644\u0625\u0634\u0639\u0627\u0631...", en: "Enter notification body..." }
  },
  // ===== SentNotificationsDialog =====
  sentCount: { ar: "{{count}} \u0625\u0634\u0639\u0627\u0631\u064B\u0627", en: "{{count}} notification(s)" },
  sent: {
    desc: {
      ar: "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0631\u0633\u0644\u0629 \u0633\u0627\u0628\u0642\u064B\u0627 \u0648\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u062A\u0633\u0644\u064A\u0645\u0647\u0627 \u0644\u0643\u0644 \u0625\u0634\u0639\u0627\u0631.",
      en: "Previously sent notifications with per-notification delivery stats."
    },
    loading: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026", en: "Loading\u2026" },
    empty: { ar: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u0631\u0633\u0644\u0629 \u0628\u0639\u062F", en: "No sent notifications yet" },
    stats: { ar: "\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A", en: "Stats" },
    type: { ar: "\u0627\u0644\u0646\u0648\u0639", en: "Type" },
    sentAt: { ar: "\u0648\u0642\u062A \u0627\u0644\u0625\u0631\u0633\u0627\u0644", en: "Sent at" },
    recipients: { ar: "\u0627\u0644\u0645\u0633\u062A\u0644\u0645\u0648\u0646", en: "Recipients" },
    delivered: { ar: "\u062A\u0645 \u0627\u0644\u062A\u0633\u0644\u064A\u0645", en: "Delivered" },
    read: { ar: "\u0627\u0644\u0642\u0631\u0627\u0621\u0627\u062A", en: "Read" },
    clicked: { ar: "\u0627\u0644\u0646\u0642\u0631\u0627\u062A", en: "Clicked" },
    failed: { ar: "\u0641\u0634\u0644\u062A", en: "Failed" },
    statsLoad: { ar: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A\u2026", en: "Loading stats\u2026" },
    prev: { ar: "\u0627\u0644\u0633\u0627\u0628\u0642", en: "Previous" },
    next: { ar: "\u0627\u0644\u062A\u0627\u0644\u064A", en: "Next" },
    pageOf: { ar: "\u0635\u0641\u062D\u0629 {{page}} \u0645\u0646 {{totalPages}}", en: "Page {{page}} of {{totalPages}}" },
    loadFailed: { ar: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0633\u062C\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", en: "Could not load sent notifications" }
  }
};

// apps/admin-web/src/lib/dictionary/statuses.ts
var unknownLabel = { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", en: "Unspecified" };
var passThrough = { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629", en: "Unknown" };
var publication = {
  labels: {
    draft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" },
    published: { ar: "\u0645\u0646\u0634\u0648\u0631", en: "Published" },
    unpublished: { ar: "\u063A\u064A\u0631 \u0645\u0646\u0634\u0648\u0631", en: "Unpublished" },
    archived: { ar: "\u0645\u0624\u0631\u0634\u0641", en: "Archived" }
  },
  unknown: unknownLabel,
  normalizeLower: true
};
var registrySource = {
  /** Questions / exams / library publication state. */
  publication,
  /** Object-retention lifecycle (PR-5 contract surfaces early in labels). */
  retention: {
    labels: {
      quarantined: { ar: "\u0645\u0639\u0632\u0648\u0644", en: "Quarantined" },
      "retention pending": { ar: "\u0642\u064A\u062F \u0627\u0644\u0627\u062D\u062A\u062C\u0627\u0632", en: "Retention pending" },
      retentionpending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0627\u062D\u062A\u062C\u0627\u0632", en: "Retention pending" }
    },
    unknown: unknownLabel
  },
  /** Availability of a metric / provider / capability. */
  availability: {
    labels: {
      unavailable: { ar: "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D", en: "Unavailable" }
    },
    unknown: unknownLabel
  },
  /** Student account status (StudentsCenter — lower-cases the wire value). */
  student: {
    labels: {
      active: { ar: "\u0646\u0634\u0637", en: "Active" },
      banned: { ar: "\u0645\u062D\u0638\u0648\u0631", en: "Banned" },
      suspended: { ar: "\u0645\u0639\u0644\u0651\u0642", en: "Suspended" },
      pending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629", en: "Pending" }
    },
    unknown: unknownLabel,
    normalizeLower: true
  },
  /** Admin/security session status (StudentsCenter sessions drawer — exact-case wire values). */
  session: {
    labels: {
      Active: { ar: "\u0646\u0634\u0637\u0629", en: "Active" },
      Revoked: { ar: "\u0645\u0646\u062A\u0647\u064A\u0629", en: "Revoked" },
      Expired: { ar: "\u0645\u0646\u062A\u0647\u064A\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629", en: "Expired" }
    },
    unknown: passThrough,
    passThroughUnknown: true
  },
  /** Security event severity (StudentsCenter security tab). */
  securitySeverity: {
    labels: {
      info: { ar: "\u0645\u0639\u0644\u0648\u0645\u0629", en: "Info" },
      warning: { ar: "\u062A\u062D\u0630\u064A\u0631", en: "Warning" },
      critical: { ar: "\u062D\u0631\u062C", en: "Critical" }
    },
    unknown: passThrough,
    passThroughUnknown: true
  },
  /** Student subscription academic scope. */
  subscriptionScope: {
    labels: {
      subject: { ar: "\u0645\u0627\u062F\u0629", en: "Subject" },
      semester: { ar: "\u0641\u0635\u0644", en: "Semester" },
      year: { ar: "\u0633\u0646\u0629", en: "Year" },
      college: { ar: "\u0643\u0644\u064A\u0629", en: "College" },
      university: { ar: "\u062C\u0627\u0645\u0639\u0629", en: "University" }
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true
  },
  /** Question report reason (reports moderation — legacy exact-case wire values). */
  reportReason: {
    labels: {
      scientific: { ar: "\u062E\u0637\u0623 \u0639\u0644\u0645\u064A", en: "Scientific" },
      typo: { ar: "\u062E\u0637\u0623 \u0625\u0645\u0644\u0627\u0626\u064A", en: "Typo" },
      missingoption: { ar: "\u062E\u064A\u0627\u0631 \u0646\u0627\u0642\u0635", en: "Missing option" },
      unclearexplanation: { ar: "\u0634\u0631\u062D \u063A\u064A\u0631 \u0648\u0627\u0636\u062D", en: "Unclear explanation" }
    },
    unknown: { ar: "\u0623\u062E\u0631\u0649", en: "Other" },
    normalizeLower: true
  },
  /** Access-code status (CodesCenter — lower-cases the wire value). */
  codeStatus: {
    labels: {
      active: { ar: "\u0646\u0634\u0637", en: "Active" },
      used: { ar: "\u0645\u0633\u062A\u062E\u062F\u0645", en: "Used" },
      revoked: { ar: "\u0645\u064F\u0628\u0637\u064E\u0644", en: "Revoked" },
      expired: { ar: "\u0645\u0646\u062A\u0647\u064A", en: "Expired" }
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true
  },
  /** Redemption status (CodesCenter — lower-cases; feminine register). */
  redemptionStatus: {
    labels: {
      active: { ar: "\u0646\u0634\u0637\u0629", en: "Active" },
      cancelled: { ar: "\u0645\u064F\u0628\u0637\u0644\u0629", en: "Revoked" },
      revoked: { ar: "\u0645\u064F\u0628\u0637\u0644\u0629", en: "Revoked" },
      expired: { ar: "\u0645\u0646\u062A\u0647\u064A\u0629", en: "Expired" }
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true
  },
  /** Library file type (LibraryCenter — exact-case wire values). */
  libraryType: {
    labels: {
      Pdf: { ar: "\u0645\u0644\u0641 PDF", en: "PDF" },
      Html: { ar: "\u0635\u0641\u062D\u0629 HTML", en: "HTML" },
      Image: { ar: "\u0635\u0648\u0631\u0629", en: "Image" },
      Video: { ar: "\u0641\u064A\u062F\u064A\u0648", en: "Video" },
      Audio: { ar: "\u0635\u0648\u062A", en: "Audio" },
      Summary: { ar: "\u0645\u0644\u062E\u0635", en: "Summary" },
      Comprehensive: { ar: "\u0634\u0627\u0645\u0644", en: "Comprehensive" },
      Paragraph: { ar: "\u0641\u0642\u0631\u0629", en: "Paragraph" }
    },
    unknown: passThrough,
    passThroughUnknown: true
  },
  /** Library virus-scan status (lower-cases the wire value). */
  libraryScan: {
    labels: {
      clean: { ar: "\u0646\u0638\u064A\u0641", en: "Clean" },
      pending: { ar: "\u0642\u064A\u062F \u0627\u0644\u0641\u062D\u0635", en: "Pending" },
      infected: { ar: "\u0645\u0635\u0627\u0628", en: "Infected" },
      error: { ar: "\u062E\u0637\u0623", en: "Error" }
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true
  },
  /** Library institutional category (exact-case wire values). */
  libraryCategory: {
    labels: {
      Curriculum: { ar: "\u0645\u0646\u0647\u0627\u062C", en: "Curriculum" },
      Lecture: { ar: "\u0645\u062D\u0627\u0636\u0631\u0629", en: "Lecture" },
      Summary: { ar: "\u062A\u0644\u062E\u064A\u0635", en: "Summary" },
      GoldenIdeas: { ar: "\u0623\u0641\u0643\u0627\u0631 \u0630\u0647\u0628\u064A\u0629", en: "Golden ideas" }
    },
    unknown: { ar: "\u063A\u064A\u0631 \u0645\u0635\u0646\u0651\u0641", en: "Uncategorized" }
  },
  /** HTML media protection state (exact-case wire values). */
  mediaProtection: {
    labels: {
      Pending: { ar: "\u062C\u0627\u0631\u064D \u0627\u0644\u062D\u0645\u0627\u064A\u0629", en: "Protecting" },
      Sanitized: { ar: "\u062A\u0645 \u0627\u0644\u062A\u0639\u0642\u064A\u0645", en: "Sanitized" },
      CSPApplied: { ar: "\u062A\u0645 \u0627\u0644\u062D\u0645\u0627\u064A\u0629", en: "CSP applied" },
      Ready: { ar: "\u062C\u0627\u0647\u0632", en: "Ready" },
      Failed: { ar: "\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Failed" }
    },
    unknown: passThrough,
    passThroughUnknown: true
  },
  /** Question type (W21.1 glossary — shared by Questions/Exams centers). */
  questionType: {
    labels: {
      Mcq: { ar: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F", en: "MCQ" },
      TrueFalse: { ar: "\u0635\u062D \u0623\u0648 \u062E\u0637\u0623", en: "True / False" },
      MultipleSelect: { ar: "\u0627\u062E\u062A\u064A\u0627\u0631\u0627\u062A \u0645\u062A\u0639\u062F\u062F\u0629", en: "Multiple select" },
      Essay: { ar: "\u062A\u062D\u0631\u064A\u0631\u064A", en: "Essay" },
      Matching: { ar: "\u0648\u0635\u0644", en: "Matching" }
    },
    unknown: { ar: "\u0646\u0648\u0639 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641", en: "Unknown type" }
  },
  /** Question difficulty. */
  questionDifficulty: {
    labels: {
      Easy: { ar: "\u0633\u0647\u0644", en: "Easy" },
      Medium: { ar: "\u0645\u062A\u0648\u0633\u0637", en: "Medium" },
      Hard: { ar: "\u0635\u0639\u0628", en: "Hard" }
    },
    unknown: unknownLabel
  },
  /** Episode / PDF processing status (chip labels). */
  mediaProcessing: {
    labels: {
      failed: { ar: "\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629", en: "Processing failed" },
      ready: { ar: "\u062C\u0627\u0647\u0632", en: "Ready" }
    },
    unknown: unknownLabel
  }
};
var statusRegistry = registrySource;
function statusLabel(locale, domain, value) {
  const entry = statusRegistry[domain];
  if (!entry) return value ?? "";
  const raw = value ?? "";
  const key = entry.normalizeLower ? raw.toLowerCase() : raw;
  const label = entry.labels[key];
  if (label) return label[locale];
  if (entry.passThroughUnknown) return raw;
  return entry.unknown[locale];
}

// apps/admin-web/src/lib/dictionary/index.ts
var dictionary = {
  ...coreDict,
  students: studentsDict,
  questions: questionsDict,
  exams: examsDict,
  courses: coursesDict,
  library: libraryDict,
  codes: codesDict,
  academic: academicDict,
  reports: reportsDict,
  audit: auditDict,
  admincenters: admincentersDict,
  notifications: notificationsDict
};
function localeOf(isArabic) {
  return isArabic ? "ar" : "en";
}

// apps/admin-web/src/lib/questionLabels.ts
function questionTypeLabel(type, isArabic) {
  return statusLabel(localeOf(isArabic), "questionType", type);
}
function questionDifficultyLabel(difficulty, isArabic) {
  return statusLabel(localeOf(isArabic), "questionDifficulty", difficulty);
}
