# glyphs

The drawings an `icon` line puts in a figure.

    Material Symbols, by Google, Apache License 2.0.
    https://github.com/google/material-design-icons
    Taken from the npm package @material-symbols/svg-400, version 0.47.5,
    rounded style, the outline variants rather than the filled twins.

`LICENSE` here is the Apache 2.0 text that came with them, kept because the
licence asks for it. Nothing about the art is changed: the compiler takes each
path exactly as it ships and only shifts it down off the set's own grid, whose y
runs from -960 to 0.

3927 glyphs live in `../src/glyphs.generated.ts` as one string, parsed the first
time a figure asks for one. To rebuild it after updating the set:

    npm pack @material-symbols/svg-400
    tar xzf material-symbols-svg-400-*.tgz
    node tools/build-glyphs.mjs package/rounded src/glyphs.generated.ts

A figure names a glyph in free text and the compiler resolves it, so the set can
be swapped or grown without touching the grammar or retraining the model.
