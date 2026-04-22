"use strict";

const API_BASE = "https://pixelrecorder-pa.clients6.google.com";
const LIST_PATH =
  "/$rpc/java.com.google.wireless.android.pixel.recorder.protos.PlaybackService/GetRecordingList";
const TRANSCRIPTION_PATH =
  "/$rpc/java.com.google.wireless.android.pixel.recorder.protos.PlaybackService/GetTranscription";
const API_KEY = "AIzaSyCqafaaFzCP07GzWUSRw0oXErxSlrEX2Ro";
const PAGE_ORIGIN = "https://recorder.google.com";
const PAGE_SIZE = 25;
const MAX_PAGES = 40;
const TRANSCRIPTION_DELAY_MS = 150;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getCookie(name) {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

async function sha1Hex(str) {
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildAuthHeader() {
  const ts = Math.floor(Date.now() / 1000);
  const sources = [
    ["SAPISIDHASH", getCookie("SAPISID")],
    ["SAPISID1PHASH", getCookie("__Secure-1PAPISID")],
    ["SAPISID3PHASH", getCookie("__Secure-3PAPISID")],
  ];
  const parts = [];
  for (const [label, value] of sources) {
    if (!value) continue;
    const hash = await sha1Hex(`${ts} ${value} ${PAGE_ORIGIN}`);
    parts.push(`${label} ${ts}_${hash}`);
  }
  if (parts.length === 0) {
    throw new Error(
      "No SAPISID cookies found — are you signed in to Google in this browser profile?"
    );
  }
  return parts.join(" ");
}

async function callRpc(path, payload) {
  const auth = await buildAuthHeader();
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "*/*",
      authorization: auth,
      "content-type": "application/json+protobuf",
      "x-goog-api-key": API_KEY,
      "x-goog-authuser": "0",
      "x-user-agent": "grpc-web-javascript/0.1",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `RPC ${path.split("/").pop()} failed: ${resp.status} ${body.slice(0, 200)}`
    );
  }
  return resp.json();
}

function parseRecording(r) {
  if (!Array.isArray(r)) return null;
  return {
    recordingId: r[0] || null,
    title: (typeof r[1] === "string" && r[1].trim()) || null,
    createdAt: Array.isArray(r[2]) ? r[2] : null,
    transcriptId: typeof r[13] === "string" && UUID_RE.test(r[13]) ? r[13] : null,
    raw: r,
  };
}

function parseListResponse(raw) {
  const items = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
  const hasMore = Boolean(Array.isArray(raw) && raw[1]);
  return {
    items: items.map(parseRecording).filter((r) => r && r.transcriptId),
    hasMore,
  };
}

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function msToVttTime(ms) {
  const v = Math.max(0, Math.round(ms));
  const h = Math.floor(v / 3_600_000);
  const m = Math.floor((v % 3_600_000) / 60_000);
  const s = Math.floor((v % 60_000) / 1000);
  const milli = v % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
}

function buildCueText(words) {
  let text = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let token = (typeof w[1] === "string" && w[1]) || (typeof w[0] === "string" && w[0]) || "";
    if (!token) continue;
    const newline = token.startsWith("\n");
    if (newline) token = token.slice(1);
    if (!token) continue;
    if (text === "") {
      text = token;
    } else {
      text += (newline ? "\n" : " ") + token;
    }
  }
  return text.trim();
}

function transcriptionToVtt(raw) {
  const segments = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
  const out = ["WEBVTT", ""];
  let cueCount = 0;
  for (const seg of segments) {
    const words = Array.isArray(seg) && Array.isArray(seg[0]) ? seg[0] : [];
    if (words.length === 0) continue;
    const startMs = Number(words[0][2]);
    const endMs = Number(words[words.length - 1][3]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const text = buildCueText(words);
    if (!text) continue;
    out.push(`${msToVttTime(startMs)} --> ${msToVttTime(Math.max(endMs, startMs))}`);
    out.push(text);
    out.push("");
    cueCount++;
  }
  return { vtt: out.join("\n"), cueCount };
}

function formatTimestamp(ts) {
  const sec = ts ? Number(ts[0]) : NaN;
  const d = Number.isFinite(sec) ? new Date(sec * 1000) : new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function sanitiseFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

function makeFilename(rec) {
  const stamp = formatTimestamp(rec.createdAt);
  const fallbackId = (rec.recordingId || rec.transcriptId || "").slice(0, 8);
  const base = sanitiseFilename(rec.title || `Recording_${fallbackId}`);
  return `${stamp}_${base}.vtt`;
}

async function fetchAllRecordings() {
  const all = [];
  const seen = new Set();
  let cursor = [Math.floor(Date.now() / 1000) + 60, 0];
  for (let page = 0; page < MAX_PAGES; page++) {
    const raw = await callRpc(LIST_PATH, [cursor, PAGE_SIZE]);
    if (page === 0) {
      console.log("[decorder] first list response:", raw);
    }
    const { items, hasMore } = parseListResponse(raw);
    if (items.length === 0) break;

    let added = 0;
    for (const item of items) {
      if (seen.has(item.transcriptId)) continue;
      seen.add(item.transcriptId);
      all.push(item);
      added++;
    }

    if (!hasMore) break;
    if (added === 0) break;

    const oldest = items[items.length - 1];
    if (!oldest.createdAt) break;
    const nextSec = Number(oldest.createdAt[0]);
    const nextNs = Number(oldest.createdAt[1]) || 0;
    if (!Number.isFinite(nextSec)) break;
    if (nextSec === cursor[0] && nextNs === cursor[1]) break;
    cursor = [nextSec, nextNs];
  }
  return all;
}

async function fetchTranscription(transcriptId) {
  const raw = await callRpc(TRANSCRIPTION_PATH, [transcriptId]);
  const { vtt, cueCount } = transcriptionToVtt(raw);
  return { raw, vtt, cueCount };
}

async function run() {
  const recordings = await fetchAllRecordings();
  console.log(`[decorder] found ${recordings.length} recording(s)`);

  let downloaded = 0;
  let failed = 0;
  let loggedFirstTranscription = false;

  for (const rec of recordings) {
    try {
      const { raw, vtt, cueCount } = await fetchTranscription(rec.transcriptId);
      if (!loggedFirstTranscription) {
        console.log("[decorder] first transcription response:", raw);
        loggedFirstTranscription = true;
      }
      const filename = makeFilename(rec);
      const body =
        cueCount > 0
          ? vtt
          : `WEBVTT\nNOTE No transcript cues extracted. Raw response logged to the devtools console. Transcript id: ${rec.transcriptId}\n`;
      console.log("[decorder] sending to background:", filename);
      chrome.runtime.sendMessage(
        { action: "downloadTranscript", filename, text: body },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[decorder] sendMessage error for",
              filename,
              chrome.runtime.lastError.message
            );
          } else {
            console.log("[decorder] bg response for", filename, response);
          }
        }
      );
      downloaded++;
    } catch (err) {
      console.error(
        "[decorder] transcription failed for",
        rec.transcriptId,
        err
      );
      failed++;
    }
    await sleep(TRANSCRIPTION_DELAY_MS);
  }

  return { found: recordings.length, downloaded, failed };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "startDownload") return false;
  run()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ error: err.message || String(err) }));
  return true;
});
