// Glyphs that stand in a figure.
//
// The model never draws art. It names a thing and the compiler drops the drawing
// in, which is the only way a small model gets a printer into a figure: asking it
// to draw one in correct isometric does not work, and the probe in the readme
// says so in numbers.
//
// A glyph is drawn in its own box with y down, like any svg, and is placed so its
// foot sits on the point it was given. It stands in the scene rather than being
// painted onto a face, because a face would project it a second time and skew it.
//
// The name is free text, resolved here. That is deliberate: the catalogue can
// grow without the grammar changing, so the model never needs retraining to
// reach a new glyph.
import { CATALOGUE, GRID } from "./glyphs.generated.ts";

// solid is a filled shape, line is a stroked outline. the set we ship is solid,
// and dark mode already swaps a #000 fill for the art colour
export type Glyph = { w: number; h: number; body: string; paint: "solid" | "line" };

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// four thousand lines of name and path, parsed the first time something asks for
// a glyph rather than at every start
let index: Map<string, string> | null = null;
function catalogue(): Map<string, string> {
  if (index) return index;
  index = new Map();
  for (const line of CATALOGUE.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) index.set(plain(line.slice(0, tab)), line.slice(tab + 1));
  }
  return index;
}

// the words a brief reaches for that are not the icon's own name
const ALIAS: Record<string, string> = {
  document: "description", doc: "description", file: "description", page: "description",
  report: "description", paper: "description", sheet: "description",
  server: "dns", servers: "dns", host: "dns", machine: "dns",
  db: "database", store: "database", table: "database",
  user: "person", customer: "person", people: "group", team: "group",
  pin: "location_on", marker: "location_on", place: "location_on",
  secure: "lock", security: "lock", private: "lock",
  settings: "settings", config: "settings", gear: "settings",
  queue: "list", log: "list", logs: "list",
  model: "network_intelligence", ai: "network_intelligence", agent: "smart_toy", bot: "smart_toy",
  alert: "warning", error: "error", failure: "error",
  money: "payments", payment: "payments", billing: "payments",
  chart: "bar_chart", graph: "bar_chart", metrics: "bar_chart", analytics: "bar_chart",
  email: "mail", message: "chat", chat: "chat",
  phone: "devices", mobile: "devices", laptop: "laptop_mac", computer: "computer",
  clock: "schedule", time: "schedule", timer: "timer",
  search: "search", find: "search", filter: "filter_alt",
  note: "sticky_note_2", notes: "sticky_note_2", memo: "sticky_note_2",
  room: "meeting_room", cog: "settings", workflow: "account_tree", pipeline: "account_tree",
  rate: "star", rating: "star", review: "star", favourite: "star",
};

/** The glyph a name asks for, or null when the catalogue has nothing like it. */
export function findGlyph(name: string): Glyph | null {
  const all = catalogue();
  const one = (word: string) => {
    const key = plain(word);
    return all.get(key) ??
      all.get(plain(ALIAS[key] ?? "")) ??
      // a plural nobody thought to list
      (key.endsWith("s") ? all.get(key.slice(0, -1)) ?? all.get(plain(ALIAS[key.slice(0, -1)] ?? "")) : undefined);
  };
  // a name the set does not have whole is often one of its words: "calendar event" is
  // an event, "how to rate" a star. the last word usually names the thing
  const words = name.trim().split(/[\s_]+/).filter((w) => w.length > 2);
  const d = one(name) ?? [...words].reverse().map(one).find(Boolean);
  if (!d) return null;
  // the set draws on a 960 grid whose y runs from -960 to 0, so it is shifted
  // down into a plain top left box here rather than at every use
  return { w: GRID, h: GRID, paint: "solid", body: `<g transform="translate(0 ${GRID})"><path d="${d}"/></g>` };
}

/** Every name the catalogue answers to. For tooling, and for the training grammar. */
export function glyphNames(): string[] {
  return [...catalogue().keys(), ...Object.keys(ALIAS)].sort();
}
