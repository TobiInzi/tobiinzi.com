# tobiinzi.com

Personal site and portfolio.

## Favicons

Two SVG sources, both a dark "T" mark on `#0a0a0d` (matches the site `--bg`):

- `icon.svg` — rounded square, big T. Used directly in the tab and as the source
  for the `any`-purpose rasters (favicon, apple-touch, the standard PNGs).
- `icon-maskable.svg` — full-bleed square with the T pulled into the Android
  adaptive-icon safe zone (central 80%). Source for the `maskable` PNGs only.

The committed rasters are rendered from these — no build step. The
`--export-background` fills the corners so the opaque/maskable PNGs are full
squares. To regenerate (Inkscape + ImageMagick):

```sh
BG="#0a0a0d"
# any-purpose (from icon.svg)
inkscape icon.svg --export-type=png --export-filename=apple-touch-icon.png -w 180 -h 180 --export-background="$BG" --export-background-opacity=1
inkscape icon.svg --export-type=png --export-filename=icon-192.png -w 192 -h 192 --export-background="$BG" --export-background-opacity=1
inkscape icon.svg --export-type=png --export-filename=icon-512.png -w 512 -h 512 --export-background="$BG" --export-background-opacity=1
inkscape icon.svg --export-type=png --export-filename=round-64.png -w 64 -h 64   # rounded, transparent corners
magick round-64.png -define icon:auto-resize=48,32,16 favicon.ico
# maskable-purpose (from icon-maskable.svg)
inkscape icon-maskable.svg --export-type=png --export-filename=icon-maskable-192.png -w 192 -h 192 --export-background="$BG" --export-background-opacity=1
inkscape icon-maskable.svg --export-type=png --export-filename=icon-maskable-512.png -w 512 -h 512 --export-background="$BG" --export-background-opacity=1
```
