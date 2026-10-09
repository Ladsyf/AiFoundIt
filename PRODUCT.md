# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

- **Everyday phone users** who can't find a screenshot, document, download, or photo buried somewhere on their phone, and whose storage has turned into a mess.
- **Privacy-conscious users** who want AI-powered search and organization but refuse to send their personal files to a cloud service.
- **Hackathon judges** watching a short live demo. The core value has to come across within seconds.

## Product Purpose

AiFoundIt helps people find and organize the files on their phone by describing what they're looking for in plain language ("the receipt from the hotel in Lisbon", "that screenshot of the wifi password"), with the AI running on the device. It then helps tidy what it finds. Success means a person locates a forgotten file faster than they could by browsing folders, and trusts the app enough to let it suggest how to organize their storage.

## Positioning

Plain-language search and organization across the whole phone, with on-device AI so files never leave the device. Cloud assistants can search files only by uploading them, and stock file managers search only by filename. AiFoundIt does neither.

## Operating Context

- Built Android-first, because Android allows the broadest file-system access. iOS is secondary. Cross-platform comes from Expo, but the design follows Android conventions first.
- Used in quick, purpose-driven moments: someone needs a specific file right now, often to share or act on it.
- Demonstrated live at a hackathon, so the first-run and search-to-result paths have to work reliably and read clearly on a projected or handheld screen.

## Capabilities and Constraints

- **Find:** search files on the device in plain language.
- **Organize:** suggest groupings, tags, moves, or cleanups for files on the device.
- **Files never leave the device.** No uploads, no cloud processing of file contents. This is a strict, non-negotiable commitment.
- **Works offline.** Search and organizing must work without a network connection.
- **Never auto-delete or auto-move.** Every destructive or relocating action needs explicit user confirmation.
- **On-device AI model:** chosen by the team, but not yet named in this file. Record it here once known.
- **Hackathon deadline:** scope is a demo build. The deadline date is not recorded yet.
- Stack: Expo SDK 57 + Expo Router, React Native 0.86, TypeScript. The repo is still the `create-expo-app` starter. No product UI exists yet.

## Brand Commitments

- Name: **AiFoundIt**.
- Voice: **calm and trustworthy**. Plain language that reassures and keeps privacy at the front, with no hype and no cute AI theatrics.
- The current app icon, splash, and colors are Expo template defaults, not brand assets.
- **Standing preference: the category standard.** AiFoundIt follows familiar AI-chat conventions rather than a distinctive visual concept. The bar is matching the craft of Gemini (Android), ChatGPT, and Claude. Chosen 2026-10-09, after three rounds of concept directions; the user had asked for minimal, warm, and not cold.

## Evidence on Hand

None yet: no users, testimonials, benchmarks, accuracy numbers, or performance claims. Future work must not invent search speed, accuracy, model size, or privacy certifications.

## Product Principles

1. **Privacy is the product.** Any feature that would need file contents to leave the device is out of scope.
2. **The user stays in control.** The AI suggests, the person decides. Nothing moves or disappears without confirmation.
3. **Finding comes first.** The search-to-result path is the core experience and the demo's centerpiece. Organizing builds on top of it.
4. **Earn trust by being transparent.** Show why a result matched and what an organizing action will do before it happens.
5. **Offline is the default.** Never design a flow that assumes a network connection.
