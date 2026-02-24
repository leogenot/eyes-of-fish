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

