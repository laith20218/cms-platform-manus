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

// apps/admin-web/src/lib/dictionary/questions.ts
var questions_exports = {};
__export(questions_exports, {
  questionsDict: () => questionsDict
});
module.exports = __toCommonJS(questions_exports);
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
