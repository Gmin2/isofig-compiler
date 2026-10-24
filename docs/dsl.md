# the isofig language

A figure is a few lines of text. Each line names a solid, a mark on one, or a bit
of motion, and the compiler turns the lot into one isometric svg.

This page describes what the compiler in `src/` reads. The grammar in
`isofig.lark` is the stricter subset a model is allowed to write: it caps line
counts, name lengths and decimals so generation cannot run away. Anything the
grammar accepts, the compiler accepts. The compiler also reads a handful of
extra statements used for hand built scenes, listed at the end.

## shape of a line

    kind name [numbers] [words] [key=value]

- one statement per line, words split on spaces, `"quoted text"` kept whole
- `#` starts a comment, blank lines are skipped
- names start with a letter, then letters, digits or `_`
- a name has to be defined on an earlier line before anything refers to it
- coordinates and sizes are scene units, not pixels. the compiler picks the
  scale and fits the figure to the canvas
- x runs to the front right, y to the front left, z up

The grammar adds a few limits on top: at most 28 lines, names up to 24
characters, numbers like `-123.456` (three digits either side of the point),
tag text in capitals, digits and `+ % & . / : · – -`, up to 24 characters.

## solids

Every solid takes exactly one placement (see below) and any number of options,
in any order.

    box   NAME w d h      <placement> [r=] [common]
    slab  NAME w d h      <placement> [r=] [common]
    tray  NAME w d h      <placement> [wall=0.3] [common]
    stack NAME w d h      <placement> [n=3] [gap=0] [step=dx,dy] [accent=i] [r=] [common]
    grid  NAME cell       <placement> [n=3,3,3] [pitch=cell] [common]
    cyl   NAME            <placement> [r=0.5] [h=1] [axis=z] [common]
    shape NAME KIND w d h <placement> [axis=z] [point=+x] [r=] [common]
    word  NAME "TEXT"     <placement> [size=1] [deep=0.25*size] [axis=y] [common]
    icon  NAME "glyph"    <placement> [size=1] [common]

- `box` and `slab` are the same thing; slab reads better for something flat.
  `r=` rounds the corners of the footprint, half the width of a square gives a
  disc (a coin is `slab c 2 2 0.2 r=1`)
- `tray` is an open box: a floor and four walls, each its own solid so depth
  order works for things sitting inside it
- `stack` is `n` copies of one layer going up, `gap` apart. `step=dx,dy` fans
  the layers sideways, `accent=i` lights one layer
- `grid` is a block of cubes of side `cell`, `pitch` apart, `n=x,y,z` of them
- `cyl` stands up along `axis` (x, y or z)
- `shape` is an extruded outline. KIND is one of `hex tri diamond star plus
  arrow chevron ring pill`. `axis=x` or `axis=y` stands it up, `point=` turns an
  arrow, chevron or tri
- `word` is block capitals and digits, one solid per letter. it stands facing
  the front unless `axis=` says otherwise
- `icon` stands a Material Symbols glyph in the scene. the name is free text
  (`"database"`, `"printer"`, `"server"`) and is resolved against the
  catalogue, with a list of common synonyms. an unknown name drops that icon
  with a note instead of failing the figure

Parts get names of their own, so later lines can point at them:

    stack deck ...    deck.0 deck.1 ... deck.N
    grid  block ...   block.000 block.102 ...   (x, y, z index)
    tray  t ...       t.floor t.wx0 t.wx1 t.wy0 t.wy1
    word  sign ...    sign.0 sign.1 ...

### placement

    at x y z            the near bottom corner of the solid
    on=NAME             centred on top of NAME
    beside=NAME [DIR]   next to NAME, DIR is +x -x +y -y (default +x), same z

`gap=` puts space between a solid and the one it sits on or beside. `float=dz`
lifts any solid by dz after it is placed. On a `stack`, `gap=` also spaces the
layers.

### common options

    accent          this is the part that matters
    tint=NAME       a distinct surface: yellow blue purple green lime pink orange teal grey
    hidden=dashed   draw the edges hidden behind this solid as dashes
    +x -x +y -y     direction for beside=

`accent` and `tint` are meaning, not colour. The style decides what they look
like (see "styles" below).

## marks

    tag      NAME "TEXT" [above|below]
    link     NAME OTHER [dashed] [corners]
    brackets NAME
    arrow    NAME from=A to=B [dashed] [accent]
    dot      NAME
    accent   NAME
    hole     NAME.FACE [r=0.5] [hex]
    pattern  NAME [n=4] [accent=i,j,...]
    ring     NAME [r=2] [n=12] [accent=i,j,...]

- `tag` puts a boxed label on a leader above a solid, or below it. Without a
  side the compiler may move it to keep labels apart. A tag can point at an arrow
- `link` draws a line between two solids, centre to centre, or with `corners`
  between their corners
- `brackets` draws screen space corner brackets round a solid
- `arrow` has three forms:
  - `from=a to=b`, two solids: the compiler routes it through the gap between
    them, level when they share a height, straight up or down when one is above
    the other, stopping short of both. Too little room is an error
  - `from=a to=+z` or `from=-x to=b`, a solid and a side (`+x -x +y -y +z -z`):
    an arrow leaving or coming in, up to 2 units long, shortened if something is
    in the way
  - `from=x,y,z to=x,y,z`, two points
- `dot` marks the top of a solid
- `accent NAME` lights a solid after the fact. naming a whole stack or grid
  lights every part, naming an arrow draws it in the accent
- `hole` cuts a round (or `hex`) hole in the `left`, `right` or `top` face of a
  solid or of one part: `sockets.000.top`
- `pattern` lays an n by n checker on the top of a solid and fills the listed
  cells
- `ring` draws `n` dashes in a circle of radius `r` round a solid, the listed
  ones lit, which reads as progress

## motion

A figure with any of these lines comes out as an animated svg (css keyframes).
Entrances play one after another in line order, everything else starts once
they have landed.

    enter    NAME drop|rise|pop|fade [from=OTHER] [stagger=s] [together]
    float    NAME
    pulse    NAME
    flow     ARROW
    slide    NAME by=x,y,z
    bob      NAME by=x,y,z
    blink    NAME
    ripple   NAME
    hover    NAME lift=h | open=x,y,z | glow
    timeline loop|once [hold=1.5]

- `enter` brings a solid in. `from=` makes it come out of another solid (the
  path is checked and refused if it would pass in front of something). on a
  stack or grid, `stagger=` seconds between parts. `together` starts it with the
  entrance before it
- `float` drifts a solid up and down, `pulse` breathes its scale
- `flow` runs dashes along an arrow
- `slide` moves one step and starts over, which along a row of the same thing
  reads as a belt that never stops. `bob` goes there and comes back
- `blink` switches a solid off and on, parts of a grid taking turns. `ripple`
  sends rings out over its top
- `hover` reacts to the pointer: rises, slides out, or lights up
- `timeline` says whether the whole thing loops, and how long it holds on the
  finished figure before it does. only one per figure

A solid can enter once, and can have one of slide or bob. Motion only applies
to solids (or their parts), except `flow`, which only applies to arrows.

## what the compiler does with it

1. parse each line (`src/parse.ts`)
2. build the scene: resolve placements and names, route arrows, expand stacks,
   grids, trays and words into parts (`src/scene.ts`)
3. settle: in lenient mode, a solid that sinks a hair into its neighbour is slid
   clear, along with whatever sits on it (`src/settle.ts`). deep overlaps are
   left alone
4. project with true 30 degree isometric (`src/iso.ts`), sort back to front by
   an exact separating axis test (`src/visible.ts`), clip hidden edges
5. paint with a style and write the svg, plus css motion if any (`src/svg.ts`,
   `src/motion.ts`)
6. lint: report solids running into each other and arrows running through a
   solid they do not join (`src/lint.ts`)

Strict mode (the default) refuses a figure with a problem it cannot draw, like
an arrow with no room. `lenient: true` draws what it can and lists what it left
out in `notes`.

## styles

Nothing in a figure is a colour. A style decides what accent, the nine tints,
ink and paper look like, so one figure can be drawn several ways without
changing a line.

    classic    black line, white faces, yellow accent (the default)
    line       ink and paper only
    mono       greys
    colour     muted colour
    blueprint  blue line on pale blue paper
    hairline   thin grey line, drawn in a flatter 2:1 view

    compile(src, { style: styleNamed("mono") })
    compile(src, { style: brandStyle({ base: "classic", accent: "#7c3aed", ink: "#1e293b", background: "transparent", tag: "pill" }) })

An unknown style name falls back to `classic`. Colours go into the svg as
literal hex so the file renders the same in resvg or any other rasteriser.
Every fill also carries a `data-role` (`face`, `accent`, `tint`, `ink`,
`sheet`, `line`, `knockout`) and the root carries `data-style`, so a page can
retheme a figure for dark mode by role.

## outside the grammar

The compiler also reads these, used for hand built reference scenes rather
than model output. They are not in `isofig.lark` and their options are best
read from `src/scene.ts`:

    cone   NAME <placement> [r=] [h=] [axis=] [cap=]
    rule   NAME from=x,y,z to=x,y,z [via=x,y,z] [dashed]
    plate  NAME pts=x,y;x,y;... | rect=x0,y0,x1,y1  [z=] [axis=] [round=] [h=]
    tube   NAME pts=x,y,z;x,y,z;... [r=0.2]
    rod    NAME from=x,y,z to=x,y,z [r0=] [r1=] [band=]
    dish   NAME pivot=x,y,z [r=] [focus=] [aim=az,el]
    wire   NAME pts=x,y,z;...
    label  NAME at x y z "TEXT" [dx=] [dy=] [size=]
    decal  NAME KIND on=SOLID.FACE ...
    on     SOLID.FACE SHAPE ...    inset rect bar disc ticks cells line arc ring tri
    ground NAME at x y [r=2]
    track  TARGETS attr=... values=...;... times=...;... dur=

`box` and `slab` likewise take extra options there (`taper`, `turn`, `tilt`,
`axis`, `look` and others), and `grid` takes `h=`, `cap=`, `captint=` and
`shape=cyl` for columns.

## examples

Three stepped plates, the top one the point:

    slab base 6 6 0.35 r=0.9 at 0 0 0
    slab mid 4.4 4.4 0.35 r=0.7 on=base gap=0.25
    slab top 2.8 2.8 0.35 r=0.5 on=mid gap=0.25 accent

A stack of coins and a card, labelled:

    stack coins 2 2 0.22 r=1 at 0 0 0 n=6 gap=0.06 accent=5
    box card 3 2 0.25 r=0.3 beside=coins +x gap=1.2
    tag coins "CREDITS"

Two boxes, an arrow between them that flows, the second one popping in:

    box a 2 2 1 at 0 0 0
    box b 2 2 1 beside=a +x gap=2 accent
    arrow go from=a to=b
    enter b pop
    flow go
