const express = require("express");
const multer = require("multer");
const path = require("path");
const pdfParse = require("pdf-parse");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const translate = require("@vitalets/google-translate-api");
const cors = require("cors");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const chunkText = (text, maxLen = 1800) => {
  if (!text) {
    return [];
  }
  const chunks = [];
  const sentences = text
    .split(/(?<=[.!?\n])+/)
    .map((item) => item.trim())
    .filter(Boolean);
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > maxLen) {
      chunks.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer = `${buffer} ${sentence}`.trim();
    }
  }
  if (buffer) {
    chunks.push(buffer.trim());
  }
  if (!chunks.length) {
    chunks.push(text.slice(0, maxLen));
  }
  return chunks;
};

const translatePage = async (text) => {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return { text: "", language: null };
  }
  const chunks = chunkText(clean);
  let translated = "";
  let detected = null;
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const response = await translate(chunk, { to: "en" });
    translated = translated ? `${translated} ${response.text}` : response.text;
    if (!detected && response.from?.language?.iso) {
      detected = response.from.language.iso;
    }
  }
  return { text: translated.trim(), language: detected };
};

const wrapText = (text, font, size, maxWidth) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const testLine = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, size);
    if (current && width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = testLine;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
};

app.post("/api/translate", upload.single("pdf"), async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: "Please include a PDF in the request." });
  }

  try {
    const pdfData = await pdfParse(req.file.buffer);
    const pages = pdfData.text.split("\f");

    const pageTranslations = [];
    let detectedLanguage = null;
    for (const pageText of pages) {
      // eslint-disable-next-line no-await-in-loop
      const { text: translated, language } = await translatePage(pageText);
      if (!detectedLanguage && language) {
        detectedLanguage = language;
      }
      pageTranslations.push(translated);
    }

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const lineHeight = 12;
    const fontSize = 10;
    const margin = 32;

    pdfDoc.getPages().forEach((page, index) => {
      const translation = pageTranslations[index] || "";
      if (!translation) {
        return;
      }

      const { width, height } = page.getSize();
      const usableWidth = width - margin * 2;
      const lines = wrapText(translation, font, fontSize, usableWidth - 8);
      const maxLines = Math.max(1, Math.floor((height - margin * 2) / lineHeight));
      const limitedLines = lines.slice(-maxLines);
      const overlayHeight = limitedLines.length * lineHeight + margin * 0.4;
      const overlayY = margin * 0.5;

      page.drawRectangle({
        x: margin,
        y: overlayY,
        width: usableWidth,
        height: overlayHeight,
        color: rgb(1, 1, 1),
        opacity: 0.85,
      });

      let yPosition = overlayY + overlayHeight - lineHeight;
      for (const line of limitedLines) {
        page.drawText(line, {
          x: margin + 4,
          y: yPosition,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        yPosition -= lineHeight;
      }
    });

    const translatedBytes = await pdfDoc.save();
    const encoded = Buffer.from(translatedBytes).toString("base64");
    const filename = `translated-${Date.now()}.pdf`;

    return res.json({
      language: detectedLanguage || "unknown",
      filename,
      pdf: encoded,
    });
  } catch (error) {
    console.error("Translation failed", error);
    return res.status(500).json({ error: "Unable to process that PDF right now." });
  }
});

const port = process.env.PORT || 4173;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`PDF translate server listening on http://localhost:${port}`);
});
