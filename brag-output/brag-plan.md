# AiFoundIt: 60-second pitch video

For the AppBuildersPH 2026 submission (theme: Local AI) and the X/LinkedIn post.
Built from scratch: new storyboard, new visuals, new soundtrack. The material comes from the app's
own source: theme tokens, UI copy, and the sample files in `mock-corpus.ts`.

## What it is

AiFoundIt is a private search assistant for Android phones. You describe a file in English or
Taglish and it finds the photo, receipt, PDF or video, with the AI running entirely on the phone.

## Angle

Show the problem in five seconds, then let the app prove the claims live. The receipt you need
is saved as `Screenshot_20261009_184522.png`, so searching by file name finds nothing. AiFoundIt
finds it by what is inside, without uploading anything.

- **Hook:** "Ever scrolled 5 minutes for one GCash receipt?" Then a file-name search for
  "gcash receipt" comes back with no results.
- **Highlights:** (1) Taglish questions, (2) search inside videos and screenshots, (3) receipt
  math done in code, (4) privacy guard plus moves you approve, with undo.
- **Punchline:** Your files never leave the phone. No uploads, no account, and it works in airplane mode.

## Tone and look

Pitch-deck clarity with the brand voice: calm, trustworthy, no hype. Dark warm canvas
(#0E0C0A) with the app's amber primary (#FFB870). Numbered feature labels on the left, the
real chat UI on a phone on the right, and a callout that points at the proof on screen.
Headlines use Segoe UI Variable Display. The phone UI uses Roboto and Material Symbols, like
the Android app.

## Storyboard (60 s, 1920×1080, 30 fps)

| Time | Scene | On screen |
|---|---|---|
| 0.0–5.8 | Hook | Wall of screenshots drifting. "Ever scrolled 5 minutes for one GCash receipt?" A file search types "gcash receipt" and gets **No results**: "Your receipt is saved as Screenshot_20261009_184522.png". |
| 5.8–9.6 | Reveal | App icon, **AiFoundIt**, "Ask your phone for any file, in English or Taglish." |
| 9.6–19.9 | 01 Ask like you talk | Phone in airplane mode. Tap "Nasaan yung resibo ko sa Jollibee?" Two Jollibee receipt cards, then a grounded answer that cites them. Callout: "Real files from your phone. The AI can't invent one." |
| 19.9–28.1 | 02 Looks inside files | Typed: "Yung video na nag-blow ng candles si baby". The birthday video card appears. Callout: "Matched from the video's frames". |
| 28.1–37.0 | 03 Does the math | "Magkano nagastos ko sa GCash this week?" ₱2,095.00 total card plus 3 receipts. "Totals are summed in code, not by the model." Callout: "₱1,250 + ₱345 + ₱500, added in code". |
| 37.0–47.6 | 04 Keeps you in control | "May picture ba ako ng ID ko?" Four files flagged. The plan card asks before moving them to Documents/Private. Tap Move, the files move, Undo appears. Callout: "Nothing moves until you tap". |
| 47.6–54.6 | Why local AI | "Your files never leave the phone." Three tiles: works in airplane mode · no uploads, no account · Gemma 4 + EmbeddingGemma 2 on the phone. |
| 54.6–60.0 | Close | Icon, **AiFoundIt**, "Find any file by describing it.", "AppBuildersPH Hackathon 2026 · Local AI". |

## Sound

An original warm, mid-tempo track (96 BPM, D major / B minor). A soft pad and a pulse open the
hook, with the kick entering at the reveal and a lift into the close. UI sounds sit in key under
the music: quiet typing ticks, soft pops for result cards, and a two-note chime when the files
move. It ends on a resolved chord.

## Notes on claims

- No speed, accuracy or size numbers appear anywhere.
- The app's proof line ("Found in X s · on-device · N bytes sent") is left out of the phone screens.
  An earlier bug made the bytes counter misleading, so the video makes no bytes-sent claim.
- Every file name, amount and message comes from the app's sample corpus and UI strings.

## Build

- `work/player.html`: each frame is a pure function of `t` (`window.render(t)`).
- `work/capture.js`: puppeteer-core drives the installed Edge, with four workers piping JPEG
  frames into ffmpeg segments.
- `work/audio.js`: synthesizes the soundtrack and effects into `work/audio.wav`.
- ffmpeg joins the segments and the audio into `brag.mp4`. The poster frame is `brag.jpg`,
  baked in as frame 0.
