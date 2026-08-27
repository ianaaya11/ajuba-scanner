export type FilterId = 'original' | 'color' | 'magic' | 'gray' | 'bw';

export interface Point {
  x: number;
  y: number;
}

/** Corners in top-left, top-right, bottom-right, bottom-left order, in source-image pixels. */
export type Quad = [Point, Point, Point, Point];

export interface Stroke {
  kind: 'draw' | 'highlight';
  color: string;
  width: number;
  /** Normalised 0..1 coordinates relative to the page, so annotations survive rescaling. */
  points: Point[];
}

export interface TextNote {
  kind: 'text';
  color: string;
  /** Font size as a fraction of page height. */
  size: number;
  at: Point;
  text: string;
}

export type Annotation = Stroke | TextNote;

/** One OCR word with its box in unrotated, normalised page coordinates. */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Page {
  id: string;
  /** Key of the processed image blob in the `blobs` store. */
  imageKey: string;
  width: number;
  height: number;
  /** 0, 90, 180 or 270 degrees clockwise, applied at render/export time. */
  rotation: number;
  filter: FilterId;
  annotations: Annotation[];
  ocrText?: string;
  ocrWords?: OcrWord[];
}

export interface Doc {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pages: Page[];
}
