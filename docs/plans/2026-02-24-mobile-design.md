# Mobile-Friendly Layout — Design Doc

**Date:** 2026-02-24

## Overview

Make the Eyes of Fish editor usable on mobile phones. Desktop layout stays unchanged. On mobile, the sidebar becomes a collapsible bottom sheet with a drag handle and tab bar always visible.

## Layout

### Desktop (sm: and up)
No changes. Sidebar (w-64) on the left, canvas preview on the right, side by side.

### Mobile (below sm breakpoint)
- Body switches from `flex-row` to `flex-col`
- Canvas preview fills all available vertical space (`flex-1`)
- Bottom sheet is pinned to the bottom of the screen

## Bottom Sheet

```
┌─────────────────────────────┐
│   Canvas preview            │
│   (flex-1)                  │
├─────────────────────────────┤
│   ═══  ← drag handle        │  always visible (~32px)
│ [Fisheye] [Transform] [Img] │  tab bar
├─────────────────────────────┤
│  (scrollable controls)      │  ~45vh tall when open
└─────────────────────────────┘
```

**States:**
- **Collapsed** (default): handle + tab bar visible only (~56px)
- **Expanded**: handle + tab bar + scrollable controls (~45vh)

**Interactions:**
- Tapping the drag handle toggles open/closed
- Tapping a tab when closed → opens sheet and switches tab
- Tapping the active tab when open → closes sheet
- Height animated with CSS `transition: height`

**Alpine state:** Add `sheetOpen: false` to `fisheyeApp()` data

## Header (Mobile)

Hide on mobile to save vertical space:
- Subtitle text ("VX1000 · Century Optics") — hidden with `sm:block hidden`
- Aspect ratio selector — hidden with `sm:flex hidden`

Keep visible on mobile:
- App logo + title
- Undo / Redo buttons
- Export button

## File Upload (Mobile)

Drop zone copy changes to "Tap to choose a photo" on mobile (drag-and-drop is not available on touch). No `capture` attribute — use full photo library picker.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/index.astro` | Switch inner div to `flex-col` on mobile, `sm:flex-row` on desktop |
| `src/components/AppHeader.astro` | Hide subtitle and aspect ratio selector on mobile |
| `src/components/ControlPanel.astro` | Restructure as bottom sheet on mobile; add drag handle; wire `sheetOpen` toggle |
| `src/components/PreviewArea.astro` | Adjust drop zone copy on mobile |
| `src/scripts/app.ts` | Add `sheetOpen: false` to app state |
| `src/styles/global.css` | Add bottom sheet height transition styles |
