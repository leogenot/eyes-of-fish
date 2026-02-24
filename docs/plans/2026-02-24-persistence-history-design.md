# Persistence + Edit History Design
**Date:** 2026-02-24
**Approach:** A — IndexedDB (image) + LocalStorage (params) + in-memory history

## Goal
Survive page refresh with the same image and settings loaded; support unlimited undo/redo of parameter changes.

## New / Modified Files

| File | Change |
|---|---|
| `src/scripts/storage.ts` | New — IndexedDB + LocalStorage API |
| `src/scripts/app.ts` | Add history arrays, pushHistory/undo/redo, call storage on init/loadFile/render |
| `src/components/AppHeader.astro` | Add undo/redo buttons |
| `src/types/index.ts` | No changes needed |

## Storage Layer (`src/scripts/storage.ts`)

```
IndexedDB: db="eyes-of-fish", store="assets"
  "source-image" → Blob  (original file)

LocalStorage:
  "eof-params" → JSON string of FisheyeParams
```

```ts
export async function saveImage(blob: Blob): Promise<void>
export async function loadImage(): Promise<Blob | null>
export function saveParams(params: FisheyeParams): void
export function loadParams(): FisheyeParams | null
```

## History (app.ts)

New state fields:
```ts
past: [] as FisheyeParams[],
future: [] as FisheyeParams[],
```

Computed helpers (used by Alpine `:disabled`):
```ts
get canUndo() { return this.past.length > 0; }
get canRedo() { return this.future.length > 0; }
```

Methods:
```ts
pushHistory()  // snapshot {...this.params} → past, clear future
undo()         // pop past → params → push old to future → render
redo()         // pop future → params → push old to past → render
```

### When to call pushHistory()
- Sliders: `@pointerdown="pushHistory()"` (one entry per drag, not per pixel)
- Click-based changes: at start of handler (lens type, border color, flip, presets, resets)
- NOT on: tab change, grid options, image load (new image clears both arrays)

## Init Flow

```
init():
  1. engine.setCanvas(canvas)
  2. savedParams = loadParams() → if found, Object.assign(this.params, savedParams)
  3. blob = await loadImage() → if found:
       url = URL.createObjectURL(blob)
       img = new Image()
       img.onload = () => { engine.loadImage(img); hasImage=true; $nextTick(render) }
       img.src = url
  4. $watch activeTab (existing)
  5. window.addEventListener keydown for Ctrl+Z / Ctrl+Shift+Z
```

## Save Flow

- `loadFile(file)`: save original `file` blob to IndexedDB after engine.loadImage; clear past+future
- `render()`: after engine.render completes, call saveParams(this.params)

## Header UI

Undo `←` and redo `→` buttons added to AppHeader, left of Export:
```html
<button @click="undo()" :disabled="!canUndo" ...>←</button>
<button @click="redo()" :disabled="!canRedo" ...>→</button>
```
Keyboard: Ctrl+Z → undo, Ctrl+Shift+Z → redo (registered in init()).
