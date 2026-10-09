# AiFoundIt

A private search assistant for your phone. Ask in English or Taglish — "Nasaan yung resibo ko sa Jollibee?" — and it finds the photo, receipt, document, video or recording you mean. Everything runs on the device: no uploads, no account, works in airplane mode.

Entry for **AppBuildersPH Hackathon 2026** (theme: Local AI).

## Features

- **Chat search** over the whole phone — photos, screenshots, PDFs, Office docs, text files, video and recordings — in plain English or Taglish.
- **Hybrid retrieval.** FTS5 keyword search (BM25) merged with sqlite-vec nearest-neighbour search via Reciprocal Rank Fusion, with name, category and recency boosts.
- **Grounded answers.** Result cards come straight from database rows — the LLM only writes a 1–3 sentence summary citing them, so it can't invent a file. No model → templated answers, search still works.
- **Receipt math in code.** "Magkano nagastos ko sa GCash this week?" sums `₱` totals extracted by rules — never computed by the LLM.
- **Organize with undo.** "Ilagay mo lahat ng resibo sa isang folder" shows a plan you can untick and confirm, moves files via native ops, and reverses the whole batch on Undo.
- **Privacy guard.** Files that look like IDs, OTPs or passwords are flagged, hidden from general results unless you ask for them, and can be moved to a private folder.
- **Proof line.** Every answer ends with "Found in X s · on-device · N bytes sent" measured with `TrafficStats`.
- **At a glance** category counts after the first scan, scan rules in Settings, and a real onboarding flow (media permission → All files access → models → scan).

## How it works

```
MediaStore + file walk ──▶ extract (ML Kit OCR/labels, PdfBox, XML) ──▶ embed (EmbeddingGemma 2, GPU)
        │                                                                          │
        └──────────────▶ inbox.db (native, Kotlin) ──▶ JS merge ──▶ aifoundit.db ◀───┘
                                   chunks + FTS5 + vec0 + labels + facts
                                              │
                          query ─▶ plan ─▶ FTS5 + KNN ─▶ RRF ─▶ cards ─▶ Gemma 4 answer
```

- `modules/aifoundit-native` (Kotlin) owns the heavy pipeline and writes an **inbox** database. JS drains it into the main DB in batches inside one transaction, then applies enrichment rules (category, `₱` totals, merchants, sensitive flags).
- The same code path runs in a WorkManager worker for background indexing.
- If `modules/aifoundit-native` isn't built yet, `src/lib/native` falls back to a JS mock (`isMockNative`), so the whole pipeline is exercisable in Expo Go.

## Build & run

Requires Node, JDK 17 (Android Studio's JBR), the Android SDK, and a physical Android phone — the app reads real storage.

```bash
npm install
npx expo run:android --device      # development build (needs Metro running)
# or a standalone release build for the demo:
npx expo run:android --variant release --device
```

Then push the models and open the app:

```bash
adb shell mkdir -p /sdcard/Android/data/com.aifoundit.app/files/models
adb push embeddinggemma-2-text-vision-440m.litertlm /sdcard/Android/data/com.aifoundit.app/files/models/
adb push gemma-4-E2B-it-litert-lm.litertlm /sdcard/Android/data/com.aifoundit.app/files/models/
```

The onboarding flow detects models in that directory; you can also import a `.litertlm`/`.gguf` file in-app. Without models, search still works via FTS5 keyword matching and templated answers.

Verify: `npm run typecheck` · `npm run lint` · `npm test`

## What needs internet

Only the one-time model download. Everything else — scanning, OCR, embeddings, search, answers, file ops — is on-device. `Settings → Privacy` shows the app's sent-bytes counter.

## Disclosures

- **Models:** EmbeddingGemma 2 Text-Vision 440M (MediaPipe `tasks-retrieval`), Gemma 4 E2B / Gemma 3 1B (LiteRT-LM), ML Kit text recognition & image labeling, PdfBox-Android.
- **Stack:** Expo SDK 57, Expo Router, React Native 0.86, expo-sqlite with FTS5 + sqlite-vec, Kotlin local Expo module (Android only).
- **AI dev tools:** Claude Code (native stream), Devin / SWE-2 (TypeScript stream).
- Demo files are specimens — sample IDs and receipts made for the demo, never real documents.

## Docs

- `docs/APP_SPEC.md` — product & technical spec, demo script, judge Q&A
- `docs/BUILD_PLAN.md` — build plan, native contract, cut rules
- `docs/TESTING.md` — manual test scenarios
