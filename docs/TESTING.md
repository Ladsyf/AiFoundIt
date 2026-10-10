# AiFoundIt — manual test guide

What to verify before the demo, in order. Each scenario lists the setup, the action, and the expected result. Run everything twice: once normally, once in **airplane mode** (§6).

## 0. Two ways to run it

- **With the native module** (`modules/aifoundit-native` built, `expo run:android --device`): the full pipeline — real scan, ML Kit OCR, embeddings, LiteRT-LM answers.
- **Mock mode** (Expo Go or no module): `src/lib/native` falls back to a JS mock with a ~30-file demo corpus. Everything below works except real file opening, real thumbnails, and GPU timings. The mock answers "no LLM", so answers come out templated — that is the honest fallback path, not a bug.

To check which mode you're in: mock mode shows a "Demo mode" notice under the app bar and at the top of Settings. In mock mode the model downloads are simulated (fake progress, no real file), so use it to look at the screens only.

## 1. Onboarding (fresh install)

1. Cold start → "Find any file by describing it" screen with a lock badge and step dots.
2. **Media step** → "Allow media access" → Android permission dialog for photos/video/audio/notifications. Grant → moves to step 2.
   - Deny → note appears: "Without access to photos and videos they cannot be searched…" and flow continues. (On Android 12 and older the dialog asks for the single storage permission instead.)
3. **All files step** → "Open settings" → Android's All-files-access settings page. Toggle it, press back → the app detects it on resume and advances. "Skip for now" also advances (documents then just won't be indexed).
4. **Models step** ("Choose the AI models") → a list with a search model and chat models, each with size, a Recommended tag on the pair that suits this phone, and a **Download** button. See §8 for the download checks. "Download recommended" starts both. "Import from file" copies a model you already have. "Continue" starts the scan; while the search model is still downloading it reads "Downloading the search model…" (disabled) next to "Scan without it".
5. **Scan step** → progress bar "Indexing files on this phone · N of M" with the active backend (e.g. "embedder on GPU"). "Start searching" lets you skip ahead — search works on whatever has been merged.

## 2. Search (acceptance queries)

After the scan finishes, send each of these (or tap the suggestion buttons). Every query must return the expected file **in the top 3** and end with the proof line "Found in X s · on-device · 0 bytes sent".

| Query | Expected |
|---|---|
| `Nasaan yung resibo ko sa Jollibee?` | The Jollibee receipt card |
| `beach photo` | Beach photos (matched by labels/image vector, no OCR text) |
| `PDF about the thesis defense schedule` | `Thesis_Defense_Schedule.pdf`, snippet shows page text |
| `my PhilHealth ID` | The PhilHealth screenshot — **sensitive files must appear here** because the query asks for an ID |
| `wifi password screenshot` | The Casa-5G Wi-Fi screenshot |
| `asdkfj qwerty zzz` (nonsense) | "I couldn't find a file that matches…" — **no invented results**, and no file cards at all |
| `Hi`, `thanks`, `kumusta` | A short greeting that says what to ask for — no search runs and no files are shown |
| A topic that is not on the phone (for example `dinosaur toy`) | No files. A file found only by meaning must stand clear of how similar the question is to the rest of the index (dev builds log each hit as `similarity/z` after `[search]`; the cut is `Z_MIN` in `src/lib/search/relevance.ts`) |
| `receipts` (1–3 words) | Receipt category results; the planner is skipped for short queries |
| `screenshots`, `photos`, `videos` | Pure kind-word queries have no text terms — retrieval falls back to browsing files by kind/date/category filters, most recent first |

For each card: thumbnail (real image in native mode, icon fallback in mock), name, date, folder. Tap a card → file sheet shows the highlighted "Why it matched" snippet, tags, folder path.

### Conversation context

The chat remembers the last few turns of the current conversation (not across conversations or restarts).

| Say | Then | Expected |
|---|---|---|
| `My name is Almar` | `What is my name?` | A short chat reply, then "Almar" — no file cards for either |
| `Jollibee receipt` | `only this week?` | Same topic, narrowed to this week (the earlier topic carries over because the new message has none of its own) |
| `Jollibee receipt` | `only the PDF` | Same topic, PDFs only |
| `Jollibee receipt` | `screenshots` | A fresh search for screenshots — a bare kind word does not inherit the old topic |
| Any search | `which one is the biggest?` | The answer can use the files the last answer showed (their names are in the context) |

## 3. File actions (sheet)

On a photo, a PDF, and a DOCX, verify each button:

- **Open** → file opens in the default app (Gallery / PDF reader).
- **Open with** → chooser shows compatible apps.
- **Show in folder** → opens the folder in a Files app. If nothing handles it → falls back to copying the path + "Path copied" snackbar.
- **Share** → Android share sheet with the file attached.
- **Copy path** → snackbar "Path copied"; pasted value reads `Internal storage/...` (no `/storage/emulated/0` prefix).

## 4. Intents

- **Compute**: `Magkano nagastos ko sa GCash this week?` → total card shows `₱` amount and receipt count. **Verify by hand** — add the totals on the GCash screenshots (mock corpus: ₱1,250 + ₱345 + ₱500 = **₱2,095**). The number must match exactly; it is summed in code.
- **Count**: `how many files do I have` → "You have N files indexed" matching Settings → Index.
- **Privacy**: `May picture ba ako ng ID ko?` → sensitive files (PhilHealth screenshot, UMID photo, passport scan) plus a plan card proposing `Documents/Private`.
- **Organize**: `Ilagay mo lahat ng resibo sa isang folder` → plan card lists every receipt, all ticked, destination `Documents/Receipts`.
  - **Untick** one file → count updates; Run → only ticked files move.
  - **Confirm** → files move; Gallery and the Files app show the new location; actions logged in `actions_log`.
  - **Undo** (snackbar, ~6 s) → all files return to their original paths; card shows "Undone".
- **At a glance**: after the first scan, tiles above the suggestions show category counts (Receipts, IDs, School, Screenshots, …). Tapping a tile runs that query — these queries carry no text terms, so results come from the kind/category browse fallback, most recent first.

## 5. Indexing behavior

- **Second scan** (Settings → Rescan): completes fast and processes **0 files** — change detection works (path + size + mtime).
- **New file**: drop a new receipt screenshot into `Pictures/Screenshots` (or take a photo), rescan → it appears in results.
- **New file while the app is open**: add a photo or PDF (for example into Download) and leave the app open → within about a minute a small "Indexing files on this phone" bar shows for that file, and it is searchable without pressing Rescan. A scan that finds nothing new shows no bar. Deleted files stop appearing the same way.
- **Delete**: delete a file via the Files app, rescan → its card stops appearing.
- **Order**: photos, documents and recordings are indexed first and videos last (a video costs up to 12 picture embeddings), so most files are searchable well before the scan ends.
- **Still indexing**: send a query while the progress bar is up → results show the "Still indexing, so some files may not show up yet" line.

## 6. Offline proof

Turn on **airplane mode** before the first query and leave it on:

- Repeat §2 — every query still works.
- The proof line stays at `0 bytes sent` for the whole session.
- Settings → Privacy → "Sent by this app" does not increase. "Used by model downloads" stays at 0 unless you downloaded a model in this session.

## 7. Settings

- **AI models** → shows whether the search model and the chat model are loaded, and on the GPU or the CPU, then the model list (§8).
- **Scan folders**
  - **Quick pick**: tap **Android** under "Folders to skip" → it joins the list at once, and indexed files under any folder named Android disappear from results without a rescan. Remove it → a scan starts and those files come back.
  - **Choose a folder**: the system folder picker opens; pick `Documents/Private` (or any folder in internal storage) → it is added as `Documents/Private`. Picking the top of internal storage shows "Pick a folder inside internal storage…". Cancelling the picker changes nothing.
  - **Type a path**: `Bank`, `Documents/Private`, `/storage/emulated/0/Download/Bank` and `Internal storage/Download/Bank` are accepted and shown without the storage prefix. `..` and an empty entry are refused with a message. Adding the same folder twice says it is already skipped.
  - `Android/data` and `Android/obb` are always skipped; they show a lock and have no remove button.
  - **What to scan**: "Only chosen folders" needs at least one chosen folder first. Switching to it, and back, each start a scan; files outside the chosen folders stop showing up after the scan.
- **Index** → file count and index size; **Rescan**; **Delete index** (asks first) empties everything, and the next scan rebuilds it from scratch.
- **Background** → the switch schedules or cancels the background job; "Battery settings" opens Android's battery page for the app.
- **Access** → shows whether All files access is allowed; "Allow" opens the system page, and the row updates when you come back.
- **Privacy** → "Sent by this app" and "Used by model downloads" (see §6).

## 8. Model downloads

Use Wi-Fi. Run these on a real phone.

1. **Download.** Tap **Download · 485 MB** on EmbeddingGemma 2 → a progress bar with "x MB of 485 MB · n%", **Pause** and **Cancel**. When it ends the card says "On this phone" and the model is used automatically if it is the first of its kind. The section header shows the search model "running on the GPU" (or CPU).
2. **Pause / resume.** Pause at about 30% → "Paused · …". **Resume** continues from the same byte count, not from zero.
3. **Connection drops.** Turn Wi-Fi off mid-download → "Connection lost. Trying again…", and it carries on by itself when Wi-Fi is back. If it gives up, the card says what was saved and offers **Continue**.
4. **Close the app mid-download** and reopen → the card shows "Stopped · x of y" with **Continue download** and **Discard**.
5. **Wi-Fi only.** With the switch on and only mobile data → "Connect to Wi-Fi, or turn off “Wi-Fi only”, and try again." With it off, the download runs on mobile data.
6. **Airplane mode** → "There is no internet connection."
7. **License.** Download Gemma 3 1B (it may ask for a login). If the card says it needs a free Hugging Face account: **Open model page**, accept the license, create a read token, paste it under "Hugging Face login", Save, then **Try again**. The token field stays collapsed until it is needed or you open it.
8. **Not enough space.** With almost no free storage → "There is not enough free storage on this phone for this model." before any bytes are written.
9. **Use / Delete.** With two chat models installed, **Use this one** switches (a loading state shows, then GPU or CPU). **Delete** asks first and frees the space. Deleting the search model leaves keyword search working.
10. **New search model.** Installing a different search model while files are indexed → "New search model. Indexing your files again…" and a rescan starts, because vectors from different models cannot be compared.
11. **Import.** Put a `.litertlm` on the phone, tap **Import from file**, pick it → "Copying · …" progress, then it appears as a model. A file that does not end in `.litertlm`, `.gguf`, `.task`, `.tflite` or `.bin` is refused with a message.
12. **adb push** (alternative): push files using the exact names in the README; they show as installed after reopening Settings.

## 9. Mock-mode extras (dev only)

- `mockControls.addFile(item)` in `src/lib/native` stages a fake file — use it to test change detection without touching real storage.
- `mockControls.deleteFile(path)` stages a deletion.
- The mock's `embedText` is a deterministic hash embedder — semantic search works for overlapping terms, which is what the tests rely on. It is not a substitute for real EmbeddingGemma numbers — never quote mock timings.

## Static checks (after every change)

```bash
npm run typecheck   # tsc --noEmit — currently 0 errors
npm run lint        # expo lint — currently clean
npm test            # vitest — 126 tests: search, planner, dates, receipts, folder rules, model choice, download text, and the database code on SQLite in Node
```

The Kotlin unit tests (folder rules, chunking, text extraction, resumable downloader) run once the Android project exists:

```bash
npx expo prebuild --platform android
cd android && ./gradlew :aifoundit-native:testDebugUnitTest
```

## What NOT to claim

- Timing numbers, vectors-per-second, or accuracy figures from mock mode — the demo script requires measured numbers only.
- "LLM answers" in mock mode — templated answers are shown because no model is loaded; say exactly that.
