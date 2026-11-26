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
var questionLabels_exports = {};
__export(questionLabels_exports, {
  questionDifficultyLabel: () => questionDifficultyLabel,
  questionTypeLabel: () => questionTypeLabel
});
module.exports = __toCommonJS(questionLabels_exports);
var import_dictionary = require("./dictionary");
function questionTypeLabel(type, isArabic) {
  return (0, import_dictionary.statusLabel)((0, import_dictionary.localeOf)(isArabic), "questionType", type);
}
function questionDifficultyLabel(difficulty, isArabic) {
  return (0, import_dictionary.statusLabel)((0, import_dictionary.localeOf)(isArabic), "questionDifficulty", difficulty);
}
