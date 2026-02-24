/**
 * Eyes of Fish — Canvas Processing Engine
 * Emulates Sony VX1000 + Century Optics fisheye lens
 */

export class FisheyeEngine {
  constructor() {
    this.sourceImage = null;
    this.outputCanvas = null;
    this.processing = false;
  }

  setCanvas(canvas) {
    this.outputCanvas = canvas;
  }

  loadImage(img) {
    this.sourceImage = img;
  }

  /**
   * Main render pipeline. Applies all effects in order.
   */
  async render(params) {
    if (!this.sourceImage || !this.outputCanvas || this.processing) return;
    this.processing = true;

    const {
      // Aspect ratio
      aspectRatio,       // '4:3' | '1:1' | '16:9' | '3:2'
      // Transform (applied before all effects)
      rotation  = 0,    // degrees, -180 to +180
      zoom      = 1,    // 0.5 to 3
      panX      = 0,    // fraction of output width, -0.5 to +0.5
      panY      = 0,    // fraction of output height, -0.5 to +0.5
      flipH     = false,
      flipV     = false,
      // Fisheye
      distortion,        // 0–1, barrel distortion strength
      distortionType,    // 'circular' | 'full'
      // Border
      borderSize,        // 0–1
      borderSoftness,    // 0–1
      borderColor,       // 'black' | 'white'
      // Fringe
      fringeIntensity,   // 0–1
      fringeRadius,      // 0–1 (where fringe starts)
      // Vignette
      vignetteIntensity, // 0–1
      vignetteRadius,    // 0–1
      // Image adjustments
      exposure,          // -2 to +2
      contrast,          // -100 to +100
      highlights,        // -100 to +100
      shadows,           // -100 to +100
      saturation,        // -100 to +100
      temperature,       // -100 to +100
    } = params;

    // --- Setup dimensions based on aspect ratio ---
    const outputSize = 900; // base size
    let outW, outH;
    const ratios = { '4:3': [4, 3], '3:2': [3, 2], '1:1': [1, 1], '16:9': [16, 9] };
    const [rw, rh] = ratios[aspectRatio] || [4, 3];
    if (rw >= rh) {
      outW = outputSize;
      outH = Math.round(outputSize * rh / rw);
    } else {
      outH = outputSize;
      outW = Math.round(outputSize * rw / rh);
    }

    // --- Set output canvas size ---
    this.outputCanvas.width = outW;
    this.outputCanvas.height = outH;
    const ctx = this.outputCanvas.getContext('2d');
    ctx.clearRect(0, 0, outW, outH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);

    // --- Create working canvas at output size ---
    const work = new OffscreenCanvas(outW, outH);
    const wCtx = work.getContext('2d');

    // Draw source image centered, sized to cover output, with transform applied
    const src = this.sourceImage;
    const srcAspect = src.naturalWidth / src.naturalHeight;
    const outAspect = outW / outH;
    let drawW, drawH;
    if (srcAspect > outAspect) {
      drawH = outH;
      drawW = drawH * srcAspect;
    } else {
      drawW = outW;
      drawH = drawW / srcAspect;
    }
    // Apply transform: translate to center + pan, rotate, scale (zoom + flip)
    wCtx.save();
    wCtx.translate(outW / 2 + panX * outW, outH / 2 + panY * outH);
    wCtx.rotate(rotation * Math.PI / 180);
    wCtx.scale((flipH ? -1 : 1) * zoom, (flipV ? -1 : 1) * zoom);
    wCtx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
    wCtx.restore();

    // --- Get pixel data for processing ---
    let imageData = wCtx.getImageData(0, 0, outW, outH);

    // 1. Apply image adjustments first (on raw image)
    imageData = this._applyImageAdjustments(imageData, {
      exposure, contrast, highlights, shadows, saturation, temperature
    });

    // 2. Apply barrel distortion
    if (distortion > 0) {
      imageData = this._applyBarrelDistortion(imageData, outW, outH, distortion, distortionType);
    }

    // 3. Apply chromatic aberration (blue fringe)
    if (fringeIntensity > 0) {
      imageData = this._applyChromAberration(imageData, outW, outH, fringeIntensity, fringeRadius);
    }

    // 4. Apply vignette
    if (vignetteIntensity > 0) {
      imageData = this._applyVignette(imageData, outW, outH, vignetteIntensity, vignetteRadius);
    }

    // 5. Apply circular mask + border
    imageData = this._applyCircularMask(imageData, outW, outH, borderSize, borderSoftness, borderColor);

    // --- Put final result ---
    ctx.putImageData(imageData, 0, 0);
    this.processing = false;
  }

  // ─────────────────────────────────────────────
  // IMAGE ADJUSTMENTS
  // ─────────────────────────────────────────────
  _applyImageAdjustments(imageData, { exposure, contrast, highlights, shadows, saturation, temperature }) {
    const data = imageData.data;
    const len = data.length;

    const expMul = Math.pow(2, exposure);
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Exposure
      r = clamp(r * expMul, 0, 255);
      g = clamp(g * expMul, 0, 255);
      b = clamp(b * expMul, 0, 255);

      // Temperature (warm/cool)
      if (temperature !== 0) {
        const t = temperature / 100;
        r = clamp(r + t * 25, 0, 255);
        b = clamp(b - t * 25, 0, 255);
      }

      // Contrast
      if (contrast !== 0) {
        r = clamp(contrastFactor * (r - 128) + 128, 0, 255);
        g = clamp(contrastFactor * (g - 128) + 128, 0, 255);
        b = clamp(contrastFactor * (b - 128) + 128, 0, 255);
      }

      // Shadows / Highlights (luminosity-based)
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

      // Saturation
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

  // ─────────────────────────────────────────────
  // BARREL DISTORTION (Fisheye)
  // ─────────────────────────────────────────────
  _applyBarrelDistortion(imageData, w, h, strength, type) {
    const src = imageData.data;
    const out = new ImageData(w, h);
    const dst = out.data;

    const cx = w / 2;
    const cy = h / 2;
    // Normalize radius to shortest half
    const maxR = Math.min(cx, cy);

    // k controls the distortion — VX1000 style is strong barrel
    const k = strength * 1.8;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Normalized coords [-1, 1]
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);

        let srcX, srcY;

        if (type === 'circular' && r > 1.0) {
          // Outside the fisheye circle — black
          const i = (y * w + x) * 4;
          dst[i] = 0; dst[i+1] = 0; dst[i+2] = 0; dst[i+3] = 255;
          continue;
        }

        // Barrel distortion: ru = rd * (1 + k * rd^2)
        // We invert it: given destination r, find source r
        // Using iterative approximation: rd -> ru
        let rd = r;
        // Forward mapping approximation (simple)
        const ru = rd * (1 + k * rd * rd);

        if (ru === 0) {
          srcX = cx;
          srcY = cy;
        } else {
          const scale = ru / (r || 0.0001);
          srcX = cx + nx * maxR * scale;
          srcY = cy + ny * maxR * scale;
        }

        // Bilinear sample
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

  // ─────────────────────────────────────────────
  // CHROMATIC ABERRATION (Blue Fringe)
  // ─────────────────────────────────────────────
  _applyChromAberration(imageData, w, h, intensity, fringe_radius) {
    const src = imageData.data;
    const out = new ImageData(w, h);
    const dst = out.data;

    // Copy full image first
    dst.set(src);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy);
    // Max pixel shift for blue channel
    const maxShift = intensity * 12;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);

        // Fringe starts at fringe_radius, maximum at edge
        const falloff = Math.max(0, (r - fringe_radius) / (1.0 - fringe_radius + 0.001));
        if (falloff <= 0) continue;

        // Shift amount grows with distance from center
        const shift = falloff * maxShift;

        // Blue channel: sample from slightly outward (pushes blue to edge)
        const blueX = x + (nx / (r + 0.001)) * shift;
        const blueY = y + (ny / (r + 0.001)) * shift;

        // Red channel: sample from slightly inward (subtle)
        const redX = x - (nx / (r + 0.001)) * shift * 0.3;
        const redY = y - (ny / (r + 0.001)) * shift * 0.3;

        const blueColor = bilinearSample(src, w, h, blueX, blueY);
        const redColor  = bilinearSample(src, w, h, redX, redY);

        const i = (y * w + x) * 4;
        dst[i]     = clamp(redColor[0], 0, 255);
        // Green stays (already copied)
        dst[i + 2] = clamp(blueColor[2], 0, 255);
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────
  // VIGNETTE
  // ─────────────────────────────────────────────
  _applyVignette(imageData, w, h, intensity, radius) {
    const data = imageData.data;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / maxR;
        const dy = (y - cy) / maxR;
        const r = Math.sqrt(dx * dx + dy * dy);

        // Smooth vignette falloff
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

  // ─────────────────────────────────────────────
  // CIRCULAR MASK + BORDER
  // ─────────────────────────────────────────────
  _applyCircularMask(imageData, w, h, borderSize, borderSoftness, borderColor) {
    const data = imageData.data;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy);

    // Circle radius: borderSize=0 → full circle touching edges, borderSize=1 → very small
    // Actually: borderSize controls how thick the black border is (0=none, 1=max)
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
          // Outside circle — border color
          data[i]     = borderVal;
          data[i + 1] = borderVal;
          data[i + 2] = borderVal;
          data[i + 3] = 255;
        } else if (r > circleR - softPx) {
          // Edge blend
          const t = (r - (circleR - softPx)) / (2 * softPx);
          const alpha = Math.max(0, Math.min(1, t));
          data[i]     = clamp(data[i]     * (1 - alpha) + borderVal * alpha, 0, 255);
          data[i + 1] = clamp(data[i + 1] * (1 - alpha) + borderVal * alpha, 0, 255);
          data[i + 2] = clamp(data[i + 2] * (1 - alpha) + borderVal * alpha, 0, 255);
        }
        // else: inside circle — keep as is
      }
    }
    return imageData;
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function bilinearSample(data, w, h, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  const sample = (px, py) => {
    const sx = clamp(px, 0, w - 1);
    const sy = clamp(py, 0, h - 1);
    const i = (sy * w + sx) * 4;
    return [data[i], data[i+1], data[i+2], data[i+3]];
  };

  const c00 = sample(x0, y0);
  const c10 = sample(x1, y0);
  const c01 = sample(x0, y1);
  const c11 = sample(x1, y1);

  return [
    c00[0] * (1-fx)*(1-fy) + c10[0] * fx*(1-fy) + c01[0] * (1-fx)*fy + c11[0] * fx*fy,
    c00[1] * (1-fx)*(1-fy) + c10[1] * fx*(1-fy) + c01[1] * (1-fx)*fy + c11[1] * fx*fy,
    c00[2] * (1-fx)*(1-fy) + c10[2] * fx*(1-fy) + c01[2] * (1-fx)*fy + c11[2] * fx*fy,
    c00[3] * (1-fx)*(1-fy) + c10[3] * fx*(1-fy) + c01[3] * (1-fx)*fy + c11[3] * fx*fy,
  ];
}
