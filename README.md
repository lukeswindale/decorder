# Decorder

A **Manifest V3 Chrome Extension** that downloads transcripts from [Google Recorder](https://recorder.google.com/) into a dedicated `google-recorder` subfolder of your Downloads directory.

## Features

- Only activates on `https://recorder.google.com/*`
- One-click popup UI with a **Start Download** button
- Iterates through all recordings visible on the page
- Extracts the meeting name and date/time from each recording
- Saves each transcript as a `.txt` file named `yyyy-MM-dd_HHmm_<Meeting Name>.txt`
- Files are placed automatically in `~/Downloads/google-recorder/`
- A 500 ms delay between downloads prevents the browser from blocking simultaneous saves

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root folder of this repository.
5. The *Decorder* extension icon will appear in the Chrome toolbar.

## Usage

1. Go to [https://recorder.google.com/](https://recorder.google.com/) and sign in.
2. Click the **Decorder** extension icon in the toolbar.
3. Click **Start Download** in the popup.
4. The extension will iterate through each recording, open its detail pane to read the transcript, and save a `.txt` file to `~/Downloads/google-recorder/`.

## File Naming

Each file is saved as:

```
~/Downloads/google-recorder/yyyy-MM-dd_HHmm_<Meeting Name>.txt
```

For example:

```
~/Downloads/google-recorder/2025-04-18_1430_Weekly Standup.txt
```

## Permissions

| Permission   | Reason |
|---|---|
| `downloads`  | Save transcript files to disk |
| `activeTab`  | Read the current recorder.google.com tab |
| `scripting`  | Inject the content script programmatically if needed |

## Project Structure

```
decorder/
├── manifest.json   # Extension manifest (MV3)
├── popup.html      # Popup UI
├── popup.js        # Popup logic
├── content.js      # Content script – scrapes recordings & transcripts
└── background.js   # Service worker – handles file downloads
```
