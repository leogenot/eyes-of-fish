# Persistence + Edit History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the source image (IndexedDB) and params (LocalStorage) across page refreshes, and add unlimited in-memory undo/redo of parameter changes.

**Architecture:** A new `storage.ts` module owns all browser-storage I/O. `app.ts` gains `past`/`future` history stacks, `pushHistory`/`undo`/`redo` methods, and calls storage in `init`, `loadFile`, and `render`. All sliders gain `@pointerdown="pushHistory()"` so a full drag = one history entry.

**Tech Stack:** Astro 5, AlpineJS 3, TypeScript, IndexedDB (native browser API), LocalStorage

**Verification commands:**
- `pnpm astro check` — 0 errors expected after every task
- `pnpm build` — exit 0 expected after final task
- Manual smoke test: `pnpm dev`, open browser

---

### Task 1: Create `src/scripts/storage.ts`

**Files:**
- Create: `src/scripts/storage.ts`

**Step 1: Create the file**

```ts
import type { FisheyeParams } from '../types/index.ts';

const DB_NAME = 'eyes-of-fish';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const IMAGE_KEY = 'source-image';
const PARAMS_KEY = 'eof-params';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveImage(blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(IMAGE_KEY);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export function saveParams(params: FisheyeParams): void {
  localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
}

export function loadParams(): FisheyeParams | null {
  const raw = localStorage.getItem(PARAMS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FisheyeParams;
  } catch {
    return null;
  }
}
```

**Step 2: Type-check**

```bash
cd /Users/leo/Sites/eyes-of-fish && pnpm astro check
```

Expected: 0 errors, 0 warnings.

**Step 3: Commit**

```bash
git add src/scripts/storage.ts
git commit -m "feat: add storage module (IndexedDB for image, LocalStorage for params)"
```

---

### Task 2: Update `app.ts` — add imports, history state, and history methods

**Files:**
- Modify: `src/scripts/app.ts`

**Step 1: Add import at the top of app.ts (after the existing imports)**

Replace the two existing import lines:
```ts
import { FisheyeEngine } from './engine.ts';
import type { FisheyeParams, GridOptions, ImageControls } from '../types/index.ts';
```
With:
```ts
import { FisheyeEngine } from './engine.ts';
import type { FisheyeParams, GridOptions, ImageControls } from '../types/index.ts';
import { saveImage, loadImage, saveParams, loadParams } from './storage.ts';
```

**Step 2: Add `past`, `future`, and history methods to the returned Alpine object**

After `imageControls: { ... } as ImageControls,` and before `init(this: any)`, add:

```ts
    past: [] as FisheyeParams[],
    future: [] as FisheyeParams[],

    get canUndo(): boolean { return this.past.length > 0; },
    get canRedo(): boolean { return this.future.length > 0; },

    pushHistory(this: any) {
      this.past.push({ ...this.params });
      this.future = [];
    },

    undo(this: any) {
      if (!this.past.length) return;
      this.future.push({ ...this.params });
      Object.assign(this.params, this.past.pop());
      this.render();
    },

    redo(this: any) {
      if (!this.future.length) return;
      this.past.push({ ...this.params });
      Object.assign(this.params, this.future.pop());
      this.render();
    },
```

**Step 3: Type-check**

```bash
pnpm astro check
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat: add past/future history stacks and pushHistory/undo/redo methods"
```

---

### Task 3: Update `app.ts` — `init()` restores persisted state + registers keyboard shortcuts

**Files:**
- Modify: `src/scripts/app.ts`

**Step 1: Replace the existing `init()` method**

Old:
```ts
    init(this: any) {
      engine.setCanvas(this.$refs.canvas);
      this.$watch('activeTab', (val: string) => {
        if (val === 'transform') this.$nextTick(() => this.drawGrid());
      });
    },
```

New:
```ts
    async init(this: any) {
      engine.setCanvas(this.$refs.canvas);

      // Restore saved params
      const savedParams = loadParams();
      if (savedParams) Object.assign(this.params, savedParams);

      // Restore saved image
      const blob = await loadImage();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          engine.loadImage(img);
          URL.revokeObjectURL(url);
          this.hasImage = true;
          this.$nextTick(() => this.render());
        };
        img.src = url;
      }

      // Watch tab changes
      this.$watch('activeTab', (val: string) => {
        if (val === 'transform') this.$nextTick(() => this.drawGrid());
      });

      // Keyboard shortcuts: Ctrl+Z / Cmd+Z = undo, +Shift or Ctrl+Y = redo
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) this.redo();
          else this.undo();
        }
        if (e.key === 'y') {
          e.preventDefault();
          this.redo();
        }
      });
    },
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat: restore persisted image and params on init, add keyboard shortcuts"
```

---

### Task 4: Update `app.ts` — `loadFile()` saves image + clears history

**Files:**
- Modify: `src/scripts/app.ts`

**Step 1: Replace the existing `loadFile()` method**

Old:
```ts
    loadFile(this: any, file: File) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        engine.loadImage(img);
        this.hasImage = true;
        this.$nextTick(() => this.render());
      };
      img.src = url;
    },
```

New:
```ts
    loadFile(this: any, file: File) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        engine.loadImage(img);
        URL.revokeObjectURL(url);
        saveImage(file);
        this.hasImage = true;
        this.past = [];
        this.future = [];
        this.$nextTick(() => this.render());
      };
      img.src = url;
    },
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat: save source image to IndexedDB on load, clear history on new image"
```

---

### Task 5: Update `app.ts` — `render()` saves params, preset/reset methods call `pushHistory()`

**Files:**
- Modify: `src/scripts/app.ts`

**Step 1: Replace `render()` — add `saveParams` after engine finishes**

Old:
```ts
    async render(this: any) {
      if (!this.hasImage || this.isRendering) return;
      this.isRendering = true;
      await new Promise<void>(r => setTimeout(r, 0));
      await engine.render({ ...this.params });
      this.isRendering = false;
      if (this.activeTab === 'transform') this.drawGrid();
    },
```

New:
```ts
    async render(this: any) {
      if (!this.hasImage || this.isRendering) return;
      this.isRendering = true;
      await new Promise<void>(r => setTimeout(r, 0));
      await engine.render({ ...this.params });
      this.isRendering = false;
      saveParams(this.params);
      if (this.activeTab === 'transform') this.drawGrid();
    },
```

**Step 2: Add `pushHistory()` at the start of each preset/reset method**

Replace `applyVX1000Preset`:
```ts
    applyVX1000Preset(this: any) {
      this.pushHistory();
      Object.assign(this.params, {
        distortion: 0.60, distortionType: 'circular',
        borderSize: 0.10, borderSoftness: 0.35, borderColor: 'black',
        fringeIntensity: 0.50, fringeRadius: 0.50,
        vignetteIntensity: 0.55, vignetteRadius: 0.40,
        contrast: 15, saturation: -8, shadows: -5,
      });
      this.render();
    },
```

Replace `resetTransform`:
```ts
    resetTransform(this: any) {
      this.pushHistory();
      Object.assign(this.params, { rotation: 0, zoom: 1, panX: 0, panY: 0, flipH: false, flipV: false });
      this.render();
    },
```

Replace `resetFisheye`:
```ts
    resetFisheye(this: any) {
      this.pushHistory();
      Object.assign(this.params, {
        distortion: 0, distortionType: 'circular',
        borderSize: 0, borderSoftness: 0.4, borderColor: 'black',
        fringeIntensity: 0, fringeRadius: 0.55,
        vignetteIntensity: 0, vignetteRadius: 0.45,
      });
      this.render();
    },
```

Replace `resetImage`:
```ts
    resetImage(this: any) {
      this.pushHistory();
      Object.assign(this.params, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0 });
      this.render();
    },
```

**Step 3: Type-check**

```bash
pnpm astro check
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat: save params after render, push history on presets and resets"
```

---

### Task 6: Add `@pointerdown="pushHistory()"` to all sliders

**Files:**
- Modify: `src/components/FisheyeTab.astro`
- Modify: `src/components/TransformTab.astro`

Note: `ImageTab.astro` sliders use `x-for` — history for those is handled via `@pointerdown` added to the template's input element.

**Step 1: In `FisheyeTab.astro` — add `@pointerdown="pushHistory()"` to every `<input type="range">`**

There are 6 range inputs in FisheyeTab. Each one currently looks like:
```html
<input type="range" min="..." max="..." step="..."
  x-model.number="params.X" @input="render()" class="w-full" />
```

Add `@pointerdown="pushHistory()"` to each:
```html
<input type="range" min="..." max="..." step="..."
  x-model.number="params.X" @pointerdown="pushHistory()" @input="render()" class="w-full" />
```

The 6 sliders are for: `distortion`, `borderSize`, `borderSoftness`, `fringeIntensity`, `fringeRadius`, `vignetteIntensity`, `vignetteRadius`. Add `@pointerdown="pushHistory()"` to every one.

Full updated FisheyeTab.astro:
```astro
---
---
<div x-show="activeTab === 'fisheye'" class="flex flex-col gap-0 p-3.5">

  <!-- Lens Type -->
  <div class="mb-4">
    <p class="section-label">Lens Type</p>
    <div class="flex gap-1.5">
      <button
        @click="pushHistory(); params.distortionType = 'circular'; render()"
        :class="params.distortionType === 'circular' ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all"
      >Circular</button>
      <button
        @click="pushHistory(); params.distortionType = 'full'; render()"
        :class="params.distortionType === 'full' ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all"
      >Full Frame</button>
    </div>
  </div>

  <!-- Distortion -->
  <div class="mb-4">
    <p class="section-label">Distortion</p>
    <div class="flex flex-col gap-3">
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Barrel Strength</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.distortion * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.distortion" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <!-- Circle Border -->
  <div class="mb-4">
    <p class="section-label">Circle Border</p>
    <div class="flex flex-col gap-3">
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Border Size</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.borderSize * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.borderSize" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Edge Softness</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.borderSoftness * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.borderSoftness" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Border Color</span>
        </div>
        <div class="flex gap-1.5">
          <button
            @click="pushHistory(); params.borderColor = 'black'; render()"
            :class="params.borderColor === 'black' ? 'border-blue-600' : 'border-[#333]'"
            class="flex-1 py-1.5 text-xs border rounded-md bg-black text-[#666] transition-all hover:border-[#555]"
          >Black</button>
          <button
            @click="pushHistory(); params.borderColor = 'white'; render()"
            :class="params.borderColor === 'white' ? 'border-blue-600' : 'border-[#333]'"
            class="flex-1 py-1.5 text-xs border rounded-md bg-white text-black transition-all hover:border-[#555]"
          >White</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Blue Fringe -->
  <div class="mb-4">
    <p class="section-label">Blue Fringe</p>
    <div class="flex flex-col gap-3">
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Intensity</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.fringeIntensity * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.fringeIntensity" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Start Radius</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.fringeRadius * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.fringeRadius" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <!-- Vignette -->
  <div class="mb-4">
    <p class="section-label">Vignette</p>
    <div class="flex flex-col gap-3">
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Intensity</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.vignetteIntensity * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.vignetteIntensity" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Radius</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.vignetteRadius * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.vignetteRadius" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <button
    @click="applyVX1000Preset()"
    class="w-full py-2 text-xs border border-[#2a2a2a] rounded-md text-[#888] hover:text-white hover:border-blue-600 transition-all mt-1"
  >
    Apply VX1000 Preset
  </button>
  <button
    @click="resetFisheye()"
    class="w-full py-2 text-xs border border-[#1f1f1f] rounded-md text-[#555] hover:text-[#999] transition-all mt-1.5"
  >
    Reset Fisheye
  </button>
</div>
```

**Step 2: In `TransformTab.astro` — add `@pointerdown="pushHistory()"` to every `<input type="range">` and `pushHistory()` to flip button clicks**

Full updated TransformTab.astro:
```astro
---
---
<div x-show="activeTab === 'transform'" class="flex flex-col gap-0 p-3.5">

  <!-- Rotation -->
  <div class="mb-4">
    <p class="section-label">Rotation</p>
    <div>
      <div class="flex justify-between mb-1.5">
        <span class="text-xs text-[#666]">Angle</span>
        <span class="text-xs text-[#888] font-mono" x-text="params.rotation + '°'"></span>
      </div>
      <input type="range" min="-180" max="180" step="0.5"
        x-model.number="params.rotation" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      <button
        x-show="params.rotation !== 0"
        @click="pushHistory(); params.rotation = 0; render()"
        class="mt-1.5 text-xs text-[#444] hover:text-[#888] transition-colors"
      >↩ Reset to 0°</button>
    </div>
  </div>

  <!-- Zoom / Crop -->
  <div class="mb-4">
    <p class="section-label">Zoom / Crop</p>
    <div class="flex flex-col gap-3">
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Zoom</span>
          <span class="text-xs text-[#888] font-mono" x-text="params.zoom.toFixed(2) + '×'"></span>
        </div>
        <input type="range" min="0.5" max="3" step="0.01"
          x-model.number="params.zoom" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Pan X</span>
          <span class="text-xs text-[#888] font-mono" x-text="(params.panX >= 0 ? '+' : '') + Math.round(params.panX * 100) + '%'"></span>
        </div>
        <input type="range" min="-0.5" max="0.5" step="0.005"
          x-model.number="params.panX" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Pan Y</span>
          <span class="text-xs text-[#888] font-mono" x-text="(params.panY >= 0 ? '+' : '') + Math.round(params.panY * 100) + '%'"></span>
        </div>
        <input type="range" min="-0.5" max="0.5" step="0.005"
          x-model.number="params.panY" @pointerdown="pushHistory()" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <!-- Flip -->
  <div class="mb-4">
    <p class="section-label">Flip</p>
    <div class="flex gap-1.5">
      <button
        @click="pushHistory(); params.flipH = !params.flipH; render()"
        :class="params.flipH ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all flex items-center justify-center gap-1.5"
      >
        <svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2v12M5 5l-3 3 3 3M11 5l3 3-3 3"/>
        </svg>
        Horizontal
      </button>
      <button
        @click="pushHistory(); params.flipV = !params.flipV; render()"
        :class="params.flipV ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all flex items-center justify-center gap-1.5"
      >
        <svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 8h12M5 5l3-3 3 3M5 11l3 3 3-3"/>
        </svg>
        Vertical
      </button>
    </div>
  </div>

  <!-- Grid Overlay -->
  <div class="mb-4">
    <p class="section-label">Grid Overlay</p>
    <div class="flex flex-col gap-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" x-model="gridOptions.thirds" @change="drawGrid()"
          class="w-3 h-3 accent-blue-500" />
        <span class="text-xs text-[#666]">Rule of Thirds</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" x-model="gridOptions.fine" @change="drawGrid()"
          class="w-3 h-3 accent-blue-500" />
        <span class="text-xs text-[#666]">Fine Grid</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" x-model="gridOptions.diagonal" @change="drawGrid()"
          class="w-3 h-3 accent-blue-500" />
        <span class="text-xs text-[#666]">Diagonals</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" x-model="gridOptions.circle" @change="drawGrid()"
          class="w-3 h-3 accent-blue-500" />
        <span class="text-xs text-[#666]">Fisheye Circle Guide</span>
      </label>
    </div>
  </div>

  <button
    @click="resetTransform()"
    class="w-full py-2 text-xs border border-[#1f1f1f] rounded-md text-[#555] hover:text-[#999] transition-all mt-1"
  >
    Reset Transform
  </button>
</div>
```

**Step 3: In `ImageTab.astro` — add `@pointerdown="pushHistory()"` to the `x-for` range input**

The image tab uses Alpine `x-for` to render sliders. Add `@pointerdown="pushHistory()"` to the single `<input type="range">` inside the template:

Old:
```html
<input type="range"
  :min="ctrl.min" :max="ctrl.max" :step="ctrl.step"
  x-model.number="params[ctrl.key]"
  @input="render()"
  class="w-full" />
```

New:
```html
<input type="range"
  :min="ctrl.min" :max="ctrl.max" :step="ctrl.step"
  x-model.number="params[ctrl.key]"
  @pointerdown="pushHistory()"
  @input="render()"
  class="w-full" />
```

Apply this change to **both** `x-for` loops in ImageTab.astro (the light group and the color group).

**Step 4: Type-check**

```bash
pnpm astro check
```

Expected: 0 errors.

**Step 5: Commit**

```bash
git add src/components/FisheyeTab.astro src/components/TransformTab.astro src/components/ImageTab.astro
git commit -m "feat: push history on pointerdown for all sliders and on click-based param changes"
```

---

### Task 7: Update `AppHeader.astro` — add undo/redo buttons

**Files:**
- Modify: `src/components/AppHeader.astro`

**Step 1: Replace AppHeader.astro entirely**

```astro
---
---
<header class="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] shrink-0 bg-[#0d0d0d]">
  <div class="flex items-center gap-3">
    <div class="w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-xs">
      <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4 text-blue-400" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="9"/>
        <ellipse cx="12" cy="12" rx="4" ry="9"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
      </svg>
    </div>
    <span class="text-sm font-semibold tracking-wide text-white">Eyes of Fish</span>
    <span class="text-xs text-[#444] ml-1">VX1000 · Century Optics</span>
  </div>
  <div class="flex items-center gap-2">
    <!-- Aspect ratio selector -->
    <div class="flex items-center gap-1 bg-[#151515] rounded-md p-0.5 border border-[#222]">
      <template x-for="ar in ['4:3','3:2','1:1','16:9']">
        <button
          @click="params.aspectRatio = ar; render()"
          :class="params.aspectRatio === ar ? 'bg-[#252525] text-white' : 'text-[#555] hover:text-[#999]'"
          class="px-2.5 py-1 rounded text-xs font-mono transition-all"
          x-text="ar"
        ></button>
      </template>
    </div>
    <!-- Undo / Redo -->
    <div class="flex items-center gap-1">
      <button
        @click="undo()"
        :disabled="!canUndo"
        title="Undo (Ctrl+Z)"
        class="flex items-center justify-center w-7 h-7 rounded-md border border-[#222] text-[#555] hover:text-[#999] hover:border-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5" stroke="currentColor" stroke-width="1.8">
          <path d="M3 7H10.5C12.4 7 14 8.6 14 10.5C14 12.4 12.4 14 10.5 14H7"/>
          <path d="M5.5 4.5L3 7L5.5 9.5"/>
        </svg>
      </button>
      <button
        @click="redo()"
        :disabled="!canRedo"
        title="Redo (Ctrl+Shift+Z)"
        class="flex items-center justify-center w-7 h-7 rounded-md border border-[#222] text-[#555] hover:text-[#999] hover:border-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5" stroke="currentColor" stroke-width="1.8">
          <path d="M13 7H5.5C3.6 7 2 8.6 2 10.5C2 12.4 3.6 14 5.5 14H9"/>
          <path d="M10.5 4.5L13 7L10.5 9.5"/>
        </svg>
      </button>
    </div>
    <!-- Export button -->
    <button
      @click="exportImage()"
      :disabled="!hasImage"
      class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#1a1a1a] disabled:text-[#444] text-white text-xs font-medium rounded-md transition-colors"
    >
      <svg viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5" stroke="currentColor" stroke-width="1.8">
        <path d="M8 2v8M5 7l3 3 3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
      </svg>
      Export
    </button>
  </div>
</header>
```

**Step 2: Type-check and build**

```bash
pnpm astro check && pnpm build
```

Expected: 0 errors, exit 0.

**Step 3: Manual smoke test**

```bash
pnpm dev
```

Open `http://localhost:4321`. Verify:
- Drop an image — renders, page title/UI appears
- Adjust a slider — undo button becomes active
- Ctrl+Z — param reverts, canvas re-renders
- Ctrl+Shift+Z — param re-applies
- Refresh page — same image and same param values restored
- Load a new image — history clears (undo button greyed out again)
- Aspect ratio change triggers re-render with saved params on next refresh

**Step 4: Commit**

```bash
git add src/components/AppHeader.astro
git commit -m "feat: add undo/redo buttons to header with disabled state and keyboard shortcut hints"
```
