const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  status.textContent = "Starting…";

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
    if (response && response.count !== undefined) {
      status.textContent = `Queued ${response.count} transcript(s).`;
    } else {
      status.textContent = response && response.error ? response.error : "Done.";
    }
    startBtn.disabled = false;
  });
});
