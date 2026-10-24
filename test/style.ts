// Styles: the same scene painted differently, and the things that quietly break
// when a figure stops being black on white.
import { readFileSync } from "node:fs";
import { brandStyle, compile, isStyleName, STYLE_NAMES, STYLES, styleNamed, TINTS } from "../src/index.ts";

let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  ${detail}`}`);
};

const draw = (src: string, style?: string) => {
  const r = compile(src, { style: styleNamed(style), lenient: true });
  if (!r.ok) throw new Error(`${style ?? "default"}: ${r.error.message}`);
  return r.figure.svg;
};

const SCENE = `slab base 5 5 0.35 r=0.4 at 0 0 0 tint=green
slab mid 3.6 3.6 0.3 r=0.4 at 0.7 0.7 0.4
slab top 3.2 3.2 0.32 r=0.4 at 0.9 0.9 0.75 accent
tag top "READY"`;

{
  check("every name in the list resolves to a style", STYLE_NAMES.every((n) => styleNamed(n).name === n), STYLE_NAMES.join(","));
  check("a name nobody defined falls back instead of throwing", styleNamed("chartreuse").name === "classic");
  check("and so does nothing at all", styleNamed(undefined).name === "classic");
}

{
  // a style that forgets a tint would paint that face `undefined`
  for (const name of STYLE_NAMES) {
    const p = STYLES[name].palette as Record<string, string>;
    const missing = TINTS.filter((t) => typeof p[t] !== "string" || !/^#[0-9A-Fa-f]{3,6}$/.test(p[t]!));
    check(`${name} gives all nine tints a colour`, missing.length === 0, missing.join(", "));
  }
}

{
  // the grammar is what the model was trained against, so the names cannot drift
  const lark = readFileSync(new URL("../isofig.lark", import.meta.url), "utf8");
  const line = lark.split("\n").find((l) => l.startsWith("TINT:")) ?? "";
  const inGrammar = [...line.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
  check("the grammar and the code agree on the tint names",
    inGrammar.length === TINTS.length && inGrammar.every((t) => (TINTS as readonly string[]).includes(t)),
    `grammar ${inGrammar.join(",")} vs code ${TINTS.join(",")}`);
}

{
  const drawn = STYLE_NAMES.map((n) => draw(SCENE, n));
  check("the same scene comes out different in every style", new Set(drawn).size === STYLE_NAMES.length);
  check("and each says which style it was drawn in",
    drawn.every((s, i) => s.includes(`data-style="${STYLE_NAMES[i]}"`)));
}

{
  const classic = draw(SCENE, "classic");
  check("classic is unchanged: yellow call-out, green tint, black line", 
    classic.includes("#F5C542") && classic.includes("#8FD6A0") && classic.includes('stroke="#000"'), classic.slice(0, 200));
  const colour = draw(SCENE, "colour");
  check("colour paints the call-out terracotta and the tint sage",
    colour.includes("#D0603C") && colour.includes("#A8BCA0"));
  const mono = draw(SCENE, "mono");
  check("mono has no colour in it at all",
    !/#(?!fff\b|ffffff\b)[0-9A-Fa-f]{6}/.test(mono.replace(/#([0-9A-Fa-f])\1\1\1\1\1/g, "#gggggg")) ||
    [...mono.matchAll(/#[0-9A-Fa-f]{6}/g)].every((m) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(m[0].slice(i, i + 2), 16));
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) <= 8;
    }), [...new Set(mono.match(/#[0-9A-Fa-f]{3,6}/g))].join(" "));
}

{
  // line work is the case that breaks things: the call-out is the face colour, so
  // anything that used the accent as a mark would come out invisible
  const line = draw(SCENE, "line");
  const hexes = [...new Set(line.match(/#[0-9A-Fa-f]{3,6}/g) ?? [])].sort();
  check("line style is only ink and paper", hexes.join(" ") === "#000 #fff", hexes.join(" "));

  const arrow = draw('box a 2 2 1 at 0 0 0\nbox b 2 2 1 at 5 0 0\narrow go from=a to=b accent', "line");
  check("an accented arrow is still drawn in the ink, not in white",
    !/<(line|polyline|path)[^>]*stroke="#fff"/.test(arrow), arrow.slice(arrow.indexOf("<g "), arrow.indexOf("<g ") + 400));

  const cells = draw("slab p 3 3 0.3 at 0 0 0\npattern p n=3 accent=0,4,8", "line");
  check("a marked pattern cell is drawn in the ink, not white on white",
    cells.includes('fill="#000"'), [...new Set(cells.match(/fill="[^"]*"/g) ?? [])].join(" "));
  const classicCells = draw("slab p 3 3 0.3 at 0 0 0\npattern p n=3 accent=0,4,8", "classic");
  check("and classic still marks them in the yellow it always did", classicCells.includes('fill="#F5C542"'));
}

{
  // the page rethemes a figure by what a fill means, so the marks have to be there
  const svg = draw(SCENE, "classic");
  for (const role of ["sheet", "face", "accent", "tint", "line", "ink"]) {
    check(`the renderer marks the ${role}`, svg.includes(`data-role="${role}"`));
  }
  const tagged = draw(SCENE + '\ntag base "BASE"', "classic");
  check("and the knockout behind a label", tagged.includes('data-role="knockout"'));
}

{
  // a page offering a style picker asks isStyleName before passing a name on, so it
  // has to know exactly the styles that exist and nothing else
  check("every style the compiler has is a style name", STYLE_NAMES.every((n) => isStyleName(n)));
  check("and a name nobody defined is not", !isStyleName("chartreuse") && !isStyleName(""));
}

{
  // dark mode used to find its targets by matching "#fff" and "#000" in the css.
  // it goes by role now, so anything painted in ink or paper without one would
  // quietly stop following the page. this is the figure that would catch it.
  const everything = `slab base 6 6 0.35 r=0.4 at 0 0 0 tint=blue
box tower 1.4 1.4 2 at 0.5 0.5 0.35
box lit 1.4 1.4 1.4 at 3 0.5 0.35 accent
cyl pipe r=0.5 h=1.6 axis=z at 2 3.4 0.35
tray bin 2 2 0.9 wall=0.2 at 3.6 3 0.35
stack sheets 1.6 1.6 0.12 n=4 gap=0.18 at 0.4 3.2 0.35
grid pad 0.5 n=3,3,1 pitch=0.7 at 4.6 0.4 0.35
ring base r=2.4 n=8 accent=0,3
icon doc "database" at 5 5 0.35 size=0.9
hole tower.top r=0.3
pattern base n=4 accent=0,5,10
arrow go from=tower to=lit
link pipe bin dashed
tag lit "LIVE"
dot pipe`;
  const svg = draw(everything, "classic");
  const bare: string[] = [];
  for (const m of svg.matchAll(/<(\w+)([^>]*?)\/?>/g)) {
    const attrs = m[2]!;
    const inkOrPaper = /fill="#(fff|ffffff|000|000000)"/i.test(attrs) || /stroke="#(000|000000)"/i.test(attrs);
    if (inkOrPaper && !attrs.includes("data-role")) bare.push(`<${m[1]}${attrs.slice(0, 70)}`);
  }
  check("everything painted in ink or paper says what it is for", bare.length === 0, [...new Set(bare)].slice(0, 4).join(" | "));
}

{
  const lines = "slab a 2 2 0.4 at 0 0 0 accent\nslab b 2 2 0.4 at 4 0 0\narrow go from=a to=b\ntag a \"START\"";
  const r = compile(lines, { style: brandStyle({ base: "classic", accent: "#7c3aed", ink: "#1e293b", background: "transparent", tag: "pill" }) });
  const svg = r.ok ? r.figure.svg : "";
  check("a brand puts its own accent, ink and sheet on a style",
    svg.includes("#7c3aed") && svg.includes("#1e293b") && /fill="none" data-role="sheet"/.test(svg));
  const plain = compile(lines, { style: brandStyle({ base: "line" }) });
  const same = compile(lines, { style: styleNamed("line") });
  check("a brand that changes nothing is its base style", plain.ok && same.ok && plain.figure.svg === same.figure.svg);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
