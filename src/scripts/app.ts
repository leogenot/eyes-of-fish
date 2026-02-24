import { FisheyeEngine, buildCurveLUT } from './engine.ts';
import type { FisheyeParams, GridOptions, ImageControls, Point } from '../types/index.ts';
import { saveImage, loadImage, saveParams, loadParams } from './storage.ts';

const engine = new FisheyeEngine();

export function fisheyeApp() {
  return {
    hasImage: false as boolean,
    isRendering: false as boolean,
    activeTab: 'fisheye' as string,
    sheetOpen: false as boolean,
    theme: 'light' as 'light' | 'dark',

    // Mobile sheet drag state
    sheetDragging: false as boolean,
    sheetDragStartY: 0 as number,
    sheetDragDeltaY: 0 as number,

    dragPointIndex: -1 as number,

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
      rgbCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    } as FisheyeParams,

    gridOptions: {
      thirds: true,
      fine: true,
      diagonal: true,
      circle: true,
    } as GridOptions,

    imageControls: {
      light: [
        { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, format: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + ' EV' },
        { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, format: (v: number) => (v >= 0 ? '+' : '') + v },
      ],
      color: [
        { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, format: (v: number) => (v >= 0 ? '+' : '') + v },
        { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, format: (v: number) => v > 0 ? '+' + v + ' warm' : v < 0 ? v + ' cool' : '0' },
      ],
    } as ImageControls,

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

    async init(this: any) {
      this.initTheme();
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
        if (val === 'image') this.$nextTick(() => this.drawCurveEditor());
      });

      // Keyboard shortcuts: Ctrl/Cmd+Z = undo, +Shift or Ctrl+Y = redo
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

    // Mobile bottom sheet drag handlers (handle swipe up/down to open/close)
    startSheetDrag(this: any, e: TouchEvent) {
      if (e.touches.length !== 1) return;
      this.sheetDragging = true;
      this.sheetDragStartY = e.touches[0].clientY;
      this.sheetDragDeltaY = 0;
    },

    moveSheetDrag(this: any, e: TouchEvent) {
      if (!this.sheetDragging || e.touches.length !== 1) return;
      const currentY = e.touches[0].clientY;
      this.sheetDragDeltaY = currentY - this.sheetDragStartY;
    },

    endSheetDrag(this: any) {
      if (!this.sheetDragging) return;
      const threshold = 30;
      if (this.sheetDragDeltaY < -threshold) {
        // Dragged up enough -> open sheet
        this.sheetOpen = true;
      } else if (this.sheetDragDeltaY > threshold) {
        // Dragged down enough -> close sheet
        this.sheetOpen = false;
      }
      this.sheetDragging = false;
      this.sheetDragDeltaY = 0;
    },

    initTheme(this: any) {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') {
        this.theme = saved;
      } else {
        // Default to light when there is no saved preference
        this.theme = 'light';
      }
      this.applyTheme();
    },

    toggleTheme(this: any) {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', this.theme);
      this.applyTheme();
      if (this.activeTab === 'transform') this.drawGrid(); // Redraw grid with correct colors
      if (this.activeTab === 'image') this.drawCurveEditor();
    },

    applyTheme(this: any) {
      if (this.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },

    canvasWrapperStyle(this: any): string {
      const ratios: Record<string, number> = { '4:3': 4 / 3, '3:2': 3 / 2, '1:1': 1, '16:9': 16 / 9 };
      const r = ratios[this.params.aspectRatio] ?? 4 / 3;
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
        URL.revokeObjectURL(url);
        saveImage(file);
        this.hasImage = true;
        this.past = [];
        this.future = [];
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
      saveParams(this.params);
      if (this.activeTab === 'transform') this.drawGrid();
      if (this.activeTab === 'image') this.drawCurveEditor();
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
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
      }

      if (this.gridOptions.thirds) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        for (const t of [1 / 3, 2 / 3]) {
          ctx.beginPath(); ctx.moveTo(w * t, 0); ctx.lineTo(w * t, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, h * t); ctx.lineTo(w, h * t); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const tx of [1 / 3, 2 / 3]) {
          for (const ty of [1 / 3, 2 / 3]) {
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
      this.pushHistory();
      Object.assign(this.params, {
        distortion: 0.35, distortionType: 'circular',
        borderSize: 0.10, borderSoftness: 0.35, borderColor: 'black',
        fringeIntensity: 0.25, fringeRadius: 0.50,
        vignetteIntensity: 0.55, vignetteRadius: 0.40,
        contrast: 15, saturation: -8, shadows: -5,
      });
      this.render();
    },

    resetTransform(this: any) {
      this.pushHistory();
      Object.assign(this.params, { rotation: 0, zoom: 1, panX: 0, panY: 0, flipH: false, flipV: false });
      this.render();
    },

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

    resetImage(this: any) {
      this.pushHistory();
      Object.assign(this.params, { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0, rgbCurve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] });
      this.render();
    },

    drawCurveEditor(this: any) {
      const canvas: HTMLCanvasElement = this.$refs.curveCanvas;
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      // Draw Grid
      ctx.strokeStyle = this.theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo((w / 4) * i, 0); ctx.lineTo((w / 4) * i, h);
        ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i);
      }
      ctx.stroke();

      // Draw Histogram
      const hist = engine.getHistogram();
      let maxHist = 0;
      for (let i = 0; i < 256; i++) if (hist[i] > maxHist) maxHist = hist[i];

      if (maxHist > 0) {
        ctx.fillStyle = this.theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < 256; i++) {
          const val = (hist[i] / maxHist) * h * 0.9;
          ctx.lineTo(i * (w / 255), h - val);
        }
        ctx.lineTo(w, h);
        ctx.fill();
      }

      // Draw Curve
      const lut = buildCurveLUT(this.params.rgbCurve);
      ctx.strokeStyle = this.theme === 'dark' ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = i * (w / 255);
        const y = h - lut[i] * (h / 255);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw Points
      ctx.fillStyle = this.theme === 'dark' ? '#000' : '#fff';
      const pts = this.params.rgbCurve;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x * (w / 255), h - p.y * (h / 255), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    },

    getCurveCoords(this: any, e: MouseEvent | TouchEvent) {
      const canvas: HTMLCanvasElement = this.$refs.curveCanvas;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const scaleX = 255 / rect.width;
      const scaleY = 255 / rect.height;
      return {
        x: Math.max(0, Math.min(255, (clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(255, 255 - (clientY - rect.top) * scaleY))
      };
    },

    startCurveDrag(this: any, e: MouseEvent | TouchEvent) {
      if ('touches' in e) {
        if ((e as TouchEvent).touches.length > 1) return;
        e.preventDefault();
      }
      const coords = this.getCurveCoords(e);
      if (!coords) return;

      const pts = this.params.rgbCurve;
      let closestIdx = -1;
      let closestDist = Infinity;

      for (let i = 0; i < pts.length; i++) {
        const dist = Math.hypot(pts[i].x - coords.x, pts[i].y - coords.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      if (closestDist < 15) {
        this.pushHistory();
        this.dragPointIndex = closestIdx;
      } else {
        this.pushHistory();
        const pt = { x: coords.x, y: coords.y };
        pts.push(pt);
        pts.sort((a: Point, b: Point) => a.x - b.x);
        this.dragPointIndex = pts.indexOf(pt);
        this.render();
      }
    },

    moveCurveDrag(this: any, e: MouseEvent | TouchEvent) {
      if (this.dragPointIndex === -1) return;
      if ('touches' in e) e.preventDefault();
      const coords = this.getCurveCoords(e);
      if (!coords) return;

      const pts = this.params.rgbCurve;
      const pt = pts[this.dragPointIndex];

      const prevX = this.dragPointIndex > 0 ? pts[this.dragPointIndex - 1].x + 1 : 0;
      const nextX = this.dragPointIndex < pts.length - 1 ? pts[this.dragPointIndex + 1].x - 1 : 255;

      pt.x = Math.max(prevX, Math.min(nextX, coords.x));
      pt.y = coords.y;

      this.drawCurveEditor();
      this.render();
    },

    endCurveDrag(this: any) {
      this.dragPointIndex = -1;
    },

    removeCurvePoint(this: any, e: MouseEvent) {
      const coords = this.getCurveCoords(e);
      if (!coords) return;

      const pts = this.params.rgbCurve;
      if (pts.length <= 2) return;

      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dist = Math.hypot(pts[i].x - coords.x, pts[i].y - coords.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      if (closestDist < 15 && closestIdx !== 0 && closestIdx !== pts.length - 1) {
        this.pushHistory();
        pts.splice(closestIdx, 1);
        this.render();
      }
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
