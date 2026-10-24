// node src/lint-cli.ts <file.fig>...   one json line per figure
import { readFileSync } from "node:fs";
import { parse } from "./parse.ts";
import { build } from "./scene.ts";
import { lint } from "./lint.ts";
import { render } from "./svg.ts";

for (const file of process.argv.slice(2)) {
  try {
    const scene = build(parse(readFileSync(file, "utf8")));
    // some things are only refused while drawing, like motion that would pass behind a solid
    render(scene);
    const issues = lint(scene);
    console.log(JSON.stringify({ file, compiles: true, issues }));
  } catch (e) {
    console.log(JSON.stringify({ file, compiles: false, error: e instanceof Error ? e.message.split("\n")[0] : String(e), issues: [] }));
  }
}
