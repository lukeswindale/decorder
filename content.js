/**
 * content.js – scrapes all visible recordings on recorder.google.com and
 * sends each one's metadata + transcript text to the background service worker
 * for downloading.
 *
 * Google Recorder DOM notes (observed as of 2024):
 *  - Recording list items: <recording-row> custom elements (or divs with
 *    data-item-id attributes inside <material-list>).
 *  - Title: .recording-title  (or the first <h3> inside the row).
 *  - Date/time: .recording-metadata  (or <span class="recording-date">).
 *  - To open a recording the user clicks a row; the detail pane then shows:
 *      <div class="transcript-content"> containing <div class="segment"> blocks,
 *      each with a <p> or <span> holding the spoken words.
 *
 * Because the exact selectors can drift with DOM updates we use a prioritised
 * list of candidates so the extension degrades gracefully rather than breaking
 * entirely.
 */

"use strict";

/** Pause execution for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try each selector in `candidates` and return the first element found,
 * or null if none match.
 */
function queryFirst(root, ...candidates) {
  for (const sel of candidates) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Collect all text nodes inside `root` that match any of the `candidates`
 * selectors and join them with newlines.
 */
function collectText(root, ...candidates) {
  for (const sel of candidates) {
    const els = root.querySelectorAll(sel);
    if (els.length > 0) {
      return Array.from(els)
        .map((el) => el.textContent.trim())
        .filter(Boolean)
        .join("\n");
    }
  }
  return root.textContent.trim();
}

/**
 * Parse a date string from Google Recorder into a Date object.
 * Accepts common formats like "Apr 18, 2025, 2:34 PM" or ISO strings.
 */
function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as "yyyy-MM-dd_HHmm".
 */
function formatTimestamp(date) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}_${HH}${mm}`;
}

/**
 * Sanitise a string so it is safe to use in a filename.
 */
function sanitiseFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/**
 * Attempt to extract transcript text from the currently-visible detail pane.
 */
function extractTranscriptFromPane() {
  return collectText(
    document,
    // Observed class names (Google may change these):
    ".transcript-content .segment",
    ".transcript-content .transcript-segment",
    ".transcript-content p",
    ".transcript-region .segment",
    ".transcript-region p",
    // Broader fallback:
    ".transcript-content",
    ".transcript-region"
  );
}

/**
 * Main handler: scrape all recordings and dispatch download messages.
 */
async function scrapeAndDownload() {
  // ── 1. Find recording list rows ─────────────────────────────────────────
  const rowSelectors = [
    "recording-row",
    ".recording-row",
    "material-list .list-item",
    "[data-recording-id]",
    ".recording-list-item",
  ];

  let rows = [];
  for (const sel of rowSelectors) {
    rows = Array.from(document.querySelectorAll(sel));
    if (rows.length > 0) break;
  }

  if (rows.length === 0) {
    return { error: "No recordings found on this page." };
  }

  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // ── 2. Click the row to open detail / transcript pane ────────────────
    row.click();
    await sleep(1200); // allow the detail pane / transcript to load

    // ── 3. Extract metadata from the row itself (more reliable than pane) ─
    const titleEl = queryFirst(
      row,
      ".recording-title",
      "h3",
      ".title",
      "[class*='title']"
    );
    const title = titleEl
      ? titleEl.textContent.trim()
      : `Recording ${i + 1}`;

    const dateEl = queryFirst(
      row,
      ".recording-date",
      ".recording-metadata",
      "time",
      "[class*='date']",
      "[class*='time']"
    );
    const rawDate = dateEl
      ? dateEl.getAttribute("datetime") || dateEl.textContent.trim()
      : null;

    const date = parseDate(rawDate) || new Date();
    const timestamp = formatTimestamp(date);
    const safeName = sanitiseFilename(title);
    const filename = `${timestamp}_${safeName}.txt`;

    // ── 4. Extract transcript text ────────────────────────────────────────
    const transcript = extractTranscriptFromPane();

    results.push({ filename, transcript });
  }

  // ── 5. Send all results to the background worker ─────────────────────────
  chrome.runtime.sendMessage({
    action: "downloadTranscripts",
    transcripts: results,
  });

  return { count: results.length };
}

// ── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "startDownload") {
    scrapeAndDownload()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }
});
