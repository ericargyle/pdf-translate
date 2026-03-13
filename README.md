# PDF Translate

Web tool that uploads a PDF, translates its text to English, and embeds the translated text as a translucent overlay on each page.

## Features

- **Drop-in translation**: Upload any PDF file and let the server extract the text and detect its language before translating it through a reliable API.
- **Overlayed English copy**: Each page receives an English translation rendered near the bottom in a subtle white panel so you can read the translation without losing the original layout.
- **Single download**: Return a brand-new PDF that keeps the source imagery but carries the English text overlay for easy sharing.

## Dev setup

```bash
npm install
npm start
```

Then open `http://localhost:4173` and upload a PDF.

The server exposes `POST /api/translate` for automated clients. It expects a `multipart/form-data` body with a `pdf` file field and responds with JSON containing a `pdf` base64 blob plus `language` metadata.
