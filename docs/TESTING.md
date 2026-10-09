# AiFoundIt — manual test guide

What to verify before the demo, in order. Each scenario lists the setup, the action, and the expected result. Run everything twice: once normally, once in **airplane mode** (§6).

## 0. Two ways to run it

- **With the native module** (`modules/aifoundit-native` built, `expo run:android --device`): the full pipeline — real scan, ML Kit OCR, embeddings, LiteRT-LM answers.
- **Mock mode** (Expo Go or no module): `src/lib/native` falls back to a JS mock with a ~30-file demo corpus. Everything below works except real file opening, real thumbnails, and GPU timings. The mock answers "no LLM", so answers come out templated — that is the honest fallback path, not a bug.

To check which mode you're in: `isMockNative` in `src/lib/native`, or Settings → Models (mock shows no backend models).

## 1. Onboarding (fresh install)

1. Cold start → "Find any file by describing it" screen with a lock badge and step dots.
2. **Media step** → "Allow media access" → Android permission dialog for photos/video/audio/notifications. Grant → moves to step 2.
   - Deny → note appears: "Without media access AiFoundIt can only search documents you pick…" and flow continues.
3. **All files step** → "Open settings" → Android's All-files-access settings page. Toggle it, press back → the app detects it on resume and advances. "Skip for now" also advances (documents then just won't be indexed).
4. **Models step** → shows what was found ("Embedder found / Chat model found / no chat model — answers will be templated"). "Import model file" opens the document picker; picking a `.litertlm`/`.gguf` copies it into the models dir and it shows up. "Continue" starts the scan.
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
| `asdkfj qwerty zzz` (nonsense) | "I couldn't find a file that matches…" — **no invented results** |
| `receipts` (1–3 words) | Receipt category results; the planner is skipped for short queries |
| `screenshots`, `photos`, `videos` | Pure kind-word queries have no text terms — retrieval falls back to browsing files by kind/date/category filters, most recent first |

For each card: thumbnail (real image in native mode, icon fallback in mock), name, date, folder. Tap a card → file sheet shows the highlighted "Why it matched" snippet, tags, folder path.

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
- **Delete**: delete a file via the Files app, rescan → its card stops appearing.
- **Still indexing**: send a query while the progress bar is up → results show the "Still indexing, so some files may not show up yet" line.

## 6. Offline proof

Turn on **airplane mode** before the first query and leave it on:

- Repeat §2 — every query still works.
- The proof line stays at `0 bytes sent` for the whole session.
- Settings → Privacy → "Bytes sent by this app" does not increase.

## 7. Settings

- **Models** → lists model files with sizes; Import adds one; delete removes it.
- **Scan folders** → shows the scan root ("Internal storage" = whole phone).
- **Exclusions are regex** matched against each file's folder path relative to storage root. `private|bank` excludes any folder containing either word; `^whatsapp/` anchors to a top-level folder; `\.statuses` matches the literal folder. Plain names like `private` still work (substring). Invalid patterns are rejected inline; a pattern that won't compile falls back to literal matching instead of crashing the scan.
- Removing an exclusion + Rescan brings its files back; adding one + Rescan removes them from results (they are never opened during indexing).
- **Index** → file count and index size; **Delete index** empties everything (next scan rebuilds).
- **Privacy** → bytes-sent counter.

## 8. Mock-mode extras (dev only)

- `mockControls.addFile(item)` in `src/lib/native` stages a fake file — use it to test change detection without touching real storage.
- `mockControls.deleteFile(path)` stages a deletion.
- The mock's `embedText` is a deterministic hash embedder — semantic search works for overlapping terms, which is what the tests rely on. It is not a substitute for real EmbeddingGemma numbers — never quote mock timings.

## Static checks (after every change)

```bash
npm run typecheck   # tsc --noEmit — currently 0 errors
npm run lint        # expo lint — currently clean
npm test            # vitest — 44 tests across tokenize, dates, FTS, planner, RRF, snippets, enrich, corpus
```

## What NOT to claim

- Timing numbers, vectors-per-second, or accuracy figures from mock mode — the demo script requires measured numbers only.
- "LLM answers" in mock mode — templated answers are shown because no model is loaded; say exactly that.
