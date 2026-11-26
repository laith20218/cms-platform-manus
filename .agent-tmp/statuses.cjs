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
var statuses_exports = {};
__export(statuses_exports, {
  statusLabel: () => statusLabel,
  statusRegistry: () => statusRegistry
});
module.exports = __toCommonJS(statuses_exports);
const unknownLabel = { ar: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", en: "Unspecified" };
const passThrough = { ar: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629", en: "Unknown" };
const publication = {
  labels: {
    draft: { ar: "\u0645\u0633\u0648\u062F\u0629", en: "Draft" },
    published: { ar: "\u0645\u0646\u0634\u0648\u0631", en: "Published" },
    unpublished: { ar: "\u063A\u064A\u0631 \u0645\u0646\u0634\u0648\u0631", en: "Unpublished" },
    archived: { ar: "\u0645\u0624\u0631\u0634\u0641", en: "Archived" }
  },
  unknown: unknownLabel,
  normalizeLower: true
};
const registrySource = {
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
const statusRegistry = registrySource;
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
