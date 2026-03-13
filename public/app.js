const pdfInput = document.getElementById("pdfInput");
const translateBtn = document.getElementById("translateBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const languageInfo = document.getElementById("languageInfo");
const downloadLink = document.getElementById("downloadLink");

const showStatus = (message, tone = "info") => {
  statusEl.textContent = message;
  statusEl.style.color = tone === "error" ? "#ff8888" : "#cdd4ec";
};

const decodeBase64ToBlob = (base64, mimeType = "application/pdf") => {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
};

translateBtn.addEventListener("click", async () => {
  const file = pdfInput.files?.[0];
  if (!file) {
    showStatus("Pick a PDF before translating.", "error");
    return;
  }

  showStatus("Uploading and translating — this can take a minute.");
  resultEl.classList.add("hidden");

  const formData = new FormData();
  formData.append("pdf", file);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Translation service failed.");
    }

    const payload = await response.json();
    const blob = decodeBase64ToBlob(payload.pdf);
    const objectUrl = URL.createObjectURL(blob);

    downloadLink.href = objectUrl;
    downloadLink.download = payload.filename || "translated.pdf";
    languageInfo.textContent = `Detected language: ${payload.language.toUpperCase()}`;
    resultEl.classList.remove("hidden");
    showStatus("Translation complete — download your PDF below.");
  } catch (error) {
    showStatus(error.message || "Something went wrong.", "error");
  }
});
