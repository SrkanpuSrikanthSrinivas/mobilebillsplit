// lib/config.js — who is on each line, how lines group into families.
// Phone keys are the 10-digit number (no punctuation) printed on the T-Mobile bill.
// Edit names / grouping here; the split logic reads from this file.

export const PEOPLE = {
  "2144043110": { name: "Asha Manjunath" },
  "2144043485": { name: "Ananya Anand" },
  "2147279064": { name: "Anand Tumkur" },
  "2482383526": { name: "Kavya Sudarshana" },
  "5035775110": { name: "Pushpa Srikanth" },
  "5039984416": { name: "Srikanth Srinivasa" },
  "9452379141": { name: "Preetham Srikanth" },
  "9452663573": { name: "Manjunath Muniyapla" },
};

export const FAMILIES = [
  { id: "fA", name: "Anand's family", holder: true, lines: ["2147279064", "2482383526", "2144043485"] },
  { id: "fB", name: "Asha & Manjunath", lines: ["2144043110", "9452663573"] },
  { id: "fC", name: "Pushpa, Srikanth & Preetham", lines: ["5035775110", "5039984416", "9452379141"] },
];

// Account holder: pays T-Mobile directly, collects from the other families,
// and is the person Netflix is charged to.
export const HOLDER = "2147279064";
export const PAYER = "Anand Tumkur";

// Netflix is treated as the holder's own cost: a FIXED charge added to the holder
// every month, regardless of the bill's "On Us" discount. This sits on top of the
// T-Mobile bill (the bill still reconciles on its own). Set amount to 0 to disable.
export const NETFLIX = { amount: 8.99, to: HOLDER };

// One-time usage charges (e.g. International Calling), which the bill puts on the line
// that incurred them. splitAcrossAll: true  -> pooled and split equally across all lines;
//                       splitAcrossAll: false -> charged to the line that incurred them.
export const ONE_TIME = { splitAcrossAll: false };
