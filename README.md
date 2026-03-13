# PDF Translate

Static web tool for translating PDFs into English and overlaying the translated text directly in your browser.

## Features

- Upload a PDF and let PDF.js pull out the text per page inside your browser—nothing gets sent to a private server until translation.
- LibreTranslate handles translating each chunk into English with auto-detect, and pdf-lib draws the translated copy in a translucent callout near the top of every page.
- Download the newly rendered PDF instantly without leaving the web page.

## Live site

The app is hosted at: https://ericargyle.github.io/pdf-translate/

## Development

Because the app is purely static you can also run it locally:

```bash
npx http-server public
```

Then visit `http://localhost:8080`.
