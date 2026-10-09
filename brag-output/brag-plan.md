# AiFoundIt — 60s demo video

Hackathon submission video (AppBuildersPH 2026, theme: Local AI). Target: judges
+ social post on X/LinkedIn tagging Devin/Cognition, #AppBuildersPH.

## Angle

The demo script's hook, compressed: thousands of files pile up on a phone —
receipts, IDs, PDFs — and file managers only search names. AiFoundIt answers
plain-language questions (English and Taglish) over the whole phone, entirely
on-device. The proof line "0 bytes sent" is the punchline of every answer.

## Tone

`polished` — calm and trustworthy (the brand voice), no hype. Dark warm theme
straight from the app's tokens: surface #151311, amber #FFB870. Soft fades,
4–6 beats, unhurried but paced.

## Visual identity

- Replica of the real app UI (Material-ish dark, Roboto/sans) inside a phone
  frame, centered on a deep warm background with a faint amber glow.
- Real corpus data from `mock-corpus.ts`: Jollibee receipt Screenshot_20261008_121007,
  Thesis_Defense_Schedule.pdf, GCash receipts (₱1,250 + ₱345 + ₱500 = ₱2,095),
  specimen PhilHealth ID, plan card "Move 6 files to Receipts".
- Proof line verbatim: "Found in 0.4 s · on-device · 0 bytes sent".

## Storyboard (60s, 1920×1080 @ 30fps)

| t | Beat | On screen |
|---|---|---|
| 0–4 | Hook | Fast-scrolling wall of filenames (receipts, screenshots, PDFs) blurring past. Caption: "3,912 files on this phone." → "Where's the Jollibee receipt?" |
| 4–8 | Reveal | AiFoundIt title: "Find any file by describing it." Sub: "Nothing is uploaded. Works in airplane mode." Lock badge + airplane-mode icon. |
| 8–20 | Find (Taglish) | Phone UI. Suggestion tapped → query types "Nasaan yung resibo ko sa Jollibee?" → "Searching this phone…" → receipt cards stagger in → answer sentence → proof line. |
| 20–30 | Math | "Magkano nagastos ko sa GCash this week?" → amber total card "₱2,095.00 — 3 receipts · summed in code" + receipt cards + proof. |
| 30–40 | Document | "The PDF about the thesis defense schedule" → PDF card, matched words highlighted in the snippet → proof. |
| 40–50 | Organize | "Ilagay mo lahat ng resibo sa isang folder" → plan card, checkboxes, "Move 6 files" tapped → "Moved 6 files to Receipts." + Undo. |
| 50–60 | Outro | Phone settles; captions: "Your files never leave this phone." / "on-device · 0 bytes sent · English & Taglish" → "AiFoundIt — AppBuildersPH Hackathon 2026". |

## Sound

One continuous warm minimal electronic track (~110 BPM, A minor-ish pad, soft
kick, subdued hats) synthesized in Node as WAV. UI blips/taps in-key, mixed
under the music. Soft fade-out in the last 2s.

## Build

- `work/player.html` — all scenes pure functions of `t`; `window.render(t)`.
- `work/capture.js` — puppeteer-core + installed Edge, 1800 frames @30fps.
- `work/audio.js` — synth WAV (music + sfx mixed).
- ffmpeg → `brag.mp4`; strongest settled frame → `brag.jpg`, baked as frame 0.
- `share-copy.txt`.
