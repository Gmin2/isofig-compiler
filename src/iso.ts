// true 30 degree isometric. the two ground axes run at 30 degrees either side
// of horizontal, vertical stays vertical on screen.
export const KX = Math.cos(Math.PI / 6); // 0.8660254
export const KY = 0.5;

export type P3 = { x: number; y: number; z: number };
export type P2 = { x: number; y: number };

/**
 * A camera: the ground plane turned by `az` degrees, then tipped so it is seen
 * squashed by `k`. Left out, the projection is true 30 degree isometric, which is
 * az 45 with k 1/sqrt 3. Other figure sets are drawn from other places: 2:1
 * dimetric, the flatter pixel art view, is az 45 with k 0.5.
 */
export type View = { az: number; k: number };
const S = Math.sqrt(1.5);

export function project(p: P3, unit = 1, view?: View): P2 {
  if (view) {
    const a = (view.az * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const zf = Math.sqrt(1 - view.k * view.k);
    const X = p.x * c - p.y * s, Y = p.x * s + p.y * c;
    return { x: S * X * unit, y: S * (Y * view.k - p.z * zf) * unit };
  }
  return {
    x: (p.x - p.y) * KX * unit,
    y: (p.x + p.y) * KY * unit - p.z * unit,
  };
}

export type Box = {
  name: string;
  x: number; y: number; z: number;
  w: number; d: number; h: number;
  accent?: boolean | undefined;
  // a named colour from the palette, which wins over accent
  tint?: string | undefined;
  hidden?: "dashed" | "off" | undefined;
  // the inset of the soft rim drawn round the top of a prism, in scene units
  rim?: number | undefined;
  // the one solid a figure calls out, drawn with the darkest line
  hi?: boolean | undefined;
  // a prism whose top is smaller than its base, the way a keycap narrows: the top
  // ring is inset by \`taper\` with its own radius, and the rim has its own too
  taper?: number | undefined;
  topr?: number | undefined;
  rimr?: number | undefined;
  // how far the front of the base carries on down, fading out, as a ghost below
  reflect?: number | undefined;
  // points per quarter turn on a rounded corner; four unless a smoother one is asked for
  seg?: number | undefined;
  // which way a rounded solid is pushed out: up from its base, or sideways like a drawer face
  axis?: "x" | "y" | undefined;
  // a solid with any outline, a star or a letter, pushed out along `along`: the
  // outline's corners are in the box's own plane, measured from its corner, and
  // the first ring is the outside, any after it holes
  outline?: { rings: [number, number][][]; along: "x" | "y" | "z" } | undefined;
  // turned about the upright line through pivot, as a door swings on its hinge
  turn?: number | undefined;
  pivot?: [number, number] | undefined;
  // leaned about the level line along x through hinge (y, z), as a lid opens
  tilt?: number | undefined;
  hinge?: [number, number] | undefined;
  // rolled about the line along y through axle (x, z), as a bolt sits round a dial
  roll?: number | undefined;
  axle?: [number, number] | undefined;
  // drawn as a slab: the outline light and the near face outlined in full
  cap?: boolean | undefined;
  // the ring squashed into a window on its second coordinate, as a line of text
  // scrolling under a frame is pressed flat against its edge
  cut?: [number, number] | undefined;
  // names this one is drawn over whatever the depth order says
  over?: string[] | undefined;
  // the silhouette in a tone of its own
  edge?: string | undefined;
  // a named look from the style's sheet, for a style drawn through one
  look?: string | undefined;
  // an open box, a tray: walls rim thick round a floor this far up from its base.
  // it is drawn in two parts, the far walls under what it holds and the near wall over
  open?: boolean | undefined;
  floor?: number | undefined;
  // which part of an open box this is, when sorting
  shell?: "back" | "front" | undefined;
  // a top ring of its own size, centred over the base, for a solid that narrows
  // one way only, like a bracket arm
  topsize?: [number, number] | undefined;
  // corner radius of the footprint. half the width on a square gives a disc,
  // which is how a coin is drawn
  r?: number | undefined;
};

// the viewer sits toward +x +y +z, so the faces with those normals are the
// three we can see.
export function faces(b: Box): { id: "top" | "right" | "left"; pts: P3[] }[] {
  const { x, y, z, w, d, h } = b;
  const x1 = x + w, y1 = y + d, z1 = z + h;
  return [
    { id: "left", pts: [{ x, y: y1, z }, { x: x1, y: y1, z }, { x: x1, y: y1, z: z1 }, { x, y: y1, z: z1 }] },
    { id: "right", pts: [{ x: x1, y, z }, { x: x1, y: y1, z }, { x: x1, y: y1, z: z1 }, { x: x1, y, z: z1 }] },
    { id: "top", pts: [{ x, y, z: z1 }, { x: x1, y, z: z1 }, { x: x1, y: y1, z: z1 }, { x, y: y1, z: z1 }] },
  ];
}

export type FaceId = "top" | "right" | "left";

/**
 * A point on one face of a solid, given in that face's own coordinates.
 *
 * u and v both run 0 to 1 from the face's own origin corner, so a mark placed at
 * 0.5 0.5 is in the middle of the face whatever size or shape the solid is. The
 * corners come back from `faces` in a fixed order, origin then along u then the
 * far corner then along v, which is what makes this a plain bilinear step rather
 * than three special cases.
 */
export function onFace(b: Box, id: FaceId, u: number, v: number): P3 {
  const f = faces(b).find((x) => x.id === id)!;
  const [o, du, , dv] = f.pts;
  return {
    x: o!.x + u * (du!.x - o!.x) + v * (dv!.x - o!.x),
    y: o!.y + u * (du!.y - o!.y) + v * (dv!.y - o!.y),
    z: o!.z + u * (du!.z - o!.z) + v * (dv!.z - o!.z),
  };
}

// painter order. with no hidden line removal yet this is only correct when
// solids do not overlap on screen, which milestone 1 sticks to.
export function depth(b: Box): number {
  return b.x + b.y + b.z;
}

export function corners(b: Box): P3[] {
  const out: P3[] = [];
  for (const x of [b.x, b.x + b.w])
    for (const y of [b.y, b.y + b.d])
      for (const z of [b.z, b.z + b.h]) out.push({ x, y, z });
  return out;
}
