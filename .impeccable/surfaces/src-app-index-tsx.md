---
version: 1
slug: "src-app-index-tsx"
primary_target: "src/app/index.tsx"
related_targets: ["src/app/_layout.tsx"]
---

# Search (chat) surface

Mode: Operate. Platform: Android first (Material 3), Expo SDK 57.

## Audience and job
Everyday and privacy-minded Android users who need one specific file now; hackathon judges watching a live demo. Describe a file in plain words, get a short reply with tappable file cards, open it or confirm a proposed tidy-up.

## Scope
Production-grade search chat replacing the template tabs: first run + permission, indexing, replies with file cards, show more, no results, move proposal with confirm and undo snackbar, "why it matched" bottom sheet, history drawer. Runs on labelled demo data until the on-device model is wired in. Out of scope: settings, real AI, real file access.

## Direction contract
THESIS: The category standard, executed at Gemini/ChatGPT/Claude craft. Refuses decorative AI sparkle, gradients and glow; craft lives in spacing, type, state behavior and copy.
OWN-WORLD: Warm-neutral Material 3 surfaces (stone tonal ramp), one deep amber primary used only for the send button, primary actions and selection. Roboto on the M3 type scale. User turns in rounded tonal bubbles; assistant turns as plain text with outlined file cards. Material Symbols icons.
STORY: The user understands everything runs on this phone, believes it because the copy says so plainly and the index state is honest, and finds the file in one turn.
FIRST VIEWPORT: Top app bar (drawer button, "AiFoundIt", new chat). First run: centred promise headline, one-line privacy statement, filled "Allow file access" button. After access: "What are you looking for?" with four suggestion rows; composer pinned at the bottom above the keyboard, send button in amber.
FORM: Canon (category standard), chosen by the user after three rounds; seed key 72e57397.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
- Dynamic color (Material You): not adopted; static warm palette for now.
- On-device model name and real performance figures: unknown, never invented.
