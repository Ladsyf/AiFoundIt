# AiFoundIt — Build Plan (hackathon build, Android)

## Context

**Why.** AiFoundIt is the team's entry for AppBuildersPH Hackathon 2026 (theme: Local AI). It's a chat app that finds and organizes files on an Android phone using AI that runs entirely on the device.

**Where the repo is today.** The repo has a polished chat UI designed with impeccable (Material 3, warm palette; see `DESIGN.md` and `PRODUCT.md`). Everything under it is fake:
- `src/features/search/demo-files.ts` holds made-up files.
- `search-engine.ts` does keyword matching over that fake data.
- `store.tsx` fakes indexing progress with a timer.
- There is no native code, no models, no database, and no real file access.

**Outcome.** Keep the UI and replace the fake layer with the real on-device pipeline:
1. Scan the phone.
2. Extract text (OCR, PDF, Office files) and tags.
3. Create vectors with EmbeddingGemma 2 on the GPU.
4. Store everything in SQLite with keyword search (FTS5) and vector search (sqlite-vec).
5. Search with hybrid retrieval.
6. Answer with Gemma 4 through LiteRT-LM.
7. Open, preview and move real files.

**Hard constraints.**
- **Deadline.** Submissions close **10:00 AM, Sat Oct 10** on Cerebral Valley, with no extensions.
- **Repo.** It must be public by then, and the README must tell judges how to build the app.
- **Demo.** 5 minutes live plus 3 minutes of Q&A at Cyberzone, SM Makati. One person must be on site by 12:00 PM.
- **Honesty.** Faked benchmarks are grounds for a dispute.
- **Product rules from `PRODUCT.md`.** Files never leave the device. It works offline. Nothing is moved without confirmation. Never invent numbers.

**Who.**
- **Claude Code** works in this repo on this laptop, with the Snapdragon phone (8 GB+ RAM) on USB.
- **SWE-2** works in another IDE.
- **The user commits manually.** Neither agent runs git commit or push.
- **Design reference:** the full design spec is the doc at https://claude.ai/code/artifact/bd639d16-56cf-424a-ad59-f3e83efda0b5. Where it and this plan differ, this plan wins (it is newer).

---

## 1. Final technical decisions

| Concern | Decision | Fallback if it fails |
|---|---|---|
| App shell | Expo SDK 57 development build. CNG: `android/` is generated, so never edit it by hand (AGENTS.md). Package id `com.aifoundit.app` goes in `app.json`. | — |
| Native code | One local Expo module, `modules/aifoundit-native` (Kotlin, Android only), created with `npx create-expo-module@latest --local` | — |
| Embeddings | **EmbeddingGemma 2 Text-Vision 440M** (`.litertlm`) through MediaPipe `UniversalEmbedder` (`com.google.mediapipe:tasks-retrieval`), with GPU text and vision delegates. Cut to 256 dimensions, then L2-normalize. | CPU delegate. If the model can't load at all, use keyword-only search (FTS5 plus LLM keyword expansion). |
| OCR and tags | ML Kit bundled `text-recognition` and `image-labeling`, called from Kotlin | — |
| PDF text | `pdfbox-android` (Kotlin). For a scanned PDF with no text: `PdfRenderer` plus OCR on the first 3 pages. | OCR only |
| Office and text files | Kotlin `ZipFile` plus `XmlPullParser` for DOCX, XLSX, PPTX, ODT and EPUB. Strip markup from TXT, MD, CSV, JSON, XML, HTML and RTF. | — |
| LLM | **LiteRT-LM** (`com.google.ai.edge.litertlm`) on the GPU. Demo model: **Gemma 4 E2B** (`litert-community/gemma-4-E2B-it-litert-lm`, 2.58 GB). Small default for 6 GB phones: Gemma 3 1B `.litertlm`. Optional upgrade: Gemma 4 E4B (3.65 GB). | `llama.rn` with GGUF. If no LLM works: templated answers using `describe()` from `search-engine.ts`. |
| Database | `expo-sqlite` with `enableFTS: true` and `withSQLiteVecExtension: true` | Vectors stored as BLOBs, with brute-force cosine search in JS |
| Pipeline ownership | Native does all heavy work (scan, extract, embed) and writes to an **inbox SQLite database**. JS drains the inbox into the main database (adds rules, FTS5 and vector rows). The same pipeline later runs in a WorkManager worker for background indexing. | — |
| Opening files | Native intents with `content://` URIs: MediaStore URIs for media, a FileProvider for other files | Copy path |
| Models on the phone | Push with adb to `/sdcard/Android/data/com.aifoundit.app/files/models/`. In-app download and Import from file come in P1. | — |

**Priorities.**
- **P0, must work for the demo:** scan, extract and embed photos and documents; hybrid search; real cards and thumbnails; open, open with, show in folder, share; Gemma 4 answer sentence; works in airplane mode.
- **P1:** LLM query planner (Taglish, dates); receipt totals; organize in Plan mode with undo; "At a glance" counts; Describe photo (Gemma 4 vision); model setup screen; scan rules settings; "0 bytes sent" proof line.
- **P2, roadmap slide if not done:** background WorkManager (new-media trigger, periodic, boot); video moments and recordings (needs the 740M model); Ask-each and Auto modes; privacy guard; saved chat history; iOS.

---

## 2. Phase 0 — Environment and baseline (people + Claude, about 45 min)

1. **Toolchain** on this laptop (PowerShell, current user):
   - `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - Add `%ANDROID_HOME%\platform-tools` to PATH.
   - Check with `adb devices`; it must list the Snapdragon phone.
   - Run `git config core.longpaths true`.
2. **Dependencies.** Install all JS dependencies once, so `package.json` doesn't conflict between agents. Use `npx expo install`:
   ```
   expo-sqlite expo-file-system expo-sharing expo-build-properties expo-network expo-document-picker expo-video expo-audio
   ```
   Then run `npm install`.
3. **`app.json`:**
   - Add `android.package: "com.aifoundit.app"`.
   - Add the plugin `["expo-sqlite", { "enableFTS": true, "withSQLiteVecExtension": true }]`.
   - Add `expo-build-properties` (raise `android.minSdkVersion` if MediaPipe or LiteRT-LM require it; check their docs).
4. **Baseline build.** `npx expo run:android --device` must show the current UI on the phone before any native work starts. The first Gradle build is slow, so start it early.
5. **Models.** Hugging Face is blocked on the office network (Zscaler), so download on a personal network or a phone hotspot:
   - EmbeddingGemma 2 Text-Vision 440M (`embeddinggemma-2-text-vision-440m.litertlm`, on litert-community)
   - `litert-community/gemma-4-E2B-it-litert-lm`
   - Gemma 3 1B `.litertlm` (optional; first confirm litert-community publishes a `.litertlm` build)

   Then push them:
   ```
   adb shell mkdir -p /sdcard/Android/data/com.aifoundit.app/files/models
   adb push <file> /sdcard/Android/data/com.aifoundit.app/files/models/
   ```
6. **Demo dataset** (people, can run in parallel). Build about 150 files and push them to their real folders: `DCIM/Camera`, `Pictures/Screenshots`, `Download`, `Documents`.
   - 30 receipts (GCash/Maya screenshots, Jollibee, 7-Eleven, Meralco)
   - Sample or specimen IDs only, never real ones
   - 20 school and work PDFs, 10 DOCX, 10 TXT/MD notes
   - 60 photos (pets, food, beach, events)
   - P2 only: 10 videos and 10 voice memos

**Rules for both agents (from AGENTS.md):**
- Before using any Expo API, fetch the matching SDK 57 docs (`https://docs.expo.dev/versions/v57.0.0/...`). In particular, `expo-file-system` has a new API in SDK 57.
- Install with `npx expo install`.
- Run `npx tsc --noEmit` and `npx expo lint` before calling a step done.

---

## 3. The native contract (write first, then freeze)

`modules/aifoundit-native/src/AiFoundItNative.types.ts` is the single source of truth. Claude writes it in step N0. After that it changes only by agreement, and both agents re-read it after any change.

```ts
export type FileKind = 'image' | 'pdf' | 'doc' | 'text' | 'audio' | 'video';
export type ScanConfig = {
  mode: 'wholePhone' | 'selected';
  includeRoots: string[];          // e.g. "DCIM/Camera", "Download"; relative to storage root
  excludes: string[];              // user + default exclusions (prefix match)
  types: { images: boolean; documents: boolean; audio: boolean; video: boolean };
  respectNomedia: boolean;         // default true
  minImageBytes: number;           // 10_240
  maxDocBytes: number;             // 100 MB
};
export type ModelConfig = { embedderPath: string | null; llmPath: string | null; useGpu: boolean; dims: 256 };
export type Chunk = { kind: 'text' | 'image' | 'frame' | 'audio'; page?: number; startMs?: number; endMs?: number;
                      text?: string; vector?: number[] };          // vector: 256 floats, normalized
export type InboxItem = {
  id: number; op: 'upsert' | 'delete';
  path: string; uri: string; name: string; folder: string; ext: string; mime: string; kind: FileKind;
  size: number; modifiedAt: number; takenAt?: number; width?: number; height?: number; durationMs?: number;
  isScreenshot: boolean; labels: { label: string; confidence: number }[];
  thumbnailPath?: string; chunks: Chunk[]; error?: string;
};
export type IndexStatus = { running: boolean; done: number; total: number; failed: number;
                            embedder: 'gpu' | 'cpu' | 'none'; llm: 'gpu' | 'cpu' | 'none' };
export type FileOp = { op: 'mkdir' | 'move' | 'copy' | 'rename'; from?: string; to: string };
export type FileOpResult = { op: FileOp; ok: boolean; finalPath?: string; error?: string };

export interface AiFoundItNative {
  // setup and permissions
  getModelsDir(): string;
  hasAllFilesAccess(): boolean;
  openAllFilesAccessSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  configure(scan: ScanConfig, models: ModelConfig): Promise<IndexStatus>;   // loads models, returns backends
  // indexing (native pipeline -> inbox)
  runScanNow(): Promise<void>;                     // events: onIndexProgress {done,total,current}
  cancelScan(): Promise<void>;
  getStatus(): Promise<IndexStatus>;
  drainInbox(limit: number): Promise<InboxItem[]>; // read only
  ackInbox(ids: number[]): Promise<void>;          // delete after JS merged them (no loss on crash)
  // embeddings for queries
  embedText(text: string): Promise<number[]>;
  // LLM (LiteRT-LM)
  generate(requestId: string, req: { system?: string; prompt: string; imagePath?: string; audioPath?: string;
           maxTokens: number; temperature: number }): Promise<void>; // events: onToken, onGenerateDone, onGenerateError
  stopGenerate(requestId: string): Promise<void>;
  // files
  thumbnail(path: string, opts: { size: number; page?: number }): Promise<string | null>; // cached file path
  readText(path: string, maxChars: number): Promise<string>;
  openFile(path: string, how: 'default' | 'chooser'): Promise<boolean>;
  showInFolder(path: string): Promise<boolean>;     // false: UI falls back to Copy path
  runFileOps(batchId: string, ops: FileOp[]): Promise<FileOpResult[]>; // events: onFileOpsProgress
  bytesSent(): Promise<number>;                     // TrafficStats.getUidTxBytes(myUid)
  // P2
  scheduleBackground(opts: { everyHours: number; requireCharging: boolean; watchNewMedia: boolean }): Promise<void>;
  cancelBackground(): Promise<void>;
}
```

The same folder also holds `src/mock.ts`: a JS mock of this interface that returns demo-like data. SWE-2 uses it to build and test the JS side in Expo Go on a second phone. `src/lib/native.ts` picks the real module when it is available, and the mock otherwise.

---

## 4. Work streams

### File ownership (prevents conflicts; the user commits)

| Owner | Owns |
|---|---|
| Claude Code (Stream N) | `modules/aifoundit-native/**` (including the contract and the mock), `app.json`, `package.json` and its lockfile (Phase 0 installs), README sections "Build & run" and "Models" |
| SWE-2 (Stream J) | `src/lib/**` (new), `src/features/**`, `src/app/**`, `PRODUCT.md`/`DESIGN.md` updates, README sections "Features", "How it works" and "Disclosures" |

If an agent needs a change in the other's area, it asks through the user. It does not edit the file itself.

### Stream N — native module (Claude Code, built and tested on the USB phone)

| Step | Work | Done when |
|---|---|---|
| **N0** (30 min) | Scaffold the module (Android only). Write the contract and the mock. In `android/build.gradle`, add pinned versions of: `tasks-retrieval`, `litertlm-android` (only if it isn't already a transitive dependency; watch for duplicate-class errors), `mlkit:text-recognition`, `mlkit:image-labeling`, `pdfbox-android`, `work-runtime-ktx`, `kotlinx-coroutines-play-services`. The module's `AndroidManifest.xml` (merged into the app's) needs: READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE (maxSdk 32), MANAGE_EXTERNAL_STORAGE, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, RECEIVE_BOOT_COMPLETED, INTERNET (model download), `<uses-native-library>` libOpenCL.so and libvndksupport.so with `required=false`, and a FileProvider with `res/xml/aifoundit_file_paths.xml` (`external-path .`). | The app builds; calling `getModelsDir()` from JS returns a path |
| **N1** (60 min) | `scan/Scanner.kt` and `ScanRules.kt`. Query `MediaStore.Files` (with All files access this includes documents; without it, only the Images/Video/Audio collections) for size, date_modified, mime, relative_path, is_trashed. Walk the file system only for user-added roots. Apply exclusions (Android/data, dot-folders, `.nomedia`, cache/tmp/logs, small images, large documents). Order: priority folders first, newest first. `index/InboxDb.kt` (SQLiteOpenHelper) has tables `seen(path, size, mtime, status)` and `inbox(...)`. Change detection compares against `seen`, and deleted files become `op:'delete'` rows. `files/Thumbs.kt`: `loadThumbnail` for media, page 0 through `PdfRenderer` for PDFs; cache JPEGs in `cacheDir/thumbs`. | `runScanNow` on the demo phone lists all the demo files with progress events, and inbox rows include `thumbnailPath` |
| **N2** (60 min) | `extract/ImageExtractor.kt`: decode with `inSampleSize` at about 512 px; ML Kit OCR and labels (confidence ≥ 0.6); EXIF date. `PdfExtractor.kt`: PdfBox text from the first 30 pages, with the OCR fallback. `OfficeExtractor.kt` and `TextExtractor.kt`. Chunk text into about 800 characters with overlap and keep page numbers. Process files in batches of 20. Use one coroutine pipeline: 2–3 IO decode workers feeding one model queue. | The inbox holds OCR text for receipts and PDF/DOCX text, and failures are recorded in `error` |
| **N3** (60 min, **timebox 90**) | `ModelHub.kt`: a singleton that owns the `UniversalEmbedder` (GPU delegates, falling back to CPU) on a **dedicated single thread**, because GPU contexts are thread-bound. `embedImage` on photos; `embedText` on OCR text when it is 10 characters or more, and on document chunks. Cut vectors to 256 and normalize. Check the model card for query/document prompt prefixes. Expose `embedText` for queries. | Inbox chunks carry 256-number vectors; `getStatus().embedder === 'gpu'`; per-image timing is logged. **If this fails at 90 min:** set `embedder:'none'`, ship text without vectors, and continue. |
| **N4** (60 min) | `llm/LlmSession.kt`: LiteRT-LM `Engine` with `EngineConfig(backend = GPU, visionBackend = GPU)`. Call `initialize()` in the background at startup; it can take up to 10 s. `createConversation()` per request, with streaming through `sendMessageAsync`, sent to JS as `onToken` events. Images go in as `Content.ImageFile`. Support stop. | A Gemma 4 E2B answer streams into JS on the phone with the GPU backend; time to first token is logged |
| **N5** (45 min) | `files/Opener.kt`: `openFile` uses `ACTION_VIEW` with a MediaStore or FileProvider URI and `FLAG_GRANT_READ_URI_PERMISSION`, with a chooser variant. `showInFolder` uses `DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:<folder>")` with the directory MIME type. `readText`. `util/NetStats.kt`. | From the app: a photo opens in Gallery, a PDF opens in a reader, and Downloads opens in the Files app (or returns false) |
| **N6** (45 min, P1) | `files/FileOps.kt`: mkdir, move (same volume uses rename, otherwise copy, verify, delete), copy, rename. Never overwrite; clashes become `name (1).ext`. Call `MediaScannerConnection.scanFile` on the old and new paths. Report per-op results. Undo is driven from JS using the results. | Moving 5 receipts to `Documents/Receipts` shows up in Gallery and Files, and undo restores them |
| **N7** (60 min, P2) | `index/IndexWorker.kt` (CoroutineWorker plus `setForeground`, type dataSync) runs the same pipeline. `Scheduler.kt`: one-time work with a content URI trigger on MediaStore images, video and audio (re-queued after each run); 6-hour periodic work (charging, battery not low). `BootReceiver.kt` only queues work. | A photo taken with the Camera app shows up in the inbox while AiFoundIt is closed |
| **N8** (90 min, P2) | `VideoExtractor.kt`: `getScaledFrameAtTime` every 2 s or 5 s, at most 120 frames, dropping frames with cosine above 0.95. `AudioExtractor.kt`: MediaExtractor and MediaCodec to PCM, 10 s chunks, `embedAudio` (needs the Omnimodal 740M model; use one model for the whole index). | Searching "kids laughing" returns a video with its time |

### Stream J — TypeScript and UI (SWE-2; reuse the impeccable components)

| Step | Work | Done when |
|---|---|---|
| **J0** (20 min) | `src/lib/native.ts`: real module or mock. Extend `src/features/search/types.ts`. `FileItem` gains `path`, `uri`, `mime`, `kind: FileKind`, `thumbnailPath?`, `snippet?`, `page?`, `startMs?`; `preview` becomes optional. Add new preview variants `image`, `video` and `audio`, and **reuse the `document` variant** for extracted text (title plus first lines). | Typecheck passes; the existing UI still renders with the mock |
| **J1** (45 min) | `src/lib/db/`: `db.ts` opens the database, runs migrations and loads sqlite-vec through `SQLite.bundledExtensions['sqlite-vec']` + `loadExtensionAsync`. If that fails, set `vecAvailable=false` and use the JS brute-force fallback. `schema.ts` follows the spec: `files`, `index_steps`, `chunks`, `chunks_fts` (FTS5, external content, `unicode61 remove_diacritics 2`), `chunks_vec` (`vec0 float[256]`), `labels`, `facts`, `scan_rules`, `models`, `actions_log` (with `batch_id` and `status`), `meta` (embedder model id). | Migrations run on the device; `SELECT vec_version()` works |
| **J2** (60 min) | `src/lib/db/merge.ts`: in a loop, `drainInbox(50)`, then one transaction that upserts files, replaces chunks, FTS rows, vectors and labels, and runs enrichment. Then `ackInbox`. Deletes cascade. `src/lib/enrich/`: `categorize.ts` (receipt, id, school, work, screenshot, meme, document; built from OCR words, labels, folder and name, reusing the `KIND_WORDS` vocabulary from `search-engine.ts`); `facts.ts` (₱/PHP/P amounts with the "Total" line preferred, dates, merchant from a known list: Jollibee, McDonald's, GCash, Maya, 7-Eleven, Meralco, SM, Shopee, Lazada, Grab); `sensitive.ts` (PhilSys, PhilHealth, SSS, TIN, UMID, passport, driver's license, OTP, password). | After a scan, the database row counts match the demo set and receipts have amounts |
| **J3** (60 min) | `src/lib/search/retrieve.ts`: run the FTS5 query (escaped keywords, prefix `*` on tokens of 3+ characters, ranked by `bm25`, top 50) and the vector KNN (`embedText(query)`, then `MATCH ? AND k = 50`) together. Merge with RRF (k = 60) plus small boosts: name match, planned category, recent files. Group chunks by file, keep the top 10, build a snippet with highlight ranges, and apply a not-found threshold calibrated on the demo set. Rewire `store.tsx`: `send` becomes async (plan, retrieve, answer); `fileById` reads a `Map` cache filled from the database. Remove the `DEMO_FILES` and `indexTick` timer path on device. Index progress comes from `onIndexProgress`. Merge runs on app open and after each scan batch. | On the phone, "Jollibee receipt" and "beach photo" return the right real files |
| **J4** (60 min) | Cards and sheet. In `file-thumbnail.tsx`, the `image`/`video` variants render `expo-image` from `thumbnailPath` with a fade-in; documents keep the existing text preview from extracted lines. `file-card.tsx` adds a time chip for video and audio. `file-sheet.tsx` gets real actions: Open (in-app viewer for images; PDFs and others open externally), Open with, Show in folder (falls back to Copy path + snackbar), Share (`expo-sharing`), Copy path. "Why it matched" shows the highlighted snippet. Update copy: remove "This preview uses sample files" in `welcome.tsx` and `history-drawer.tsx`. | Tapping a card shows the real thumbnail, and all buttons work on the device |
| **J5** (60 min) | `src/lib/search/answer.ts`: the grounded answer prompt gets the top 5 results (name, folder, date, snippet of 300 characters or less, numbered). It asks for 1–3 sentences, citations as [n], the user's language (Taglish in, Taglish out), and never an invented file. Stream `onToken` into `AssistantMessage.text`. **Cards render before the text.** `plan.ts` (P1): the query planner prompt returns JSON (intent, queryEn, keywords, kinds, dateFrom, dateTo, category, operation, destination) with EN and Taglish few-shot examples, a 4 s timeout and tolerant JSON parsing. The fallback is a heuristic planner built from `tokenize`, `monthFilter`, `KIND_WORDS` and `TIDY_WORDS` in `search-engine.ts`. Queries of 1–3 words skip the planner. | An answer streams in under the cards; turning the LLM off still gives a templated answer from `describe()` |
| **J6** (60 min) | Onboarding in `welcome.tsx`'s `AccessRequest`, in steps: (1) photos and media plus notifications via `PermissionsAndroid`; (2) "Allow all files access (for documents)" via `openAllFilesAccessSettings`, re-checked on app resume; (3) models: detect files in `getModelsDir()`; if missing, show Import from file (`expo-document-picker`, copied into the models folder) and Download (P1, resumable, Wi-Fi only switch); (4) `configure` and then `runScanNow`. `index-status.tsx` shows real counts and the active backend. | A fresh install goes from first launch to the first search with no dev tools |
| **J7** (60 min, P1) | Intents. Total card: SQL sum over `facts` for the planned date range, plus a list of receipts. Organize: generalize `MoveProposal` into a `FilePlan` (ops grouped by destination, mode `plan`), extend `move-proposal-card.tsx` with untick and rename-folder, run it with `runFileOps`, write `actions_log`, and Undo through the existing snackbar using reverse ops. "At a glance": category counts as tiles above `Suggestions`. Count intent. Describe photo: `generate()` with `imagePath`, then save `files.description` and embed it as a `description` chunk. Proof line: "Found in X s · on-device · 0 bytes sent", using real timing and `bytesSent()` deltas. | All P1 demo-script steps work on the device |
| **J8** (45 min, P1/P2) | New route `src/app/settings.tsx` (a `Drawer.Screen`), built from existing components and DESIGN.md tokens. Sections: Models (active model, backend, import, delete), Scan folders (mode, preset includes, excludes), Index (counts, Rescan, Delete index), Privacy (bytes sent). | Changing exclusions removes those files from results after a rescan |

### Integration checkpoints (Claude builds on the phone; the user commits after each one)

- **I1** (after N3 and J3): a real scan of the demo set completes on the GPU, and search returns real files with thumbnails. **This is the MVP. Commit and record a backup screen video.**
- **I2** (after N4 and J5): answers stream from Gemma 4 E2B in airplane mode.
- **I3** (after N5/N6 and J4/J7): open, open with, show in folder, organize with undo, and receipt total all work.

### Cut rules (the deadline wins)

- If I1 isn't green by **7:00 AM**, stop all P1 work and polish the P0 demo.
- Code freeze is **8:30 AM**. After that, only the README, video and submission.
- Submit by **9:30 AM**.
- Anything P1 not done by 8:00 AM moves to the roadmap slide.

---

## 5. Key details both agents must follow

- **Grounding.** Result cards always come from database rows, never from LLM text. The LLM only writes sentences and JSON plans. Totals are computed in SQL or JS, never by the LLM.
- **One embedding model per index.** Store its id in `meta`. If it changes, clear the vectors and re-embed.
- **Performance.**
  - Models load once and stay loaded.
  - The embedder runs on its own thread with the GPU delegate.
  - Images are decoded at about 512 px.
  - Results move in batches of 20, and each batch is one transaction.
  - Vectors cross the bridge as `number[]` of length 256.
  - Indexing never runs on the JS thread.
- **Privacy.**
  - No analytics or crash SDKs.
  - Network is used only to download models.
  - Excluded folders are never opened.
  - Sensitive files are hidden from general results unless the user asks for them.
- **Design.** New surfaces (onboarding steps, settings, total card, plan card, at-a-glance tiles) use `src/constants/theme.ts`, `components/ui/*` and the DESIGN.md voice (calm, plain, privacy first). Optionally run the impeccable review on new surfaces, and record the model names in `PRODUCT.md` once they are measured.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| EmbeddingGemma 2 or UniversalEmbedder is too new (4 days old) | 90-minute timebox in N3, then FTS5 plus LLM keyword expansion. Search still works. |
| LiteRT-LM duplicates the classes inside `tasks-retrieval` | Use the transitive LiteRT-LM classes. If that fails, run the LLM through `llama.rn` (GGUF). |
| GPU delegate fails on some phones | Automatic CPU fallback; Settings shows the backend in use |
| sqlite-vec build or load fails | `vecAvailable=false`, use the JS cosine fallback |
| Windows build problems (path length, first Gradle build of 10–20 min) | Short repo path, `core.longpaths`, start the baseline build in Phase 0 |
| Hugging Face blocked on the office network | Download on a hotspot or personal network, then `adb push` |
| Phone gets hot during a live scan | Index before the demo; on stage, only the live-capture step indexes anything |

---

## 7. Verification

1. **Static checks after every step:** `npx tsc --noEmit` and `npx expo lint`.
2. **Device build:** `npx expo run:android --device` on the Snapdragon phone, and `adb logcat -s AiFoundIt` for native timings.
3. **Pipeline:**
   - After `runScanNow`: the inbox count equals the demo file count, and the database counts (`files`, `chunks`, `chunks_vec`) match after the merge.
   - Run it again: 0 files are processed (change detection works).
   - Delete one file: its row disappears after the next scan.
4. **Search acceptance queries** (each must return the expected file in the top 3):
   - "Nasaan yung resibo ko sa Jollibee?"
   - "beach photo"
   - "PDF about the thesis defense schedule"
   - "my PhilHealth ID"
   - "wifi password screenshot"
   - "Magkano nagastos ko sa GCash this week?" (the total matches a manual sum)
   - A nonsense query returns "not found".
5. **Actions:**
   - Open, open with, show in folder and share work for a photo, a PDF and a DOCX.
   - Organizing 5 receipts moves them; Gallery and Files see the change; Undo restores the original paths.
6. **Offline proof:** turn on airplane mode and repeat steps 4–5. All pass, and `bytesSent()` doesn't change.
7. **Measure for the README:** images indexed per minute (GPU vs CPU), time until cards appear, time to first token and tokens per second, RAM, and index size. Only report numbers you measured.
8. **Demo install on the real phone:**
   - Install a release build: `npx expo run:android --variant release --device`. It bundles the JS, so the app runs on its own, with no laptop or Metro server, including in airplane mode. A development build would need Metro on stage.
   - Before the demo, put the models on the phone, run the full scan, and let the phone cool down.
   - The phone's own files will be on the projector. Use a phone (or a separate Android user profile) that holds only the curated demo set plus files you're happy to show. Exclude anything private with scan rules, and run every demo query beforehand to check what comes up.
9. **Rehearsal:** run the demo script from the spec doc twice, end to end, from a cold start. Keep the backup video on the laptop.
10. **Submission checklist:**
   - Public repo with README setup steps and disclosures: EmbeddingGemma 2, Gemma 4, Gemma 3, MediaPipe, LiteRT-LM, ML Kit, PdfBox-Android, expo-sqlite/sqlite-vec, and AI tools (Claude Code, SWE-2).
   - 1-minute video on X or LinkedIn, tagging Devin/Cognition, with #AppBuildersPH.
   - Screenshots, hardware tested on, what runs locally vs needs internet, and the "why local" answer.
   - Submitted on Cerebral Valley by 9:30 AM.
