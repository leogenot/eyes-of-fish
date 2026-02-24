# Mobile-Friendly Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Eyes of Fish editor usable on mobile via a collapsible bottom sheet, keeping the desktop layout completely unchanged.

**Architecture:** Tailwind `sm:` breakpoint (≥640px) overrides for static layout; a custom CSS class `.sheet-content` with `@media (max-width: 639px)` handles the height animation; Alpine's `sheetOpen` boolean toggles the `.open` class. Fixed positioning removes the panel from normal flow on mobile.

**Tech Stack:** Astro, Alpine.js, Tailwind CSS v4 (`@import "tailwindcss"`)

---

### Task 1: Add `sheetOpen` state to Alpine app

**Files:**
- Modify: `src/scripts/app.ts:11`

**Step 1: Add `sheetOpen` after `activeTab`**

In `fisheyeApp()`, add one line:

```ts
activeTab: 'fisheye' as string,
sheetOpen: false as boolean,
```

**Step 2: Verify dev server compiles cleanly**

Run: `pnpm dev`
Expected: No TypeScript errors, server starts.

**Step 3: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat(mobile): add sheetOpen state to Alpine app"
```

---

### Task 2: Responsive header — hide non-essential elements on mobile

**Files:**
- Modify: `src/components/AppHeader.astro`

**Step 1: Hide the subtitle on mobile**

Change:
```html
<span class="text-xs text-[#444] ml-1">VX1000 · Century Optics</span>
```
To:
```html
<span class="hidden sm:inline text-xs text-[#444] ml-1">VX1000 · Century Optics</span>
```

**Step 2: Hide the aspect ratio selector on mobile**

Change the outer div of the aspect ratio selector:
```html
<div class="flex items-center gap-1 bg-[#151515] rounded-md p-0.5 border border-[#222]">
```
To:
```html
<div class="hidden sm:flex items-center gap-1 bg-[#151515] rounded-md p-0.5 border border-[#222]">
```

**Step 3: Verify in browser at mobile viewport (≤375px)**

Open browser devtools, set to iPhone size. Confirm:
- Subtitle "VX1000 · Century Optics" is hidden
- Aspect ratio buttons are hidden
- Logo, title, undo/redo, export remain visible
- Desktop (≥640px) shows everything as before

**Step 4: Commit**

```bash
git add src/components/AppHeader.astro
git commit -m "feat(mobile): hide subtitle and aspect ratio selector on small screens"
```

---

### Task 3: Add bottom sheet CSS to global styles

**Files:**
- Modify: `src/styles/global.css`

**Step 1: Append mobile sheet styles**

Add at the end of `global.css`:

```css
/* Mobile bottom sheet panel */
@media (max-width: 639px) {
  .sheet-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-in-out;
  }
  .sheet-content.open {
    max-height: 45vh;
    overflow-y: auto;
  }
}
```

**Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(mobile): add bottom sheet height transition styles"
```

---

### Task 4: Restructure ControlPanel as mobile bottom sheet

**Files:**
- Modify: `src/components/ControlPanel.astro`

This is the biggest change. Replace the entire file with:

```astro
---
import FisheyeTab from './FisheyeTab.astro';
import TransformTab from './TransformTab.astro';
import ImageTab from './ImageTab.astro';
---
<aside class="
  fixed inset-x-0 bottom-0 z-20 flex flex-col bg-[#0d0d0d] border-t border-[#1a1a1a]
  sm:static sm:inset-auto sm:z-auto sm:w-64 sm:shrink-0 sm:border-t-0 sm:border-r sm:border-[#1a1a1a] sm:overflow-y-auto
">

  <!-- Drag handle (mobile only) -->
  <div
    class="sm:hidden flex justify-center items-center h-8 shrink-0 cursor-pointer"
    @click="sheetOpen = !sheetOpen"
  >
    <div class="w-10 h-1 rounded-full bg-[#333]"></div>
  </div>

  <!-- Tab switcher -->
  <div class="flex border-b border-[#1a1a1a] shrink-0">
    <button
      @click="sheetOpen = activeTab === 'fisheye' ? !sheetOpen : true; activeTab = 'fisheye'"
      :class="activeTab === 'fisheye' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Fisheye</button>
    <button
      @click="sheetOpen = activeTab === 'transform' ? !sheetOpen : true; activeTab = 'transform'"
      :class="activeTab === 'transform' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Transform</button>
    <button
      @click="sheetOpen = activeTab === 'image' ? !sheetOpen : true; activeTab = 'image'"
      :class="activeTab === 'image' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Image</button>
  </div>

  <!-- Scrollable content (height-animated on mobile, always visible on desktop) -->
  <div
    class="sheet-content sm:flex-1 sm:overflow-y-auto"
    :class="sheetOpen ? 'open' : ''"
  >
    <FisheyeTab />
    <TransformTab />
    <ImageTab />
  </div>

</aside>
```

**Step 2: Verify tab toggle behaviour in mobile viewport**

- Sheet starts collapsed (only handle + tab bar visible)
- Tapping "Fisheye" opens the sheet
- Tapping "Fisheye" again closes the sheet
- Tapping "Transform" while "Fisheye" sheet is open → switches tab, stays open
- Drag handle also toggles open/closed

**Step 3: Verify desktop is unchanged**

At ≥640px:
- Sidebar is 256px wide on the left
- All three tabs work as before
- No visible handle

**Step 4: Commit**

```bash
git add src/components/ControlPanel.astro
git commit -m "feat(mobile): restructure control panel as collapsible bottom sheet"
```

---

### Task 5: Add bottom padding to preview area on mobile

**Files:**
- Modify: `src/components/PreviewArea.astro`

The bottom sheet is ~68px tall when collapsed (handle 32px + tab bar ~36px). Add padding so the canvas isn't hidden behind it, and update the drop zone copy for touch devices.

**Step 1: Add `pb-20 sm:pb-0` to the `<main>` element**

Change:
```html
<main class="flex-1 flex flex-col items-center justify-center bg-[#080808] relative overflow-hidden">
```
To:
```html
<main class="flex-1 flex flex-col items-center justify-center bg-[#080808] relative overflow-hidden pb-20 sm:pb-0">
```

**Step 2: Update drop zone copy for mobile**

Change:
```html
<p class="text-sm text-[#555] font-medium">Drop an image here</p>
<p class="text-xs text-[#333] mt-1">or click to browse</p>
```
To:
```html
<p class="text-sm text-[#555] font-medium">
  <span class="hidden sm:inline">Drop an image here</span>
  <span class="sm:hidden">Tap to choose a photo</span>
</p>
<p class="hidden sm:block text-xs text-[#333] mt-1">or click to browse</p>
```

**Step 3: Verify on mobile**

- With no image: drop zone is fully visible above the sheet
- "Tap to choose a photo" shown on mobile
- "Drop an image here / or click to browse" shown on desktop
- With image loaded: canvas is not clipped by the bottom sheet when collapsed

**Step 4: Commit**

```bash
git add src/components/PreviewArea.astro
git commit -m "feat(mobile): add preview area bottom padding and mobile drop zone copy"
```

---

### Task 6: Smoke test full mobile flow

**Step 1: Open in mobile browser or devtools device emulation (375×812)**

- [ ] Page loads without horizontal scroll
- [ ] Header shows logo, title, undo, redo, export — no aspect ratio selector
- [ ] Canvas area fills most of the screen
- [ ] Bottom sheet shows handle + 3 tabs, collapsed
- [ ] Tapping a tab opens the sheet with the correct controls
- [ ] Tapping the active tab closes the sheet
- [ ] Tapping the handle toggles the sheet
- [ ] Sliders are usable with touch
- [ ] Tapping drop zone opens the system photo picker
- [ ] Loading an image renders correctly
- [ ] Export works (downloads file)

**Step 2: Open at desktop size (1280px)**

- [ ] Layout identical to before: sidebar left, canvas right
- [ ] Aspect ratio selector visible in header
- [ ] No drag handle visible
- [ ] All tabs switch content without affecting sheetOpen

**Step 3: Commit (if any minor fixes were made)**

```bash
git add -p
git commit -m "fix(mobile): smoke test corrections"
```
