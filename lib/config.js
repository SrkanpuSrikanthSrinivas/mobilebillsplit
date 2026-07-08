// lib/config.js
// Who is on each line, and how lines group into families.
// Edit this file to change names, add/remove lines, or re-group families.
// Line keys are the full 10-digit number (no dots) that appears on the bill.

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
  {
    id: "fA",
    name: "Anand's family",
    holder: true, // pays AT&T directly (autopay); collects from the others
    lines: ["2147279064", "2482383526", "2144043485"],
  },
  {
    id: "fB",
    name: "Asha & Manjunath",
    lines: ["2144043110", "9452663573"],
  },
  {
    id: "fC",
    name: "Pushpa, Srikanth & Preetham",
    lines: ["5035775110", "5039984416", "9452379141"],
  },
];

// Name shown as the Zelle recipient (the account holder collects).
export const PAYER = "Anand Tumkur";
