/** One CSV row: column name → cell text. */
export type Row = Record<string, string>;

export interface Dataset {
  fileName: string;
  headers: string[];
  rows: Row[];
}

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

/** Fill colour chosen per row from the value of a CSV column (e.g. colour-code by cabin). */
export interface ColorRule {
  column: string;
  /** value → CSS colour */
  map: Record<string, string>;
  /** used when the value is not in `map` */
  fallback: string;
}

interface BaseElement {
  id: string;
  name: string;
  /** Position & size in millimetres, relative to the card's top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  locked: boolean;
  hidden: boolean;
}

export interface TextElement extends BaseElement {
  kind: 'text';
  /** Text with {{Column}} placeholders. */
  content: string;
  fontFamily: string;
  fontSize: number; // pt
  /** When `shrinkToFit`, font size is reduced down to this (pt) until the text fits. */
  minFontSize: number;
  shrinkToFit: boolean;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  wrap: boolean;
  lineHeight: number; // multiplier
  letterSpacing: number; // em
  align: Align;
  vAlign: VAlign;
  color: string;
  bg: string; // CSS colour or 'transparent'
  colorRule: ColorRule | null;
  padding: number; // mm
  borderRadius: number; // mm
  borderWidth: number; // mm
  borderColor: string;
}

export interface RectElement extends BaseElement {
  kind: 'rect';
  bg: string;
  colorRule: ColorRule | null;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
}

/** Picture chosen per row from the value of a CSV column (e.g. a bear for the "Bears" group). */
export interface ImageRule {
  column: string;
  /** value → stored picture id */
  map: Record<string, string>;
  /** shown when the value is not in `map`; empty = show nothing */
  fallback: string;
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  /** Stored picture id of an uploaded picture, e.g. the camp logo ('' = none). */
  src: string;
  /** Optional: take the image URL from this CSV column instead of `src`. */
  srcColumn: string | null;
  /** Optional: pick a different uploaded image depending on a field's value. Takes priority over `srcColumn`. */
  imageRule: ImageRule | null;
  fit: 'contain' | 'cover' | 'fill';
  borderRadius: number;
}

export type TemplateElement = TextElement | RectElement | ImageElement;
export type ElementKind = TemplateElement['kind'];

/** Size and shape shared by both faces of a badge. */
export interface CardGeometry {
  width: number; // mm
  height: number; // mm
  borderRadius: number; // mm
}

/** Which face of a badge. */
export type SideId = 'front' | 'back';

/**
 * How many faces a badge has and where their artwork comes from:
 *  - `single`: front only
 *  - `same`: two faces, both printed from the front design
 *  - `different`: two faces with their own designs
 */
export type Sidedness = 'single' | 'same' | 'different';

/**
 * How a double-sided badge is printed:
 *  - `cutouts`: front and back side by side on one side of the paper, cut out and paired in a holder
 *  - `duplex`: fronts on one side of the sheet, backs on the other (printer flips the sheet)
 */
export type PrintMethod = 'cutouts' | 'duplex';

/** Everything one independently designed face owns. */
export interface SideDesign {
  bg: string;
  bgImage: string | null; // stored picture id
  elements: TemplateElement[];
}

export type PagePreset = 'A4' | 'A3' | 'Letter' | 'Legal' | 'custom';

export interface PageSettings {
  preset: PagePreset;
  width: number; // mm (portrait dimensions; swapped when landscape)
  height: number;
  landscape: boolean;
  margin: number; // mm
  gapX: number; // mm
  gapY: number;
  cutMarks: boolean;
  outline: boolean;
  /** Completed badges printed per selected row (each has one face, or two when double-sided). */
  copies: number;
  /** Only used for double-sided designs; one-sided designs always print ordinary sheets. */
  printMethod: PrintMethod;
}

/** An uploaded picture: the file name it was uploaded with and its contents. */
export interface StoredPicture {
  name: string;
  dataUrl: string;
}

/**
 * Uploaded pictures, stored once each and keyed by a hash of their content.
 * Image elements, picture-by-field rules and card backgrounds refer to them by id,
 * so the same picture used in several places costs its bytes only once.
 */
export type AssetStore = Record<string, StoredPicture>;

/**
 * Bumped whenever the saved format changes. A template with any other version is
 * rejected (see template-schema.ts); add a migration there once there are users to keep.
 */
export const TEMPLATE_VERSION = 1;

export interface Template {
  version: typeof TEMPLATE_VERSION;
  card: CardGeometry;
  sidedness: Sidedness;
  sides: {
    front: SideDesign;
    /** Kept while unused (single/same) so switching back to `different` restores it; null until first created. */
    back: SideDesign | null;
  };
  page: PageSettings;
  assets: AssetStore;
}

/** Result of measuring a rendered text element. */
export interface FitStatus {
  /** The text does not fit inside its own box, even at the minimum font size. */
  overflow: boolean;
  /** Some of the rendered text lies outside the card and will be cut off when printed. */
  clipped: boolean;
}

export const FITS: FitStatus = { overflow: false, clipped: false };

export function fitProblem(s: FitStatus | undefined): boolean {
  return !!s && (s.overflow || s.clipped);
}

/** Which data a card preview is rendered with. */
export type PreviewSource = { type: 'row'; index: number } | { type: 'shortest' } | { type: 'median' } | { type: 'longest' };
