// lib/clientParse.js — parse the T-Mobile PDF in the browser, so only the small
// parsed result is sent to the server (sidesteps Vercel's 4.5MB upload limit).
import { parseBillLines } from "./parseLines.mjs";

const PDFJS_VER = "3.11.174";
let pdfjsPromise = null;

function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  const base = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;
  pdfjsPromise = (async () => {
    if (typeof window !== "undefined" && window.pdfjsLib) return window.pdfjsLib;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${base}/pdf.min.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the PDF reader (check your connection)."));
      document.head.appendChild(s);
    });
    const lib = window.pdfjsLib;
    // Prefer a same-origin blob worker (avoids cross-origin worker issues); fall back to the CDN worker.
    try {
      const code = await (await fetch(`${base}/pdf.worker.min.js`)).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    } catch (e) {
      lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
    }
    return lib;
  })();
  return pdfjsPromise;
}

async function extractLines(arrayBuffer) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], str: item.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      lines.push(rows.get(y).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return lines;
}

export async function parsePdfInBrowser(file) {
  const buf = await file.arrayBuffer();
  const lines = await extractLines(buf);
  return parseBillLines(lines);
}
