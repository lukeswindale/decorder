"use strict";

const DOWNLOAD_FOLDER = "decorder";
const UI_REENABLE_DELAY_MS = 5000;

console.log("[decorder] background service worker loaded");

const pendingDownloads = new Map();
let uiDisabled = false;
let reenableTimer = null;

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function setDownloadUi(enabled) {
  if (!chrome.downloads.setUiOptions) return;
  try {
    await chrome.downloads.setUiOptions({ enabled });
    uiDisabled = !enabled;
  } catch (err) {
    console.warn("[decorder] setUiOptions failed:", err);
  }
}

function scheduleReenable() {
  if (reenableTimer) clearTimeout(reenableTimer);
  reenableTimer = setTimeout(() => {
    reenableTimer = null;
    if (uiDisabled) setDownloadUi(true);
  }, UI_REENABLE_DELAY_MS);
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const desired = pendingDownloads.get(item.url);
  if (!desired) {
    suggest();
    return;
  }
  pendingDownloads.delete(item.url);
  suggest({ filename: desired, conflictAction: "uniquify" });
});

async function downloadTranscript(filename, text) {
  if (reenableTimer) {
    clearTimeout(reenableTimer);
    reenableTimer = null;
  }
  if (!uiDisabled) await setDownloadUi(false);

  const url = `data:application/octet-stream;base64,${toBase64Utf8(text || "")}`;
  const path = `${DOWNLOAD_FOLDER}/${filename}`;
  pendingDownloads.set(url, path);
  try {
    const id = await chrome.downloads.download({
      url,
      filename: path,
      conflictAction: "uniquify",
      saveAs: false,
    });
    return id;
  } catch (err) {
    pendingDownloads.delete(url);
    throw err;
  } finally {
    scheduleReenable();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "downloadTranscript") return false;
  downloadTranscript(message.filename, message.text)
    .then((id) => sendResponse({ ok: true, id }))
    .catch((err) => {
      console.error("[decorder] download failed:", err);
      sendResponse({ ok: false, error: err.message });
    });
  return true;
});
