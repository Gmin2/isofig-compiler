// isofig <file.fig> [-o out.svg]
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "./parse.ts";
import { build } from "./scene.ts";
import { render } from "./svg.ts";

export function compile(src: string): string {
  return render(build(parse(src)));
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node src/cli.ts <file.fig> [-o out.svg]");
  process.exit(2);
}
const input = args[0]!;
const outIdx = args.indexOf("-o");
const out = outIdx >= 0 ? args[outIdx + 1] : input.replace(/\.fig$/, ".svg");

try {
  const svg = compile(readFileSync(input, "utf8"));
  writeFileSync(out!, svg);
  console.log(out);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
