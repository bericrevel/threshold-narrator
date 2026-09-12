# Threshold Narrator

Upload any book or document and hear it read from inside the page.

## Use

Open the site, drop a file, pick a voice, press Play.

Supported: PDF (text PDFs), Word `.docx`, Markdown, plain text, EPUB, HTML.

All parsing and speech happen in the browser. The file never leaves the device.

## Voice

Uses the device’s built-in speech engine (Web Speech API). On iPhone, Safari / Chrome voices vary; pick the deepest English male available and leave rate near `0.92`.

Threshold mode speaks a short door-line at the start of each chapter, then the author’s words.

## Local

Just open `index.html` over any static host, or:

```
npx serve .
```
