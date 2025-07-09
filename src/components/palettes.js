/*****************************************************************
 *  Project colour utilities
 *
 *  Exports
 *    • peptidePalette      – 10-colour brand palette (categorical)
 *    • makePeptideScale()  – repeat-safe ordinal scale factory
 *    • aminoacidPalette    – fixed AA → colour lookup for charts
 *    • colourAA()          – helper that falls back to grey
 *****************************************************************/
import * as d3 from "npm:d3";

/* ---------- peptide viewer palette ---------------------------- */
export const peptidePalette = [
  "#4269D0", "#6CC5B0", "#A463F2", "#EFB118", "#3CA951",
  "#97BBF5", "#9498A0", "#FF725C", "#FF8AB7", "#9C6B4E"
];

/** Given a list of category keys, return an ordinal scale that
 *  cycles deterministically through `peptidePalette`. */
export function makePeptideScale(keys) {
  const colours = keys.map((_, i) =>
    peptidePalette[i % peptidePalette.length]
  );
  return d3.scaleOrdinal(keys, colours);
}

/* ---------- amino-acid palette -------------------------------- */
export const aminoacidPalette = Object.freeze({
  P:"#89d1c0", G:"#7bcbb8", A:"#6cc5b0", L:"#61b19e", V:"#569e8d",
  I:"#4c8a7b", Y:"#63ba74", W:"#3ca951", F:"#308741",
  D:"#ff8e7d", E:"#ff725c",
  H:"#6887d9", K:"#4269d0", R:"#3554a6",
  S:"#ffa1c5", T:"#ff8ab7",
  M:"#ffe666", C:"#ffd500",
  N:"#b682f5", Q:"#a463f2",
  X:"#757171", "-":"#d9d9d9"
});

/** Convenience accessor */
export function colourAA(aa) {
  return aminoacidPalette[aa] || "#bbbbbb";
}
