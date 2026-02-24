# Component Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the monolithic `src/pages/index.astro` (736 lines) into focused Astro components, convert the JS engine to TypeScript, and move the Alpine factory to a typed module.

**Architecture:** AlpineJS `x-data="fisheyeApp()"` on `<body>` provides shared reactive state to all child components — Astro components are static HTML renderers, no Astro props needed. `engine.ts` is imported by `app.ts`, which attaches `fisheyeApp` to `window`. Astro's Layout pattern wraps the page shell.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS v4 (Vite plugin), AlpineJS 3 (CDN)

**Verification commands:**
- `pnpm astro check` — TypeScript type-check
- `pnpm build` — full production build, must exit 0
- `pnpm dev` — dev server, manual smoke test in browser

---

### Task 1: Add tsconfig.json

**Files:**
- Create: `tsconfig.json`

**Step 1: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict"
}
```

**Step 2: Verify TypeScript is recognised**

```bash
pnpm astro check
```

Expected: no errors (or only "no files" warning — that's fine at this stage).

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add tsconfig.json extending astro/tsconfigs/strict"
```

---

### Task 2: Create TypeScript types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write the types file**

```ts
export type DistortionType = 'circular' | 'full';
export type BorderColor = 'black' | 'white';
export type AspectRatio = '4:3' | '3:2' | '1:1' | '16:9';

export interface FisheyeParams {
  aspectRatio: AspectRatio;
  // Transform
  rotation: number;
  zoom: number;
  panX: number;
  panY: number;
  flipH: boolean;
  flipV: boolean;
  // Fisheye
  distortion: number;
  distortionType: DistortionType;
  borderSize: number;
  borderSoftness: number;
  borderColor: BorderColor;
  fringeIntensity: number;
  fringeRadius: number;
  vignetteIntensity: number;
  vignetteRadius: number;
  // Image
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  temperature: number;
}

export interface GridOptions {
  thirds: boolean;
  fine: boolean;
  diagonal: boolean;
  circle: boolean;
}

export interface ImageControl {
  key: keyof FisheyeParams;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

export interface ImageControls {
  light: ImageControl[];
  color: ImageControl[];
}
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript type definitions for fisheye params and controls"
```

---

### Task 3: Convert engine.js → engine.ts

**Files:**
- Create: `src/scripts/engine.ts`
- Keep: `src/scripts/engine.js` (delete at end of this task)

**Step 1: Create `src/scripts/engine.ts`**

Copy the full contents of `engine.js` and add types. The method signatures change; bodies stay identical.

```ts
import type { FisheyeParams } from '../types/index.ts';

export class FisheyeEngine {
  private sourceImage: HTMLImageElement | null = null;
  private outputCanvas: HTMLCanvasElement | null = null;
  private processing = false;

  setCanvas(canvas: HTMLCanvasElement): void {
    this.outputCanvas = canvas;
  }

  loadImage(img: HTMLImageElement): void {
    this.sourceImage = img;
  }

  async render(params: FisheyeParams): Promise<void> {
    if (!this.sourceImage || !this.outputCanvas || this.processing) return;
    this.processing = true;

    const {
      aspectRatio,
      distortion, distortionType,
      borderSize, borderSoftness, borderColor,
      fringeIntensity, fringeRadius,
      vignetteIntensity, vignetteRadius,
      exposure, contrast, highlights, shadows, saturation, temperature,
    } = params;

    const outputSize = 900;
    let outW: number, outH: number;
    const ratios: Record<string, [number, number]> = {
      '4:3': [4, 3], '3:2': [3, 2], '1:1': [1, 1], '16:9': [16, 9],
    };
    const [rw, rh] = ratios[aspectRatio] ?? [4, 3];
    if (rw >= rh) {
      outW = outputSize;
      outH = Math.round(outputSize * rh / rw);
    } else {
      outH = outputSize;
      outW = Math.round(outputSize * rw / rh);
    }

    this.outputCanvas.width = outW;
    this.outputCanvas.height = outH;
    const ctx = this.outputCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, outW, outH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    const work = new OffscreenCanvas(outW, outH);
    const wCtx = work.getContext('2d')!;

    const src = this.sourceImage;
    const srcAspect = src.naturalWidth / src.naturalHeight;
    const outAspect = outW / outH;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (srcAspect > outAspect) {
      drawH = outH;
      drawW = drawH * srcAspect;
    } else {
      drawW = outW;
      drawH = drawW / srcAspect;
    }
    drawX = (outW - drawW) / 2;
    drawY = (outH - drawH) / 2;
    wCtx.drawImage(src, drawX, drawY, drawW, drawH);

    let imageData = wCtx.getImageData(0, 0, outW, outH);

    imageData = this._applyImageAdjustments(imageData, {
      exposure, contrast, highlights, shadows, saturation, temperature,
    });

    if (distortion > 0) {
      imageData = this._applyBarrelDistortion(imageData, outW, outH, distortion, distortionType);
    }

    if (fringeIntensity > 0) {
      imageData = this._applyChromAberration(imageData, outW, outH, fringeIntensity, fringeRadius);
    }

    if (vignetteIntensity > 0) {
      imageData = this._applyVignette(imageData, outW, outH, vignetteIntensity, vignetteRadius);
    }

    imageData = this._applyCircularMask(imageData, outW, outH, borderSize, borderSoftness, borderColor);

    ctx.putImageData(imageData, 0, 0);
    this.processing = false;
  }

  private _applyImageAdjustments(
    imageData: ImageData,
    opts: Pick<FisheyeParams, 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'saturation' | 'temperature'>,
  ): ImageData {
    const { exposure, contrast, highlights, shadows, saturation, temperature } = opts;
    const data = imageData.data;
    const len = data.length;

    const expMul = Math.pow(2, exposure);
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      r = clamp(r * expMul, 0, 255);
      g = clamp(g * expMul, 0, 255);
      b = clamp(b * expMul, 0, 255);

      if (temperature !== 0) {
        const t = temperature / 100;
        r = clamp(r + t * 25, 0, 255);
        b = clamp(b - t * 25, 0, 255);
      }

      if (contrast !== 0) {
        r = clamp(contrastFactor * (r - 128) + 128, 0, 255);
        g = clamp(contrastFactor * (g - 128) + 128, 0, 255);
        b = clamp(contrastFactor * (b - 128) + 128, 0, 255);
      }

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (shadows !== 0) {
        const shadowMask = Math.max(0, 1 - lum / 128);
        const sv = (shadows / 100) * 60 * shadowMask;
        r = clamp(r + sv, 0, 255);
        g = clamp(g + sv, 0, 255);
        b = clamp(b + sv, 0, 255);
      }
      if (highlights !== 0) {
        const highlightMask = Math.max(0, (lum - 128) / 127);
        const hv = (highlights / 100) * 60 * highlightMask;
        r = clamp(r + hv, 0, 255);
        g = clamp(g + hv, 0, 255);
        b = clamp(b + hv, 0, 255);
      }

      if (saturation !== 0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1 + saturation / 100;
        r = clamp(gray + sat * (r - gray), 0, 255);
        g = clamp(gray + sat * (g - gray), 0, 255);
        b = clamp(gray + sat * (b - gray), 0, 255);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    return imageData;
  }

  private _applyBarrelDistortion(
    imageData: ImageData,
    w: number,
    h: number,
    strength: number,
    type: string,
  ): ImageData {
    const src = imageData.data;
    const out = new ImageData(w, h);
    const dst = out.data;

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy);
    const k = strength * 1.8;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);

        let srcX: number, srcY: number;

        if (type === 'circular' && r > 1.0) {
          const i = (y * w + x) * 4;
          dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 255;
          continue;
        }

        const rd = r;
        const ru = rd * (1 + k * rd * rd);

        if (ru === 0) {
          srcX = cx;
          srcY = cy;
        } else {
          const scale = ru / (r || 0.0001);
          srcX = cx + nx * maxR * scale;
          srcY = cy + ny * maxR * scale;
        }

        const color = bilinearSample(src, w, h, srcX, srcY);
        const i = (y * w + x) * 4;
        dst[i]     = color[0];
        dst[i + 1] = color[1];
        dst[i + 2] = color[2];
        dst[i + 3] = color[3];
      }
    }
    return out;
  }

  private _applyChromAberration(
    imageData: ImageData,
    w: number,
    h: number,
    intensity: number,
    fringe_radius: number,
  ): ImageData {
    const src = imageData.data;
    const out = new ImageData(w, h);
    const dst = out.data;
    dst.set(src);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy);
    const maxShift = intensity * 12;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);

        const falloff = Math.max(0, (r - fringe_radius) / (1.0 - fringe_radius + 0.001));
        if (falloff <= 0) continue;

        const shift = falloff * maxShift;
        const blueX = x + (nx / (r + 0.001)) * shift;
        const blueY = y + (ny / (r + 0.001)) * shift;
        const redX  = x - (nx / (r + 0.001)) * shift * 0.3;
        const redY  = y - (ny / (r + 0.001)) * shift * 0.3;

        const blueColor = bilinearSample(src, w, h, blueX, blueY);
        const redColor  = bilinearSample(src, w, h, redX, redY);

        const i = (y * w + x) * 4;
        dst[i]     = clamp(redColor[0], 0, 255);
        dst[i + 2] = clamp(blueColor[2], 0, 255);
      }
    }
    return out;
  }

  private _applyVignette(
    imageData: ImageData,
    w: number,
    h: number,
    intensity: number,
    radius: number,
  ): ImageData {
    const data = imageData.data;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / maxR;
        const dy = (y - cy) / maxR;
        const r = Math.sqrt(dx * dx + dy * dy);

        const edge = radius;
        const vig = Math.max(0, (r - edge) / (1.0 - edge + 0.001));
        const darkening = 1.0 - intensity * Math.pow(vig, 1.5);

        const i = (y * w + x) * 4;
        data[i]     = clamp(data[i]     * darkening, 0, 255);
        data[i + 1] = clamp(data[i + 1] * darkening, 0, 255);
        data[i + 2] = clamp(data[i + 2] * darkening, 0, 255);
      }
    }
    return imageData;
  }

  private _applyCircularMask(
    imageData: ImageData,
    w: number,
    h: number,
    borderSize: number,
    borderSoftness: number,
    borderColor: string,
  ): ImageData {
    const data = imageData.data;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy);
    const circleR = maxR * (1.0 - borderSize * 0.4);
    const softPx = borderSoftness * maxR * 0.08 + 1;
    const borderVal = borderColor === 'white' ? 255 : 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const i = (y * w + x) * 4;

        if (r > circleR + softPx) {
          data[i] = borderVal; data[i + 1] = borderVal;
          data[i + 2] = borderVal; data[i + 3] = 255;
        } else if (r > circleR - softPx) {
          const t = (r - (circleR - softPx)) / (2 * softPx);
          const alpha = Math.max(0, Math.min(1, t));
          data[i]     = clamp(data[i]     * (1 - alpha) + borderVal * alpha, 0, 255);
          data[i + 1] = clamp(data[i + 1] * (1 - alpha) + borderVal * alpha, 0, 255);
          data[i + 2] = clamp(data[i + 2] * (1 - alpha) + borderVal * alpha, 0, 255);
        }
      }
    }
    return imageData;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function bilinearSample(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  const sample = (px: number, py: number): [number, number, number, number] => {
    const sx = clamp(px, 0, w - 1);
    const sy = clamp(py, 0, h - 1);
    const i = (sy * w + sx) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  const c00 = sample(x0, y0);
  const c10 = sample(x1, y0);
  const c01 = sample(x0, y1);
  const c11 = sample(x1, y1);

  return [
    c00[0] * (1 - fx) * (1 - fy) + c10[0] * fx * (1 - fy) + c01[0] * (1 - fx) * fy + c11[0] * fx * fy,
    c00[1] * (1 - fx) * (1 - fy) + c10[1] * fx * (1 - fy) + c01[1] * (1 - fx) * fy + c11[1] * fx * fy,
    c00[2] * (1 - fx) * (1 - fy) + c10[2] * fx * (1 - fy) + c01[2] * (1 - fx) * fy + c11[2] * fx * fy,
    c00[3] * (1 - fx) * (1 - fy) + c10[3] * fx * (1 - fy) + c01[3] * (1 - fx) * fy + c11[3] * fx * fy,
  ];
}
```

**Step 2: Delete the old engine.js**

```bash
rm src/scripts/engine.js
```

**Step 3: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/scripts/engine.ts
git rm src/scripts/engine.js
git commit -m "feat: convert engine.js to TypeScript with typed method signatures"
```

---

### Task 4: Create app.ts (Alpine factory module)

**Files:**
- Create: `src/scripts/app.ts`

**Step 1: Create `src/scripts/app.ts`**

Move the entire `fisheyeApp()` function from `index.astro`'s inline `<script>` block, importing the engine and types:

```ts
import { FisheyeEngine } from './engine.ts';
import type { FisheyeParams, GridOptions, ImageControls } from '../types/index.ts';

const engine = new FisheyeEngine();

export function fisheyeApp() {
  return {
    hasImage: false as boolean,
    isRendering: false as boolean,
    activeTab: 'fisheye' as string,

    params: {
      aspectRatio: '4:3',
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      flipH: false,
      flipV: false,
      distortion: 0.55,
      distortionType: 'circular',
      borderSize: 0.08,
      borderSoftness: 0.4,
      borderColor: 'black',
      fringeIntensity: 0.45,
      fringeRadius: 0.55,
      vignetteIntensity: 0.5,
      vignetteRadius: 0.45,
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      saturation: 0,
      temperature: 0,
    } as FisheyeParams,

    gridOptions: {
      thirds: true,
      fine: true,
      diagonal: true,
      circle: true,
    } as GridOptions,

    imageControls: {
      light: [
        { key: 'exposure',   label: 'Exposure',   min: -2,   max: 2,   step: 0.05, format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + ' EV' },
        { key: 'contrast',   label: 'Contrast',   min: -100, max: 100, step: 1,    format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1,    format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'shadows',    label: 'Shadows',    min: -100, max: 100, step: 1,    format: (v: number) => (v >= 0 ? '+' : '') + v },
      ],
      color: [
        { key: 'saturation',  label: 'Saturation',  min: -100, max: 100, step: 1, format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, format: (v: number) => v > 0 ? '+' + v + ' warm' : v < 0 ? v + ' cool' : '0' },
      ],
    } as ImageControls,

    init(this: any) {
      engine.setCanvas(this.$refs.canvas);
      this.$watch('activeTab', (val: string) => {
        if (val === 'transform') this.$nextTick(() => this.drawGrid());
      });
    },

    canvasWrapperStyle(this: any): string {
      const ratios: Record<string, number> = { '4:3': 4/3, '3:2': 3/2, '1:1': 1, '16:9': 16/9 };
      const r = ratios[this.params.aspectRatio] ?? 4/3;
      return r >= 1
        ? `width: min(80vw, calc(75vh * ${r})); aspect-ratio: ${r};`
        : `height: min(80vh, calc(75vw / ${r})); aspect-ratio: ${r};`;
    },

    handleDrop(this: any, e: DragEvent) {
      (e.currentTarget as HTMLElement).classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) this.loadFile(file);
    },

    handleFileInput(this: any, e: Event) {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
      (e.target as HTMLInputElement).value = '';
    },

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

    async render(this: any) {
      if (!this.hasImage || this.isRendering) return;
      this.isRendering = true;
      await new Promise<void>(r => setTimeout(r, 0));
      await engine.render({ ...this.params });
      this.isRendering = false;
      if (this.activeTab === 'transform') this.drawGrid();
    },

    drawGrid(this: any) {
      const gc: HTMLCanvasElement = this.$refs.gridCanvas;
      const oc: HTMLCanvasElement = this.$refs.canvas;
      if (!gc || !oc || !oc.width) return;

      const w = oc.width;
      const h = oc.height;
      gc.width = w;
      gc.height = h;
      const ctx = gc.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      if (this.gridOptions.fine) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        const cols = 8, rows = 6;
        for (let i = 1; i < cols; i++) {
          ctx.beginPath(); ctx.moveTo(w / cols * i, 0); ctx.lineTo(w / cols * i, h); ctx.stroke();
        }
        for (let j = 1; j < rows; j++) {
          ctx.beginPath(); ctx.moveTo(0, h / rows * j); ctx.lineTo(w, h / rows * j); ctx.stroke();
        }
      }

      if (this.gridOptions.diagonal) {
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(0, 0);   ctx.lineTo(w, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w, 0);   ctx.lineTo(0, h); ctx.stroke();
      }

      if (this.gridOptions.thirds) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        for (const t of [1/3, 2/3]) {
          ctx.beginPath(); ctx.moveTo(w * t, 0); ctx.lineTo(w * t, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, h * t); ctx.lineTo(w, h * t); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const tx of [1/3, 2/3]) {
          for (const ty of [1/3, 2/3]) {
            ctx.beginPath(); ctx.arc(w * tx, h * ty, 2.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      const arm = 16;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();

      if (this.gridOptions.circle) {
        const maxR = Math.min(cx, cy);
        const circleR = maxR * (1.0 - this.params.borderSize * 0.4);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(cx, cy, circleR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 1.5;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
          const cos = Math.cos(angle), sin = Math.sin(angle);
          ctx.beginPath();
          ctx.moveTo(cx + cos * (circleR - 6), cy + sin * (circleR - 6));
          ctx.lineTo(cx + cos * (circleR + 6), cy + sin * (circleR + 6));
          ctx.stroke();
        }
      }
    },

    applyVX1000Preset(this: any) {
      Object.assign(this.params, {
        distortion: 0.60, distortionType: 'circular',
        borderSize: 0.10, borderSoftness: 0.35, borderColor: 'black',
        fringeIntensity: 0.50, fringeRadius: 0.50,
        vignetteIntensity: 0.55, vignetteRadius: 0.40,
        contrast: 15, saturation: -8, shadows: -5,
      });
      this.render();
    },

    resetTransform(this: any) {
      Object.assign(this.params, { rotation: 0, zoom: 1, panX: 0, panY: 0, flipH: false, flipV: false });
      this.render();
    },

    resetFisheye(this: any) {
      Object.assign(this.params, {
        distortion: 0, distortionType: 'circular',
        borderSize: 0, borderSoftness: 0.4, borderColor: 'black',
        fringeIntensity: 0, fringeRadius: 0.55,
        vignetteIntensity: 0, vignetteRadius: 0.45,
      });
      this.render();
    },

    resetImage(this: any) {
      Object.assign(this.params, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0 });
      this.render();
    },

    exportImage(this: any) {
      const canvas: HTMLCanvasElement = this.$refs.canvas;
      const link = document.createElement('a');
      link.download = 'eyes-of-fish.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  };
}

// Attach to window for AlpineJS x-data="fisheyeApp()"
declare global {
  interface Window { fisheyeApp: typeof fisheyeApp; }
}
window.fisheyeApp = fisheyeApp;
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/scripts/app.ts
git commit -m "feat: extract Alpine fisheyeApp factory to typed app.ts module"
```

---

### Task 5: Create Layout.astro

**Files:**
- Create: `src/layouts/Layout.astro`

**Step 1: Create `src/layouts/Layout.astro`**

```astro
---
import '../styles/global.css';
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Eyes of Fish — VX1000 Fisheye Editor</title>
</head>
<body x-data="fisheyeApp()" x-init="init()" class="flex flex-col h-screen overflow-hidden bg-[#0a0a0a]">
  <slot />
  <script type="module" src="/src/scripts/app.ts"></script>
  <script src="//unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</body>
</html>
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: add Layout.astro with HTML shell and Alpine script loading"
```

---

### Task 6: Create AppHeader.astro

**Files:**
- Create: `src/components/AppHeader.astro`

**Step 1: Create `src/components/AppHeader.astro`**

Extract the `<header>` block from `index.astro` (lines 14–50):

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

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/AppHeader.astro
git commit -m "feat: extract AppHeader component (logo, aspect ratio, export)"
```

---

### Task 7: Create PreviewArea.astro

**Files:**
- Create: `src/components/PreviewArea.astro`

**Step 1: Create `src/components/PreviewArea.astro`**

Extract the `<main>` block from `index.astro` (lines 398–474):

```astro
---
---
<main class="flex-1 flex flex-col items-center justify-center bg-[#080808] relative overflow-hidden">

  <!-- Drop zone (when no image) -->
  <div
    x-show="!hasImage"
    @dragover.prevent="$el.classList.add('drag-over')"
    @dragleave="$el.classList.remove('drag-over')"
    @drop.prevent="handleDrop($event)"
    @click="$refs.fileInput.click()"
    class="drop-zone absolute inset-8 border-2 border-dashed border-[#222] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#333] transition-colors"
  >
    <div class="flex flex-col items-center gap-3 select-none">
      <div class="w-16 h-16 rounded-full bg-[#111] border border-[#222] flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" class="w-8 h-8 text-[#333]" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="9"/>
          <ellipse cx="12" cy="12" rx="4" ry="9"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
      </div>
      <div class="text-center">
        <p class="text-sm text-[#555] font-medium">Drop an image here</p>
        <p class="text-xs text-[#333] mt-1">or click to browse</p>
      </div>
      <p class="text-xs text-[#2a2a2a]">JPG, PNG, WEBP</p>
    </div>
  </div>

  <!-- Processing overlay -->
  <div
    x-show="isRendering"
    class="absolute inset-0 flex items-center justify-center bg-black/30 z-10 pointer-events-none"
  >
    <div class="flex items-center gap-2 bg-[#111] px-4 py-2 rounded-full border border-[#222]">
      <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
      <span class="text-xs text-[#888]">Rendering…</span>
    </div>
  </div>

  <!-- Canvas wrapper -->
  <div
    x-show="hasImage"
    id="canvas-wrapper"
    class="relative"
    :style="canvasWrapperStyle()"
  >
    <canvas
      id="output-canvas"
      x-ref="canvas"
      class="max-w-full max-h-full rounded shadow-2xl block"
      style="image-rendering: auto;"
    ></canvas>
    <!-- Grid overlay canvas -->
    <canvas
      x-ref="gridCanvas"
      x-show="activeTab === 'transform' && hasImage"
      class="absolute inset-0 w-full h-full pointer-events-none rounded"
    ></canvas>
  </div>

  <!-- Change image button -->
  <button
    x-show="hasImage"
    @click="$refs.fileInput.click()"
    class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs text-[#444] hover:text-[#888] border border-[#1a1a1a] rounded-full bg-[#0d0d0d] transition-colors"
  >
    Change image
  </button>

  <!-- Hidden file input -->
  <input
    type="file"
    x-ref="fileInput"
    @change="handleFileInput($event)"
    accept="image/*"
    class="hidden"
  />
</main>
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/PreviewArea.astro
git commit -m "feat: extract PreviewArea component (canvas, drop zone, overlays)"
```

---

### Task 8: Create FisheyeTab.astro

**Files:**
- Create: `src/components/FisheyeTab.astro`

**Step 1: Create `src/components/FisheyeTab.astro`**

Extract the fisheye tab div from `index.astro` (lines 78–225):

```astro
---
---
<div x-show="activeTab === 'fisheye'" class="flex flex-col gap-0 p-3.5">

  <!-- Lens Type -->
  <div class="mb-4">
    <p class="section-label">Lens Type</p>
    <div class="flex gap-1.5">
      <button
        @click="params.distortionType = 'circular'; render()"
        :class="params.distortionType === 'circular' ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all"
      >Circular</button>
      <button
        @click="params.distortionType = 'full'; render()"
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
          x-model.number="params.distortion" @input="render()" class="w-full" />
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
          x-model.number="params.borderSize" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Edge Softness</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.borderSoftness * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.borderSoftness" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Border Color</span>
        </div>
        <div class="flex gap-1.5">
          <button
            @click="params.borderColor = 'black'; render()"
            :class="params.borderColor === 'black' ? 'border-blue-600' : 'border-[#333]'"
            class="flex-1 py-1.5 text-xs border rounded-md bg-black text-[#666] transition-all hover:border-[#555]"
          >Black</button>
          <button
            @click="params.borderColor = 'white'; render()"
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
          x-model.number="params.fringeIntensity" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Start Radius</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.fringeRadius * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.fringeRadius" @input="render()" class="w-full" />
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
          x-model.number="params.vignetteIntensity" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Radius</span>
          <span class="text-xs text-[#888] font-mono" x-text="Math.round(params.vignetteRadius * 100) + '%'"></span>
        </div>
        <input type="range" min="0" max="1" step="0.01"
          x-model.number="params.vignetteRadius" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <!-- Preset + Reset -->
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

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/FisheyeTab.astro
git commit -m "feat: extract FisheyeTab component"
```

---

### Task 9: Create TransformTab.astro

**Files:**
- Create: `src/components/TransformTab.astro`

**Step 1: Create `src/components/TransformTab.astro`**

Extract the transform tab div from `index.astro` (lines 228–347):

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
        x-model.number="params.rotation" @input="render()" class="w-full" />
      <button
        x-show="params.rotation !== 0"
        @click="params.rotation = 0; render()"
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
          x-model.number="params.zoom" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Pan X</span>
          <span class="text-xs text-[#888] font-mono" x-text="(params.panX >= 0 ? '+' : '') + Math.round(params.panX * 100) + '%'"></span>
        </div>
        <input type="range" min="-0.5" max="0.5" step="0.005"
          x-model.number="params.panX" @input="render()" class="w-full" />
      </div>
      <div>
        <div class="flex justify-between mb-1.5">
          <span class="text-xs text-[#666]">Pan Y</span>
          <span class="text-xs text-[#888] font-mono" x-text="(params.panY >= 0 ? '+' : '') + Math.round(params.panY * 100) + '%'"></span>
        </div>
        <input type="range" min="-0.5" max="0.5" step="0.005"
          x-model.number="params.panY" @input="render()" class="w-full" />
      </div>
    </div>
  </div>

  <!-- Flip -->
  <div class="mb-4">
    <p class="section-label">Flip</p>
    <div class="flex gap-1.5">
      <button
        @click="params.flipH = !params.flipH; render()"
        :class="params.flipH ? 'bg-[#1e293b] border-blue-600 text-blue-400' : 'border-[#222] text-[#555] hover:text-[#999]'"
        class="flex-1 py-2 text-xs border rounded-md transition-all flex items-center justify-center gap-1.5"
      >
        <svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 2v12M5 5l-3 3 3 3M11 5l3 3-3 3"/>
        </svg>
        Horizontal
      </button>
      <button
        @click="params.flipV = !params.flipV; render()"
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

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/TransformTab.astro
git commit -m "feat: extract TransformTab component"
```

---

### Task 10: Create ImageTab.astro

**Files:**
- Create: `src/components/ImageTab.astro`

**Step 1: Create `src/components/ImageTab.astro`**

Extract the image tab div from `index.astro` (lines 350–393):

```astro
---
---
<div x-show="activeTab === 'image'" class="flex flex-col gap-0 p-3.5">
  <div class="mb-4">
    <p class="section-label">Light</p>
    <div class="flex flex-col gap-3">
      <template x-for="ctrl in imageControls.light">
        <div>
          <div class="flex justify-between mb-1.5">
            <span class="text-xs text-[#666]" x-text="ctrl.label"></span>
            <span class="text-xs text-[#888] font-mono" x-text="ctrl.format(params[ctrl.key])"></span>
          </div>
          <input type="range"
            :min="ctrl.min" :max="ctrl.max" :step="ctrl.step"
            x-model.number="params[ctrl.key]"
            @input="render()"
            class="w-full" />
        </div>
      </template>
    </div>
  </div>
  <div class="mb-4">
    <p class="section-label">Color</p>
    <div class="flex flex-col gap-3">
      <template x-for="ctrl in imageControls.color">
        <div>
          <div class="flex justify-between mb-1.5">
            <span class="text-xs text-[#666]" x-text="ctrl.label"></span>
            <span class="text-xs text-[#888] font-mono" x-text="ctrl.format(params[ctrl.key])"></span>
          </div>
          <input type="range"
            :min="ctrl.min" :max="ctrl.max" :step="ctrl.step"
            x-model.number="params[ctrl.key]"
            @input="render()"
            class="w-full" />
        </div>
      </template>
    </div>
  </div>
  <button
    @click="resetImage()"
    class="w-full py-2 text-xs border border-[#1f1f1f] rounded-md text-[#555] hover:text-[#999] transition-all mt-1"
  >
    Reset Image
  </button>
</div>
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/ImageTab.astro
git commit -m "feat: extract ImageTab component"
```

---

### Task 11: Create ControlPanel.astro

**Files:**
- Create: `src/components/ControlPanel.astro`

**Step 1: Create `src/components/ControlPanel.astro`**

Extract the `<aside>` from `index.astro` (lines 56–395), importing the three tab components:

```astro
---
import FisheyeTab from './FisheyeTab.astro';
import TransformTab from './TransformTab.astro';
import ImageTab from './ImageTab.astro';
---
<aside class="w-64 shrink-0 flex flex-col border-r border-[#1a1a1a] bg-[#0d0d0d] overflow-y-auto">

  <!-- Tab switcher -->
  <div class="flex border-b border-[#1a1a1a] shrink-0">
    <button
      @click="activeTab = 'fisheye'"
      :class="activeTab === 'fisheye' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Fisheye</button>
    <button
      @click="activeTab = 'transform'"
      :class="activeTab === 'transform' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Transform</button>
    <button
      @click="activeTab = 'image'"
      :class="activeTab === 'image' ? 'text-white border-blue-500' : 'text-[#555] border-transparent hover:text-[#999]'"
      class="tab-btn flex-1 py-2.5 text-xs font-medium border-b-2 transition-all"
    >Image</button>
  </div>

  <FisheyeTab />
  <TransformTab />
  <ImageTab />

</aside>
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/ControlPanel.astro
git commit -m "feat: extract ControlPanel component (tabs + tab content)"
```

---

### Task 12: Rewrite index.astro

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: Replace `src/pages/index.astro` entirely**

```astro
---
import Layout from '../layouts/Layout.astro';
import AppHeader from '../components/AppHeader.astro';
import ControlPanel from '../components/ControlPanel.astro';
import PreviewArea from '../components/PreviewArea.astro';
---
<Layout>
  <AppHeader />
  <div class="flex flex-1 overflow-hidden">
    <ControlPanel />
    <PreviewArea />
  </div>
</Layout>
```

**Step 2: Type-check**

```bash
pnpm astro check
```

Expected: no errors.

**Step 3: Build to confirm production output is clean**

```bash
pnpm build
```

Expected: exit 0, no errors in output.

**Step 4: Manual smoke test**

```bash
pnpm dev
```

Open `http://localhost:4321` in browser. Verify:
- Page loads with dark UI
- Drop zone visible in center
- Left panel shows Fisheye / Transform / Image tabs
- Drop or click to load an image — canvas renders correctly
- Sliders update the canvas in real time
- Export button downloads PNG
- Aspect ratio buttons work

**Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "refactor: replace monolithic index.astro with composed components

index.astro shrinks from 736 lines to 12. All UI extracted into:
- Layout.astro, AppHeader.astro, ControlPanel.astro,
  FisheyeTab.astro, TransformTab.astro, ImageTab.astro, PreviewArea.astro
Engine converted to TypeScript, Alpine factory moved to app.ts."
```

---

## Summary

| Task | Output |
|------|--------|
| 1 | `tsconfig.json` |
| 2 | `src/types/index.ts` |
| 3 | `src/scripts/engine.ts` (+ delete `engine.js`) |
| 4 | `src/scripts/app.ts` |
| 5 | `src/layouts/Layout.astro` |
| 6 | `src/components/AppHeader.astro` |
| 7 | `src/components/PreviewArea.astro` |
| 8 | `src/components/FisheyeTab.astro` |
| 9 | `src/components/TransformTab.astro` |
| 10 | `src/components/ImageTab.astro` |
| 11 | `src/components/ControlPanel.astro` |
| 12 | `src/pages/index.astro` (rewritten, ~12 lines) |
