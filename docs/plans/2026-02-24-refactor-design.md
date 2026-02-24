# Refactor Design — Component Split + TypeScript
**Date:** 2026-02-24
**Approach:** A — Focused Component Split

## Goal
Deload `src/pages/index.astro` (currently 736 lines) by extracting UI sections into Astro components, convert `engine.js` to TypeScript, and move the Alpine app factory to a typed module.

## File Structure

```
src/
├── types/
│   └── index.ts              # FisheyeParams, GridOptions, ImageControl, union types
├── scripts/
│   ├── engine.ts             # FisheyeEngine class (converted from engine.js)
│   └── app.ts                # fisheyeApp() Alpine factory (moved from index.astro)
├── styles/
│   └── global.css            # unchanged
├── layouts/
│   └── Layout.astro          # HTML shell: <html>, <head>, Alpine CDN script
├── components/
│   ├── AppHeader.astro       # Top bar: logo, aspect ratio pills, export button
│   ├── ControlPanel.astro    # Left sidebar: tab switcher + tab content
│   ├── FisheyeTab.astro      # Fisheye tab: lens type, distortion, border, fringe, vignette
│   ├── TransformTab.astro    # Transform tab: rotation, zoom, pan, flip, grid overlay
│   ├── ImageTab.astro        # Image tab: light + color sliders
│   └── PreviewArea.astro     # Center: drop zone, canvas, processing overlay
└── pages/
    └── index.astro           # ~20 lines — composes layout + components
```

## Architecture

### Data Flow
- `app.ts` exports `fisheyeApp()`, attached to `window` via a `<script>` tag in `Layout.astro`
- `engine.ts` is imported inside `app.ts`
- Alpine's `x-data="fisheyeApp()"` on `<body>` makes all state available to every child component
- Astro components are fully static — they render HTML with Alpine directives baked in; no Astro props needed

### TypeScript Types (`src/types/index.ts`)
```ts
export type DistortionType = 'circular' | 'full';
export type BorderColor = 'black' | 'white';
export type AspectRatio = '4:3' | '3:2' | '1:1' | '16:9';

export interface FisheyeParams {
  aspectRatio: AspectRatio;
  rotation: number; zoom: number; panX: number; panY: number;
  flipH: boolean; flipV: boolean;
  distortion: number; distortionType: DistortionType;
  borderSize: number; borderSoftness: number; borderColor: BorderColor;
  fringeIntensity: number; fringeRadius: number;
  vignetteIntensity: number; vignetteRadius: number;
  exposure: number; contrast: number; highlights: number;
  shadows: number; saturation: number; temperature: number;
}

export interface GridOptions {
  thirds: boolean; fine: boolean; diagonal: boolean; circle: boolean;
}

export interface ImageControl {
  key: keyof FisheyeParams;
  label: string;
  min: number; max: number; step: number;
  format: (v: number) => string;
}
```

### engine.ts
- Direct conversion of `engine.js` — no logic changes
- Add parameter types to all method signatures using `FisheyeParams`
- Add return types (`ImageData`, `void`)

### app.ts
- Move `fisheyeApp()` function from the inline `<script>` in `index.astro`
- Import `FisheyeEngine` from `./engine`
- Type the returned Alpine data object using `FisheyeParams`, `GridOptions`, `ImageControl`
- Attach to `window` as `window.fisheyeApp = fisheyeApp`

### Layout.astro
- Contains `<html>`, `<head>`, `<meta>`, `<title>`
- Loads Alpine CDN via `<script defer>`
- Loads `app.ts` via `<script type="module">`
- Renders `<body x-data="fisheyeApp()" x-init="init()">`

### Components
| Component | Contents |
|---|---|
| `AppHeader.astro` | Logo SVG, brand text, aspect ratio pill buttons, export button |
| `ControlPanel.astro` | `<aside>` wrapper, tab switcher buttons, `<FisheyeTab>` / `<TransformTab>` / `<ImageTab>` |
| `FisheyeTab.astro` | Lens type toggle, distortion/border/fringe/vignette sliders, preset + reset buttons |
| `TransformTab.astro` | Rotation, zoom, pan sliders, flip buttons, grid overlay checkboxes, reset button |
| `ImageTab.astro` | Light + color slider groups via Alpine `x-for`, reset button |
| `PreviewArea.astro` | Drop zone, processing overlay, canvas + grid canvas, change-image button, hidden file input |

## What Does Not Change
- All CSS and Tailwind classes
- All runtime logic (render pipeline, drawGrid, exportImage, presets)
- engine.ts method bodies — types added only
- AlpineJS CDN source

## tsconfig.json
Add a `tsconfig.json` at the project root (Astro expects one for TypeScript support):
```json
{
  "extends": "astro/tsconfigs/strict"
}
```
