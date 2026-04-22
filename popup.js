const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  status.textContent = "Fetching recordings…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.startsWith("https://recorder.google.com/")) {
    status.textContent = "Please open recorder.google.com first.";
    startBtn.disabled = false;
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "startDownload" }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = "Error: " + chrome.runtime.lastError.message;
      startBtn.disabled = false;
      return;
    }
    if (!response) {
      status.textContent = "Done.";
    } else if (response.error) {
      status.textContent = "Error: " + response.error;
    } else {
      const { found = 0, downloaded = 0, failed = 0 } = response;
      status.textContent =
        `Found ${found}, downloaded ${downloaded}` +
        (failed ? `, ${failed} failed (see console)` : "") +
        ".";
    }
    startBtn.disabled = false;
  });
});
