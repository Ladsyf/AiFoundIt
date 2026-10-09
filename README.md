# AiFoundIt

A private search assistant for your phone. Ask in English or Taglish — "Nasaan yung resibo ko sa Jollibee?" — and it finds the photo, receipt, document or video you mean. Everything runs on the device: no uploads, no account, and it works in airplane mode once the models are on the phone.

Entry for **AppBuildersPH Hackathon 2026** (theme: Local AI). Android only.

## Features

- **Chat search** over the phone: photos, screenshots, PDFs, Word/Excel/PowerPoint (`.docx` `.xlsx` `.pptx`), OpenDocument, EPUB, text files and video, in plain English or Taglish. Video is matched by sampled frames. Audio recordings are found by name, date and length; their sound is not analysed. Old `.doc`, `.xls` and `.ppt` files are found by name only.
- **Hybrid retrieval.** FTS5 keyword search (BM25) merged with sqlite-vec nearest-neighbour search through Reciprocal Rank Fusion, with name, category and recency boosts.
- **Grounded answers.** Result cards come straight from database rows. The chat model only writes a short summary that cites them, so it cannot invent a file. With no chat model you get a fixed-sentence answer and search still works.
- **Receipt math in code.** "Magkano nagastos ko sa GCash this week?" adds up the `₱` totals found by rules. The model never does the arithmetic.
- **Organize with undo.** "Ilagay mo lahat ng resibo sa isang folder" shows a plan you can untick and confirm, moves the files, and undoes the whole batch on request. Nothing moves without confirmation, and the card says what really happened.
- **Privacy guard.** Files that look like IDs, OTPs or passwords are flagged, kept out of general results unless you ask for them, and can be moved to a private folder.
- **Download the AI models in the app.** A list of Gemma and other models with sizes and a fit hint for your phone. Download, pause, resume, cancel, switch and delete from Settings or the first-run screen. Downloads continue after a dropped connection, can be limited to Wi-Fi, and import from a file is there as a backup.
- **You choose what is scanned.** Skip a folder by picking it, typing its path, or tapping a quick pick such as **Android**. Scan the whole phone, or only the folders you list. Skipped folders are never opened, and their files disappear from results.
- **Keeps itself current.** An optional background job (WorkManager) looks for new photos, recordings and documents while the phone charges. Android decides when it actually runs.
- **Proof line.** Each answer ends with "Found in X s · on-device · N bytes sent". N is what this app sent over the network since it opened, not counting model downloads (those are shown separately in Settings → Privacy).

## How it works

```
MediaStore + file walk ──▶ extract (ML Kit OCR/labels, PdfBox, XML) ──▶ embed (EmbeddingGemma 2, GPU)
        │                                                                          │
        └──────────────▶ inbox.db (native, Kotlin) ──▶ JS merge ──▶ aifoundit.db ◀───┘
                                   chunks + FTS5 + vec0 + labels + facts
                                              │
                          query ─▶ plan ─▶ FTS5 + KNN ─▶ RRF ─▶ cards ─▶ Gemma answer
```

- `modules/aifoundit-native` (Kotlin) does the heavy work and writes an **inbox** database. JavaScript drains it into the main database in batches (one bad file is skipped, not fatal) and applies the enrichment rules: category, `₱` totals, merchants, sensitive flags.
- The same code runs in a WorkManager worker for background indexing.
- Without the native module the app falls back to a JavaScript mock (`isMockNative`) with sample files. It says so on screen; use it only for development.

## Build & run

Requires Node, JDK 17 (Android Studio's JBR works), the Android SDK, and a physical Android phone: the app reads real storage.

```bash
npm install
npx expo run:android --device      # development build (needs Metro running)
# or a standalone release build for the demo:
npx expo run:android --variant release --device
```

Then open the app. The first-run screen asks for photo and file access, then shows **Choose the AI models**. Tap **Download recommended** (about 3.1 GB: EmbeddingGemma 2 plus Gemma 4 E2B; use Wi-Fi) or pick models from the list. The scan starts after you tap Continue; if the search model is still downloading, the button waits for it so your files are not indexed twice.

Already have the files? Use **Import from file** in the app, or copy them over USB with the exact file names below:

```bash
adb shell mkdir -p /sdcard/Android/data/com.aifoundit.app/files/models
adb push embeddinggemma-2-740m.litertlm /sdcard/Android/data/com.aifoundit.app/files/models/
adb push gemma-4-E2B-it.litertlm /sdcard/Android/data/com.aifoundit.app/files/models/
```

Without models, search still works through FTS5 keyword matching and fixed-sentence answers.

Checks: `npm run typecheck` · `npm run lint` · `npm test`. The Kotlin unit tests run after the Android project exists (`npx expo prebuild --platform android`): `cd android && ./gradlew :aifoundit-native:testDebugUnitTest`.

## Models

The in-app list comes from Google's AI Edge Gallery model list. Files are downloaded from Hugging Face (`litert-community`) at a pinned revision, falling back to the main branch if that revision is gone.

| Model | Job | Size | Notes |
|---|---|---|---|
| EmbeddingGemma 2 | Search by meaning (text and pictures) | 485 MB | Recommended |
| Gemma 4 E2B | Answers, describes photos | 2.59 GB | Recommended for 8 GB phones and up |
| Gemma 4 E4B | Answers, describes photos | 3.66 GB | Wants 12 GB of memory |
| Gemma 3 1B | Answers (text only) | 584 MB | Small-phone choice; may ask for a Hugging Face login |
| Qwen2.5 1.5B | Answers (text only) | 1.60 GB | Non-Google option |

Each model has its own license (see its Hugging Face page); the Gemma models are under Google's Gemma terms. If a download is refused because a license has not been accepted, the app says so and offers the model page: accept the license there, create a free access token and paste it in Settings. The token is stored on the phone and sent to huggingface.co only. If you install a model file that is not in this list it is still offered as a search or chat model, based on its name.

## What needs internet

Only the model downloads you start, from huggingface.co. Scanning, OCR, embeddings, search, answers and file operations all run on the phone, so with the models installed the app works in airplane mode. **Settings → Privacy** shows what the app sent, and the model download traffic separately.

## What has and has not been checked

- Checked by machine: TypeScript compiles, lint is clean, `expo-doctor` passes, and the debug app builds (`:app:assembleDebug`, arm64). 126 JavaScript tests pass (search, planner, dates, receipts, rules, model choice, download text) and 14 of them run the real database code (schema, merge, keyword search, folder skipping, organize with undo) on SQLite in Node. 31 Kotlin tests pass (folder rules, chunking, text extraction, and a resumable downloader with redirects, auth headers, cancel and dropped connections).
- Not measured yet: indexing speed, GPU against CPU, time to first token, and answer accuracy. **No benchmark numbers are claimed anywhere in this repo.**
- Needs a real phone to confirm: downloads from Hugging Face, loading the models on the GPU, opening files, and background indexing.
- Limits: Android only. Documents outside the media folders need "All files access". At most 40 PDF pages and about 24,000 characters per file are indexed, and a scanned PDF gets OCR on its first 3 pages.

## Disclosures

- **Models:** EmbeddingGemma 2 (MediaPipe `tasks-retrieval`), Gemma 4 E2B / E4B and Gemma 3 1B (LiteRT-LM), Qwen2.5 1.5B (LiteRT-LM), ML Kit text recognition and image labeling, PdfBox-Android.
- **Stack:** Expo SDK 57, Expo Router, React Native 0.86, expo-sqlite with FTS5 and sqlite-vec, one local Kotlin Expo module (Android only).
- **AI development tools:** Devin (SWE-2) wrote the first version of the app logic and the native module. Claude Code (Anthropic) reviewed that code, fixed the problems it found, and added the in-app model downloads, the folder rules, the tests and these docs.
- Demo files are specimens: sample IDs and receipts made for the demo, never real documents.

## Docs

- `docs/APP_SPEC.md`: product and technical spec, demo script, judge Q&A
- `docs/BUILD_PLAN.md`: build plan, native contract, cut rules (written before the build; the code is the source of truth)
- `docs/TESTING.md`: manual test scenarios
