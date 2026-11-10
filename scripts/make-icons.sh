#!/usr/bin/env bash
# Generate PWA icons with ImageMagick. The artwork matches public/icon.svg, drawn with
# ImageMagick primitives so no SVG delegate (rsvg/inkscape) is needed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/icons
GLYPH=(
  -size 512x512 xc:none
  -fill '#fbfaf6' -draw 'roundrectangle 120,150 392,394 24,24'
  -fill none -stroke '#0b2a5b' -strokewidth 22 -draw 'polyline 120,150 256,260 392,150'
  -stroke none -fill '#f2b705' -draw 'circle 372,372 372,294'
  -fill none -stroke '#0b2a5b' -strokewidth 22 -draw 'polyline 336,372 362,398 410,346'
)
magick -size 512x512 xc:none -fill '#0b2a5b' -draw 'roundrectangle 0,0 511,511 112,112' \
  \( "${GLYPH[@]}" \) -composite public/icons/icon-512.png
# Maskable: full-bleed background, artwork shrunk into the safe zone
magick -size 512x512 xc:'#0b2a5b' \( "${GLYPH[@]}" -resize 400x400 \) -gravity center -composite public/icons/maskable-512.png
magick public/icons/icon-512.png -resize 192x192 public/icons/icon-192.png
magick public/icons/maskable-512.png -resize 180x180 public/icons/apple-touch-icon.png
ls -la public/icons
