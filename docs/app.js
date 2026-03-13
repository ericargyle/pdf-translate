const pdfInput = document.getElementById("pdfInput");
const translateBtn = document.getElementById("translateBtn");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const resultEl = document.getElementById("result");
const languageInfo = document.getElementById("languageInfo");
const downloadLink = document.getElementById("downloadLink");

const TRANSLATE_URL = "https://libretranslate.de/translate";
const DETECT_URL = "https://libretranslate.de/detect";

let currentObjectUrl = null;

const showStatus = (message, tone = "info") => {
  statusEl.textContent = message;
  statusEl.style.color = tone === "error" ? "#ff8888" : "#cdd4ec";
};

const setProgress = (message) => {
  progressEl.textContent = message;
};

const clearResult = () => {
  resultEl.classList.add("hidden");
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
};

const chunkText = (text, maxLen = 1200) => {
  if (!text) {
    return [];
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const sentences = normalized.split(/(?<=[.?!\n])+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > maxLen) {
      chunks.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer) {
    chunks.push(buffer.trim());
  }
  if (!chunks.length) {
    chunks.push(normalized.slice(0, maxLen));
  }
  return chunks;
};

const requestTranslation = async (chunk) => {
  const response = await fetch(TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: chunk, source: "auto", target: "en", format: "text" }),
  });
  if (!response.ok) {
    throw new Error("Translation provider rejected the request.");
  }
  const data = await response.json();
  return data.translatedText || "";
};

const detectLanguage = async (text) => {
  if (!text) {
    return null;
  }
  try {
    const response = await fetch(DETECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text.slice(0, 500) }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length) {
      return data[0].language;
    }
    return null;
  } catch (error) {
    return null;
  }
};

const translateText = async (text, pageIndex) => {
  const chunks = chunkText(text);
  let translated = "";
  for (let i = 0; i < chunks.length; i += 1) {
    setProgress(`Translating chunk ${i + 1}/${chunks.length} of page ${pageIndex}`);
    const piece = await requestTranslation(chunks[i]);
    translated = translated ? `${translated} ${piece}` : piece;
  }
  return translated.trim();
};

const extractPageText = async (page) => {
  const token = await page.getTextContent();
  const strings = token.items.map((item) => item.str || "");
  return strings.join(" ");
};

const wrapText = (text, font, size, maxWidth) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (line && width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
};

const renderOverlay = async (sourceBytes, translations) => {
  const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fontSize = 10;
  const lineHeight = 14;
  const margin = 32;

  pdfDoc.getPages().forEach((page, index) => {
    const translation = translations[index] || "";
    if (!translation) {
      return;
    }
    const { width, height } = page.getSize();
    const usableWidth = width - margin * 2;
    const lines = wrapText(translation, font, fontSize, usableWidth - 8);
    const maxLines = Math.max(1, Math.floor((height - margin * 2) / lineHeight));
    const visibleLines = lines.slice(0, maxLines);
    const overlayHeight = visibleLines.length * lineHeight + 16;
    const overlayY = height - margin - overlayHeight;

    page.drawRectangle({
      x: margin,
      y: overlayY,
      width: usableWidth,
      height: overlayHeight,
      color: PDFLib.rgb(1, 1, 1),
      opacity: 0.9,
    });

    let yCursor = overlayY + overlayHeight - lineHeight;
    for (const line of visibleLines) {
      page.drawText(line, {
        x: margin + 6,
        y: yCursor,
        size: fontSize,
        font,
        color: PDFLib.rgb(0.1, 0.1, 0.1),
      });
      yCursor -= lineHeight;
    }
  });

  return pdfDoc.save();
};

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.8.162/build/pdf.worker.min.js";

translateBtn.addEventListener("click", async () => {
  const file = pdfInput.files?.[0];
  if (!file) {
    showStatus("Pick a PDF file before translating.", "error");
    return;
  }

  clearResult();
  showStatus("Reading PDF...");
  progressEl.textContent = "";

  try {
    const fileBytes = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
    const doc = await loadingTask.promise;
    const translations = [];

    const aggregateTexts = [];
    for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
      setProgress(`Processing page ${pageIndex}/${doc.numPages}…`);
      const page = await doc.getPage(pageIndex);
      const text = await extractPageText(page);
      aggregateTexts.push(text);
      const translated = await translateText(text, pageIndex);
      translations.push(translated);
    }

    const fullText = aggregateTexts.join(" ");
    const detected = await detectLanguage(fullText);
    languageInfo.textContent = `Detected language: ${detected ? detected.toUpperCase() : "unknown"}`;

    showStatus("Rendering translated PDF...");
    setProgress("Overlaying translation onto the document...");
    const translatedBytes = await renderOverlay(fileBytes, translations);
    const blob = new Blob([translatedBytes], { type: "application/pdf" });
    currentObjectUrl = URL.createObjectURL(blob);
    downloadLink.href = currentObjectUrl;
    downloadLink.download = `translated-${file.name.replace(/\.[^.]+$/, "")}.pdf`;

    showStatus("Translation complete. Download the PDF below.");
    setProgress("");
    resultEl.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showStatus(error.message || "Something went wrong during translation.", "error");
    setProgress("");
  }
});
