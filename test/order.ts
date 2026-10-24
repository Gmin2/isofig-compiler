// every solid must be drawn after anything it stands in front of
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { inFront, order } from "../src/visible.ts";
import { cylBox } from "../src/svg.ts";
import { readFileSync } from "node:fs";

let bad = 0, checked = 0;
for (const file of process.argv.slice(2)) {
  let scene;
  try {
    scene = build(parse(readFileSync(file, "utf8")));
  } catch {
    // a figure that does not compile has no order to check
    continue;
  }
  // cylinders take part in the same order, by the room they occupy
  const boxes = [...scene.boxes, ...scene.cyls.map(cylBox)];
  const sorted = order(boxes);
  const at = new Map(sorted.map((b, i) => [b.name, i]));
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b) continue;
      if (inFront(a, b) && !inFront(b, a)) {
        checked++;
        if (at.get(a.name)! < at.get(b.name)!) {
          bad++;
          console.log(`  wrong: ${a.name} is in front of ${b.name} but drawn first (${file})`);
        }
      }
    }
  }
}
console.log(`${checked} ordering constraints, ${bad} broken`);
process.exit(bad ? 1 : 0);
