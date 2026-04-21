/**
 * background.js – Manifest V3 service worker for Decorder.
 *
 * Listens for "downloadTranscripts" messages from content.js and saves each
 * transcript as a .txt file inside the ~/Downloads/google-recorder/ directory,
 * with a 500 ms gap between each download to avoid browser throttling.
 */

"use strict";

const DOWNLOAD_FOLDER = "google-recorder";
const DOWNLOAD_DELAY_MS = 500;

/**
 * Pause execution for `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trigger a single file download via the chrome.downloads API.
 *
 * @param {string} filename  - Safe filename (no path separators).
 * @param {string} text      - Plain-text content to save.
 */
async function downloadTranscript(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename: `${DOWNLOAD_FOLDER}/${filename}`,
      conflictAction: "uniquify",
      saveAs: false,
    });
  } finally {
    // Revoke the object URL after a short grace period so the browser has
    // time to start the download before the URL disappears.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "downloadTranscripts") return false;

  const transcripts = message.transcripts || [];

  (async () => {
    for (let i = 0; i < transcripts.length; i++) {
      const { filename, transcript } = transcripts[i];
      await downloadTranscript(filename, transcript || "");
      if (i < transcripts.length - 1) {
        await sleep(DOWNLOAD_DELAY_MS);
      }
    }
    sendResponse({ downloaded: transcripts.length });
  })();

  return true; // keep channel open for the async sendResponse
});
