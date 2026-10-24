// How a figure is painted, separately from what is in it.
//
// The scene lines say what is there and which part matters: `slab plate ... accent`
// means "this one is the point", `tint=green` means "this is a distinct surface".
// Neither says anything about colour. This file decides what those mean, so the
// same figure can be drawn as pure line work, in greys, or in colour without the
// model writing a different line, and without a retrain.
//
// Colours are written into the svg as literal hex. The figures are rasterised by
// resvg for the training gallery and served as standalone files, and neither
// supports css variables in presentation attributes.

// The nine names a figure can ask for. Fixed: they are in the grammar
// (isofig.lark) and the model has learned them, so names are added here
// only alongside a retrain. What each one looks like is a style's business.
export const TINTS = ["yellow", "blue", "purple", "green", "lime", "pink", "orange", "teal", "grey"] as const;
export type Tint = (typeof TINTS)[number];

export type Palette = Record<Tint, string>;

import type { View } from "./iso.ts";

export type Style = {
  // travels onto the svg root as data-style, so a page can theme a figure and a
  // saved file still says how it was drawn
  name?: string;
  size: number;
  margin: number;
  // how a tag's label is drawn: the outlined box it always was, a rounded pill,
  // bare text, text over a rule, four corner ticks, or a soft filled chip. left
  // out, each figure picks one
  tag?: "box" | "pill" | "plain" | "underline" | "corners" | "chip";
  // the sheet behind the figure, and the knockout behind a label
  background: string;
  stroke: string;
  strokeWidth: number;
  // detail drawn on a face is lighter than the outline of a solid. measured off
  // the references at about two thirds, and without the contrast an object reads
  // as a flat diagram of itself.
  detailWidth?: number;
  // a face with nothing said about it
  face: string;
  // a face the figure calls out
  accent: string;
  // the same call-out where it is a mark rather than a surface: an accented arrow,
  // a filled pattern cell, a ring marker. Kept apart from `accent` because a style
  // whose accent is the face colour still has to draw a visible arrow.
  accentLine: string;
  palette: Palette;
  // how much lighter or darker each face of a solid is drawn. 1 leaves it alone,
  // which is what every style shipped so far does.
  shade?: { top: number; left: number; right: number };
  // Explicit tones for a plain face, used in place of `shade` when a style has
  // them. Shading by a factor cannot reach these: a measured side tone like
  // #DFEAFD needs 18% of the ink in red, 15% in green and 3% in blue, so it is a
  // chosen colour rather than a darkened white, and computing one instead gives
  // a figure more tones than the palette actually has.
  faces?: { top: string; left: string; right: string };
  // An arrowhead is an open chevron by default. A style can ask for a filled one
  // instead, which is what gives a rise or a flow real weight in a figure rather
  // than looking like a stray tick on the end of a line.
  arrowHead?: "line" | "solid" | "up";
  // Line weights given in scene units instead of pixels. A hand drawn figure's
  // lines are a fixed fraction of its unit, so a small figure and a large one
  // carry the same weight relative to their parts; fixed pixels make a large
  // figure look thin and a small one look heavy.
  unitStrokes?: boolean;
  arrowWidth?: number;
  // How a rounded solid is rounded. "plan" rounds the footprint and keeps the
  // sides straight; "faces" rounds every face as its own rectangle, which is the
  // softer look of a drawn object and reads very differently on thin slabs.
  round?: "plan" | "faces" | "prism";
  // Line tiers, darkest outside: a solid's silhouette, its rim, and the one
  // called out. A style that leaves them out draws every line in \`stroke\`.
  sil?: string;
  rimTone?: string;
  hiTone?: string;
  // lines stay this many screen pixels at any size, as a pen would
  hairline?: boolean;
  // drawn through a stylesheet of named looks instead of colours on each element,
  // as product site figures are: the css for those looks, scoped to the figure
  machine?: string;
  // decimal places coordinates are written to
  precision?: number;
  // the top of an accent solid. a lit top is a chosen colour, not one that
  // lightening the side colour reaches.
  lit?: string;
  // where the figure is seen from; left out it is 30 degree isometric
  view?: View;
  // the ground ring's own colour
  ghost?: string;
  // two more named tones a mark can ask for: a recess darker than any face, and
  // the light line used for slots and ruled detail
  deep?: string;
  thin?: string;
  // the top of any tinted solid. measured across the hand drawn set, every tinted
  // thing has the same light top whatever its sides are, so it is named rather
  // than derived from the tint
  tintTop?: string;
  // How heavy a line drawn on a face is next to one drawn free. A pen held to an
  // isometric face is foreshortened with it: the face matrix has determinant
  // cos 30, so its lines come out 0.866 of the width of a line drawn in screen
  // space. Leaving this at 1 draws every line at the same weight.
  faceInk?: number;
  // Scene furniture. The references all sit an object on a dashed ring and stand
  // it on a dotted field; neither is part of the figure, both are part of the look.
  ground?: { ring: boolean; dots: number; dotColour?: string };
  dash: string;
};

const GEOMETRY = { size: 512, margin: 52, dash: "6 5" };

// the look the site has always had: black line work, white faces, one yellow call-out
const CLASSIC_TINTS: Palette = {
  yellow: "#F5C542", blue: "#8FBEFF", purple: "#C3B1FF",
  green: "#8FD6A0", lime: "#CDE86B", pink: "#F7B2DD",
  orange: "#FFB27C", teal: "#8ED9D1", grey: "#DCE0E6",
};

// nothing is filled, so emphasis has to come from the line: an accented arrow is
// drawn thicker in the same ink rather than in a colour that is not there
const LINE_TINTS: Palette = {
  yellow: "#fff", blue: "#fff", purple: "#fff",
  green: "#fff", lime: "#fff", pink: "#fff",
  orange: "#fff", teal: "#fff", grey: "#fff",
};

// a ramp rather than nine near-identical greys, and none of it dark enough to
// swallow the black line work on top
const MONO_TINTS: Palette = {
  grey: "#ECECEA", lime: "#E1E1DD", yellow: "#D7D7D2",
  teal: "#CDCDC9", green: "#C3C3BF", blue: "#B9B9B6",
  pink: "#AFAFAD", purple: "#A5A5A3", orange: "#9B9B99",
};

// warm and muted, the set the reference figures use
const COLOUR_TINTS: Palette = {
  orange: "#D0603C", yellow: "#E3B356", green: "#A8BCA0",
  teal: "#92B5AE", blue: "#8FA9C4", purple: "#A99BC0",
  pink: "#DBA8A8", lime: "#C4CC8E", grey: "#D2CEC5",
};

// named up front so the set is a tuple the api can validate against, and so
// `satisfies Record<StyleName, Style>` below fails if one is ever left out
export const STYLE_NAMES = ["classic", "line", "mono", "colour", "blueprint", "hairline"] as const;
export type StyleName = (typeof STYLE_NAMES)[number];

// light from above and to the left, the way the reference illustrations read
export const LIT = { top: 1, left: 0.9, right: 0.8 };

// measured off the reference board rather than chosen
const BLUEPRINT_TINTS: Palette = {
  blue: "#B9D4F7", grey: "#A3C3F2", teal: "#A8CBEF", green: "#AECFE8",
  purple: "#C2CFF2", yellow: "#D6DFF6", lime: "#CBD9F4", pink: "#CCD6F3", orange: "#9FC0EC",
};

/**
 * Hairline: white plates and thin lines in three greys, darkest on the outside,
 * seen in 2:1 dimetric rather than isometric. Measured from the hairline figure
 * set (MIT, Lucas Marques): its palette, its 0.9px pen, its camera.
 */
/**
 * Machine: true isometric, one face colour, lines in two greys and one ink accent,
 * monospace labels, every look named so the figure can be restyled from css.
 * Measured from the classroomio machine figures.
 */
const MF = "oklch(0.97 0 0)", ML = "color(srgb 0.61045 0.610565 0.610576)", ML2 = "color(srgb 0.83151 0.831664 0.831678)";
const MT = "color(srgb 0.499919 0.500015 0.500024)", MI = "oklch(0.488 0.243 264.376)";
export const MACHINE: Style = {
  name: "machine",
  ...GEOMETRY,
  margin: 40,
  background: "#f5f5f5",
  stroke: "#9c9c9c",
  strokeWidth: 1.1,
  face: "#f5f5f5",
  accent: "#1447e6",
  accentLine: "#1447e6",
  hairline: true,
  machine: [
    "*{vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}",
    `.ln{fill:${MF};stroke:${ML};stroke-width:1.1}`,
    `.lo{fill:none;stroke:${ML};stroke-width:1.1}`,
    `.lt{fill:none;stroke:${ML2};stroke-width:1}`,
    `.dash{stroke-dasharray:3 4;stroke:${ML}}`,
    `.fl{fill:${MF};stroke:none}`,
    `.ink{fill:${MF};stroke:${MI};stroke-width:1.5}`,
    `.ko{fill:none;stroke:${MI};stroke-width:1.5}`,
    `.kf{fill:${MI};stroke:none}`,
    `.dot{fill:${ML};stroke:none}`,
    `.bar{stroke:${ML};stroke-width:2.4}`,
    "text{font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:8.5px;letter-spacing:0.03em;stroke:none}",
    `.tx{fill:${MT}}`,
    `.tk{fill:${MI}}`,
  ].join(""),
  palette: CLASSIC_TINTS,
};

export const HAIRLINE: Style = {
  name: "hairline",
  ...GEOMETRY,
  margin: 40,
  background: "#ffffff",
  stroke: "#c3c3c9",
  strokeWidth: 0.9,
  detailWidth: 0.9,
  face: "#ffffff",
  accent: "#232327",
  accentLine: "#232327",
  faces: { top: "#ffffff", left: "#ffffff", right: "#ffffff" },
  sil: "#a4a4ac",
  rimTone: "#e0e0e4",
  hiTone: "#232327",
  hairline: true,
  view: { az: 45, k: 0.5 },
  round: "prism",
  palette: CLASSIC_TINTS,
};

export const STYLES = {
  classic: {
    name: "classic",
    ...GEOMETRY,
    background: "#fff",
    stroke: "#000",
    strokeWidth: 1.5,
    face: "#fff",
    accent: "#F5C542",
    accentLine: "#F5C542",
    palette: CLASSIC_TINTS,
  },
  line: {
    name: "line",
    ...GEOMETRY,
    background: "#fff",
    stroke: "#000",
    strokeWidth: 1.5,
    face: "#fff",
    accent: "#fff",
    // the ink, so an accented arrow is a thicker black arrow instead of nothing
    accentLine: "#000",
    palette: LINE_TINTS,
  },
  mono: {
    name: "mono",
    ...GEOMETRY,
    background: "#fff",
    stroke: "#111",
    strokeWidth: 1.5,
    face: "#fff",
    accent: "#35332F",
    accentLine: "#35332F",
    palette: MONO_TINTS,
  },
  colour: {
    name: "colour",
    ...GEOMETRY,
    background: "#fff",
    stroke: "#14110E",
    strokeWidth: 1.5,
    face: "#FBF8F1",
    accent: "#D0603C",
    accentLine: "#D0603C",
    palette: COLOUR_TINTS,
  },
  blueprint: {
    name: "blueprint",
    ...GEOMETRY,
    margin: 92,
    background: "#EBF2FD",
    stroke: "#4A75BB",
    // in scene units: the hand drawn kit used 2.1px at a 48px unit
    unitStrokes: true,
    strokeWidth: 0.0438,
    detailWidth: 0.024,
    arrowWidth: 0.0708,
    face: "#FFFFFF",
    accent: "#3679C6",
    accentLine: "#3679C6",
    lit: "#6FA0E0",
    ghost: "#A9C5EA",
    deep: "#A3C3F2",
    thin: "#93B7E4",
    tintTop: "#DFEAFD",
    faceInk: 0.866,
    shade: { top: 1.53, left: 1, right: 1 },
    faces: { top: "#FFFFFF", left: "#DFEAFD", right: "#B9D4F7" },
    arrowHead: "up",
    round: "faces",
    ground: { ring: true, dots: 26, dotColour: "#C6D8F4" },
    palette: BLUEPRINT_TINTS,
  },
  // the hairline references as a look anyone can pick, with a softer accent: their
  // near black fill is the right match for the package but too heavy on a page
  hairline: { ...HAIRLINE, accent: "#6b6b74", accentLine: "#6b6b74", hiTone: "#6b6b74" },
} as const satisfies Record<StyleName, Style>;

/** The style a name asks for, or the default when the name is not one of ours. */
export function styleNamed(name: string | undefined): Style {
  return (name !== undefined && name in STYLES ? STYLES[name as StyleName] : STYLES.classic) as Style;
}

/** Whether a string is one of ours. */
export function isStyleName(name: string): name is StyleName {
  return (STYLE_NAMES as readonly string[]).includes(name);
}

export const DEFAULT: Style = STYLES.classic;


// A house look: one of the styles above with a team's own colours on it. Only what a brand
// usually fixes is open to change, the call-out colour, the ink and the sheet, and how tags
// look; the rest of a style is balanced around its own tones and is left as it is.
export const TAG_LOOKS = ["box", "pill", "plain", "underline", "corners", "chip"] as const;
export type Brand = {
  base: StyleName;
  accent?: string | undefined;
  ink?: string | undefined;
  // a colour, or "transparent" for a figure that sits on whatever page it is put on
  background?: string | undefined;
  tag?: (typeof TAG_LOOKS)[number] | undefined;
};

const mix = (a: string, b: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

export function brandStyle(brand: Brand): Style {
  const base = styleNamed(brand.base);
  const style: Style = { ...base, name: base.name ?? brand.base };
  if (brand.accent) {
    style.accent = brand.accent;
    style.accentLine = brand.accent;
    if (base.lit) style.lit = mix(brand.accent, "#ffffff", 0.45);
    if (base.hiTone) style.hiTone = brand.accent;
  }
  if (brand.ink) {
    style.stroke = brand.ink;
    if (base.sil) style.sil = brand.ink;
  }
  if (brand.background) style.background = brand.background === "transparent" ? "none" : brand.background;
  if (brand.tag) style.tag = brand.tag;
  return style;
}
