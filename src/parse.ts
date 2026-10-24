export type Stmt = {
  kind: string;
  name: string;
  nums: number[];
  words: string[];
  opts: Record<string, string>;
  line: number;
  text: string;
};

export class ParseError extends Error {
  line: number;
  text: string;
  constructor(msg: string, line: number, text: string) {
    super(`line ${line}: ${msg}\n  ${text}`);
    this.line = line;
    this.text = text;
  }
}

const KINDS = new Set([
  "box", "slab", "shape", "word", "tray", "stack", "grid", "tag", "link", "brackets", "arrow", "dot", "cyl", "cone", "ground", "rule", "plate", "dish", "rod", "tube", "decal", "label", "wire", "track", "hole", "pattern", "ring", "accent", "icon",
  "enter", "float", "pulse", "flow", "slide", "bob", "blink", "ripple", "hover", "timeline",
  "on",
]);

// one statement per line: kind name [numbers] [words] [key=value]
export function parse(src: string): Stmt[] {
  const out: Stmt[] = [];
  src.split("\n").forEach((raw, i) => {
    const text = (raw.split("#")[0] ?? "").trim();
    if (!text) return;
    const line = i + 1;
    const parts = text.match(/"[^"]*"|\S+/g) ?? [];
    const kind = parts[0] ?? "";
    if (!KINDS.has(kind)) {
      throw new ParseError(`unknown keyword "${kind}", expected one of ${[...KINDS].join(", ")}`, line, text);
    }
    const name = parts[1];
    if (!name) throw new ParseError(`${kind} needs a name`, line, text);
    const nums: number[] = [];
    const words: string[] = [];
    const opts: Record<string, string> = {};
    for (const p of parts.slice(2)) {
      if (p.includes("=")) {
        const i = p.indexOf("=");
        opts[p.slice(0, i)] = p.slice(i + 1);
      } else if (/^-?\d+(\.\d+)?$/.test(p)) {
        nums.push(Number(p));
      } else {
        words.push(p.startsWith('"') ? p.slice(1, -1) : p);
      }
    }
    out.push({ kind, name, nums, words, opts, line, text });
  });
  return out;
}
