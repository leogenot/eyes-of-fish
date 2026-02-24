export type DistortionType = 'circular' | 'full';
export type BorderColor = 'black' | 'white';
export type AspectRatio = '4:3' | '3:2' | '1:1' | '16:9';

export interface Point {
  x: number;
  y: number;
}

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
  // Curve
  rgbCurve: Point[];
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
