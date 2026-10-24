// Still frames of a figure's motion, one svg per moment.
//
//   node tools/frames.ts <file.fig> <out prefix> <seconds>...
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "../src/parse.ts";
import { build } from "../src/scene.ts";
import { render } from "../src/svg.ts";

const [file, prefix, ...times] = process.argv.slice(2);
if (!file || !prefix || !times.length) {
  console.error("usage: node tools/frames.ts <file.fig> <out prefix> <seconds>...");
  process.exit(2);
}
const scene = build(parse(readFileSync(file, "utf8")));
for (const t of times) writeFileSync(`${prefix}${t}.svg`, render(scene, {}, { at: Number(t) }));
