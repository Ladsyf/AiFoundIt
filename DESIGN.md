---
name: AiFoundIt
description: On-device AI file search for Android — familiar AI-chat conventions executed in warm Material 3.
colors:
  primary: "#8B5000"
  on-primary: "#FFFFFF"
  primary-container: "#FFDCBE"
  on-primary-container: "#2C1600"
  secondary-container: "#F1E0D2"
  on-secondary-container: "#2A1A0E"
  surface: "#FBFAF8"
  surface-container-low: "#F5F3F0"
  surface-container: "#EFECE8"
  surface-container-high: "#E9E5E0"
  surface-container-highest: "#E2DED8"
  on-surface: "#1D1B19"
  on-surface-variant: "#57524C"
  outline: "#857F78"
  outline-variant: "#D8D2CB"
  inverse-surface: "#33302D"
  inverse-on-surface: "#F6F0EA"
  inverse-primary: "#FFB870"
  error: "#BA1A1A"
  scrim: "rgba(0,0,0,0.32)"
  primary-dark: "#FFB870"
  on-primary-dark: "#4A2800"
  primary-container-dark: "#6A3C00"
  on-primary-container-dark: "#FFDCBE"
  secondary-container-dark: "#4A3A2D"
  on-secondary-container-dark: "#F1E0D2"
  surface-dark: "#151311"
  surface-container-low-dark: "#1D1B19"
  surface-container-dark: "#221F1D"
  surface-container-high-dark: "#2C2927"
  surface-container-highest-dark: "#373431"
  on-surface-dark: "#E9E2DC"
  on-surface-variant-dark: "#CFC6BD"
  outline-dark: "#999088"
  outline-variant-dark: "#4A4540"
  inverse-surface-dark: "#E9E2DC"
  inverse-on-surface-dark: "#33302D"
  inverse-primary-dark: "#8B5000"
  error-dark: "#FFB4AB"
  scrim-dark: "rgba(0,0,0,0.5)"
typography:
  headline-small:
    fontFamily: "sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.33
  title-large:
    fontFamily: "sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.27
  title-medium:
    fontFamily: "sans-serif-medium"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.15px"
  title-small:
    fontFamily: "sans-serif-medium"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: "0.1px"
  body-large:
    fontFamily: "sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.25px"
  body-medium:
    fontFamily: "sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "0.25px"
  body-small:
    fontFamily: "sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "0.4px"
  label-large:
    fontFamily: "sans-serif-medium"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: "0.1px"
  label-medium:
    fontFamily: "sans-serif-medium"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.5px"
rounded:
  small: "8px"
  medium: "12px"
  large: "16px"
  extra-large: "28px"
  full: "999px"
spacing:
  half: "2px"
  one: "4px"
  two: "8px"
  three: "12px"
  four: "16px"
  five: "24px"
  six: "32px"
  seven: "48px"
components:
  button-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0px 24px"
    height: "48px"
  button-tonal:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0px 24px"
    height: "48px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0px 12px"
    height: "48px"
  icon-button-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    size: "48px"
  icon-button-filled-disabled:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    size: "48px"
  icon-button-standard:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.full}"
    size: "48px"
  composer:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-large}"
    rounded: "{rounded.extra-large}"
    padding: "4px 4px 4px 24px"
    height: "56px"
  user-bubble:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-large}"
    rounded: "20px 20px 4px 20px"
    padding: "12px 16px"
  file-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.medium}"
    padding: "8px"
  proposal-card:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "16px"
  bottom-sheet:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "28px 28px 0px 0px"
    padding: "0px 24px"
  snackbar:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-on-surface}"
    typography: "{typography.body-medium}"
    rounded: "{rounded.small}"
    padding: "12px 4px 12px 16px"
    height: "48px"
  drawer-item-selected:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    typography: "{typography.label-large}"
    rounded: "{rounded.full}"
    padding: "0px 16px"
    height: "56px"
---

# Design System: AiFoundIt

## Overview

**Creative North Star: "The Category Standard, Warm"**

AiFoundIt deliberately follows familiar AI-chat conventions — the Gemini/ChatGPT/Claude pattern — rather than a distinctive visual concept, and the entire design effort goes into executing that canon at high craft. The warmth the user asked for ("minimal, warm, and not cold") comes from a warm-neutral stone palette and a single deep amber accent, not from decoration. There is no AI sparkle, no gradient, no glow; the craft lives in spacing, type scale, state behavior, and honest copy.

The system is a React Native implementation of Material 3, expressed as a JS theme object (`src/constants/theme.ts`) with paired light and dark palettes. All color, type, spacing, and radius values are consumed through role names via `useTheme()` — components never hard-code hex. Surfaces layer tonally; outlined cards carry structure instead of shadows. Copy does design work: privacy promises are stated plainly ("Nothing is uploaded"), index state is shown honestly ("Still indexing, so some files may not show up yet"), and the demo is labeled as sample data.

**Key Characteristics:**
- Single deep amber accent reserved for send, primary actions, selection, and progress
- Warm-neutral stone surface ramp, tonal layering instead of shadows
- Roboto (platform `sans-serif`) on the Material 3 type scale — no display face
- Pill-shaped buttons and list items; outlined file and suggestion cards
- Chat asymmetry: user turns in tonal bubbles, assistant turns as plain text with cards
- Material Symbols icons; state communicated through Android ripples and snackbar feedback

## Colors

A warm-neutral "stone" tonal ramp with one deep amber primary; both light and dark schemes are first-class tokens.

### Primary
- **Deep Amber** (#8B5000 / dark #FFB870): The only accent in the system. Filled send button, filled primary buttons, text-button labels, selection cursor, progress bar, search spinner, and the move-proposal check icon. Its rarity is the point — it means "act" everywhere it appears.
- **Amber Wash** (primaryContainer #FFDCBE / dark #6A3C00; on #2C1600 / dark #FFDCBE): Tonal badge surfaces that pair with the primary — the lock badge on the access request. Decorative-adjacent but tonal, never saturated.

### Secondary
- **Warm Sand** (secondaryContainer #F1E0D2 / dark #4A3A2D; on #2A1A0E / dark #F1E0D2): Tonal buttons ("New search", "Share"), the selected state in the history drawer, and the progress-bar track. This is the system's quiet action color.

### Neutral
- **Stone Paper** (surface #FBFAF8 / dark #151311): Screen background and card fill.
- **Stone Step 1–4** (surfaceContainerLow #F5F3F0 → surfaceContainerHighest #E2DED8; dark #1D1B19 → #373431): The layering ramp. Composer and chat bubbles sit on High; sheets, drawers, and proposal cards sit on Low.
- **Warm Ink** (onSurface #1D1B19 / dark #E9E2DC): Primary text and icons at full importance.
- **Muted Stone** (onSurfaceVariant #57524C / dark #CFC6BD): Secondary text, placeholder text, standard icon buttons, metadata.
- **Stone Line** (outlineVariant #D8D2CB / dark #4A4540): All structural hairlines — card borders, dividers, ripple tint. **Stone Outline** (outline #857F78 / dark #999088) is the stronger stroke, used only for the sheet drag handle.

### Inverse (snackbar set)
- **Warm Charcoal** (inverseSurface #33302D / dark #E9E2DC) with **Cream** text (inverseOnSurface #F6F0EA / dark #33302D) and **Light Amber** action (inversePrimary #FFB870 / dark #8B5000): The snackbar's inverted palette — the one place dark fills light mode.

### Reserved
- **Signal Red** (error #BA1A1A / dark #FFB4AB): Defined in the theme for future error states; no current surface consumes it.
- **Scrim** (rgba(0,0,0,0.32) / dark 0.5): Modal and drawer dimming only.

### Named Rules
**The One Accent Rule.** Amber primary is reserved for send, primary actions, selection, progress, and the confirming check. It is never decoration, never a large fill, never a background tint on its own. If a new screen needs emphasis, reach for tonal surfaces first.

**The Ramp, Not the Shadow Rule.** Depth is conveyed by stepping up the surface ramp and outlining with Stone Line — not by elevation. New surfaces pick a ramp step, not a shadow.

## Typography

**Display / Body Font:** Roboto via the platform `sans-serif` family alias (Android); system default elsewhere — resolved through `Platform.select`, never a bundled typeface.
**Label/Mono Font:** none — labels share the same family at medium weight (`sans-serif-medium` on Android).

**Character:** Unbranded platform sans-serif on the Material 3 scale. The system deliberately has no display face and no custom type; typography signals "Android done well," and character comes from scale discipline and quiet letter-spacing.

### Hierarchy
- **Headline** (400, 24px/32): Promise headlines — "Find any file by describing it", "What are you looking for?" First-run and empty-state voice only.
- **Title Large** (400, 22px/28): The top app bar conversation title.
- **Title Medium** (500, 16px/24, +0.15): Card headers — the move-proposal question, sheet filename.
- **Title Small** (500, 14px/20, +0.1): Drawer section labels and brand line.
- **Body Large** (400, 16px/24, +0.25): The default reading voice — assistant replies, user bubbles, composer input, suggestion rows, privacy statements.
- **Body Medium** (400, 14px/20, +0.25): Secondary content — file metadata inside sheets, proposal file lists, snackbar text, empty states.
- **Body Small** (400, 12px/16, +0.4): Captions, disclaimers, index counts, drawer footer.
- **Label Large** (500, 14px/20, +0.1): All button labels and file names on cards.
- **Label Medium** (500, 12px/16, +0.5): Tiny labels — drawer timestamps, "Why it matched" heading.

### Named Rules
**The System Face Rule.** Type comes from the platform (`sans-serif` / `sans-serif-medium` on Android, system default elsewhere). No bundled display face, no brand font. Icons are Material Symbols via `expo-symbols`; they are iconography, not a typeface decision.

**The Two-Weight Rule.** UI text runs at 400 or 500 only. (A lone 600 appears inside simulated file-thumbnail previews, where it imitates app content rather than UI chrome — it is not a UI weight.)

## Layout

Single-column chat on a warm paper field, centered and capped at a maximum content width (720px) so wide screens never stretch the conversation. A 64px top app bar (menu icon, conversation title, new-search action) sits under the status bar via safe-area insets. The composer is pinned above the keyboard with safe-area bottom padding; the snackbar overlays the slot just above it. Message lists breathe at 24px gaps with 16px side padding. First run centers vertically with a 340px measure on the privacy line; the suggestions state anchors to the bottom, just above the composer, as four full-width rows.

The spacing scale is a named ramp — half/one/two/three/four/five/six/seven at 2/4/8/12/16/24/32/48px — and components consume it by name. 8px and 12px do most of the work inside cards and rows; 16px is the standard content inset; 24px separates conversation turns.

## Elevation & Depth

Flat tonal layering, no ambient shadows. Hierarchy comes from the stone surface ramp plus hairline Stone Line borders; modals dim with the scrim rather than lifting. The single exception is the snackbar, which carries a small platform shadow (0 3px 6px rgba(0,0,0,0.2), elevation 6) because it floats over active content.

### Shadow Vocabulary
- **Snackbar Float** (`0 3px 6px rgba(0,0,0,0.2)`; Android elevation 6): The only shadow in the system. Reserved for the transient snackbar that must read above the composer and list.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and in state. Press feedback is an Android ripple tinted with Stone Line (or translucent on-primary on filled buttons) — not a lift. If content must overlay the canvas, use a sheet or snackbar, not a floating card.

## Shapes

A five-step rounded-rectangle family: 8px for small frames (snackbar, thumbnails), 12px for outlined cards and suggestion rows, 16px for proposal cards, drawer corners, and tonal badges, 28px for bottom-sheet top corners and the composer, and full pill (999px) for all buttons, icon buttons, and drawer items. The signature silhouette is the asymmetric user bubble — 20px radius with the trailing corner tightened to 4px — the classic chat tail executed in tonal rather than colored fill. Borders are structural hairlines on the surface color, never decorative strokes.

## Components

### Buttons
- **Shape:** Fully rounded pill (999px radius), 48px minimum height.
- **Primary (filled):** Deep Amber fill with white label; reserved for the one forward action per context ("Allow file access", "Move N files"). 24px horizontal padding (16px leading when an icon is present).
- **Tonal:** Warm Sand fill for supporting actions ("New search", "Share").
- **Text:** Transparent with Deep Amber label for low-emphasis actions ("Cancel", "Show 7 more").
- **State:** Android ripple — translucent white on filled, Stone Line tint on tonal/text. Disabled filled icon buttons drop to the highest stone step at 38% opacity.

### Icon Buttons
- **Style:** 48px circle. Standard form is a bare Muted Stone icon (menu, new chat); the filled form is a Deep Amber circle with white icon — currently only the send button.
- **State:** Borderless ripple on standard, bounded on filled; disabled uses the highest stone fill with a dimmed icon.

### Composer
- **Style:** A rounded container on Stone Step 3 (28px radius, 56px min height) holding a Body Large multiline input and the filled amber send button. Text padding is asymmetric: 24px leading, 4px around the send circle.
- **State:** Cursor and selection run in Deep Amber; the placeholder ("Describe a file") sits in Muted Stone; the send button disables until text exists.

### Chat Turns
- **User bubble:** Right-aligned tonal bubble on Stone Step 3, 20px radius with a 4px trailing corner, 12×16px padding, capped at 82% width.
- **Assistant turn:** No bubble — plain Body Large text on the paper surface, then a two-column grid of file cards, then optional "Show N more" text button or proposal card. Turns fade-and-rise 280ms on entry; reduced-motion disables the animation.
- **Searching state:** A small amber spinner with "Searching this phone…" — honest, unpadded, no shimmer or skeleton theatrics.

### Cards / Containers
- **File card:** Paper surface with a 1px Stone Line border and 12px radius, 8px internal padding; a 128px tonal thumbnail, a Label Large filename, and a Body Small date·folder line. Cards are outlined, never shadowed.
- **Suggestion row:** Full-width outlined row (1px Stone Line, 12px radius, 56px min height) with a 20px Muted Stone icon and Body Large text.
- **Proposal card:** Stone Step 1 surface with a 1px border and 16px radius/padding; amber move icon, a Title Medium question, a 3-file preview list, and a text-cancel / filled-confirm action pair. Outcomes render as an inline status line — never a toast for confirmation state.

### Bottom Sheet
- **Style:** Stone Step 1 sheet rounded at the top only (28px), max 88% height, over the scrim. A 32×4px drag handle in Stone Outline at 40% opacity centers above 24px-padded content. Slides up on entry; reduced-motion shows instantly.
- **Content pattern:** Large preview, filename + metadata, then a tonal "Why it matched" block — the product's transparency promise rendered as a labeled surface, not a tooltip.

### Snackbar
- **Style:** Warm Charcoal fill, Cream Body Medium text, Light Amber action label; 8px radius, 48px min height, screen margins of 16px. Carries the system's only shadow.
- **Behavior:** Auto-dismisses after 6s; the action (e.g. "Undo") is the inverted amber — the only place amber appears on dark fill in light mode.

### Navigation
- **Top app bar:** 64px row — menu icon, Title Large conversation name, new-search icon. No elevation, no divider; the title is the only text.
- **History drawer:** 320px Stone Step 1 panel sliding over the scrim, 16px trailing corners. Items are full pills (56px) that fill Warm Sand when selected; a tonal "New search" button heads the list; a lock icon + Body Small footer restates that searches stay on the phone.

### Linear Progress
- **Style:** 4px track in Warm Sand with a Deep Amber bar — indexing state is shown as an honest count ("Indexing files on this phone · 4,210 of 12,408"), never a fake-complete shimmer.

## Do's and Don'ts

### Do:
- **Do** reserve Deep Amber for send, primary actions, selection, and progress — tonal surfaces do the rest of the work.
- **Do** outline cards with a 1px Stone Line border on the paper surface instead of adding elevation.
- **Do** state privacy and data status in plain Body Small copy ("This preview uses sample files", "Still indexing, so some files may not show up yet") — honesty is a visual element here.
- **Do** honor reduced motion: entry animations (280ms fade-and-rise, sheet slide) drop to instant when the system requests it.
- **Do** pick surface steps off the ramp by role — sheets/drawers/proposals on Low, composer and bubbles on High, disabled fills on Highest.

### Don't:
- **Don't** add decorative AI effects — no sparkle icons, gradients, glows, shimmer skeletons, or branded mascot moments; the chosen direction is the category standard.
- **Don't** introduce shadows on cards, buttons, or bars — the snackbar is the sole shadowed element.
- **Don't** introduce a second accent hue or a display typeface; the system is one amber plus stone, one platform sans.
- **Don't** treat the current app icon, adaptive icon background (#E6F4FE), or splash screen (#208AEF) as palette — they are Expo template defaults disclosed in PRODUCT.md, a known carry-over awaiting brand assets, not design decisions.
- **Don't** auto-emphasize with caps or heavy weights; UI type stays at 400/500, and destructive or relocating actions always present a confirm affordance, never just styling.
