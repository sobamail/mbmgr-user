# Brand typeface — Idealist Sans

The Sobamail Design System UI face is **Idealist Sans** (Light 300 + Regular 400).
`src/design/fonts.css` declares `@font-face` rules pointing at:

    /fonts/IdealistSans-Light.ttf
    /fonts/IdealistSans-Regular.ttf

Drop those two `.ttf` files into **this directory** and the app picks them up
automatically. Until then the CSS falls back gracefully to the system UI stack
(`-apple-system, "Segoe UI", system-ui, …`), so nothing breaks — you just don't
get the exact brand letterforms.

## Where to get them

The binaries live in the "Sobamail Design System" project on claude.ai/design at:

    assets/fonts/IdealistSans-Light.ttf
    assets/fonts/IdealistSans-Regular.ttf

They exceed the 256 KiB per-file limit of the design-sync read API, so they
couldn't be pulled in automatically. Download them from the design project (or
copy from wherever the brand assets are kept locally) and place them here.
Filenames must match exactly.
