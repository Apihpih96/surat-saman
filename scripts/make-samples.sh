#!/usr/bin/env bash
# Render the FICTITIOUS sample letters (samples/*.txt) to images with ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/samples
render() { # name header_colour
  local name=$1 colour=$2
  magick -size 1000x1300 xc:'#fbfaf6' \
    -fill "$colour" -draw 'rectangle 0,0 1000,90' \
    -fill white -font DejaVu-Sans-Bold -pointsize 30 -annotate +40+58 'SURAT RASMI (CONTOH)' \
    -fill '#1d1d1f' -font DejaVu-Sans-Mono -pointsize 21 -interline-spacing 9 -annotate +40+140 "$(sed "s/%/%%/g" samples/$name.txt)" \
    \( -size 1000x1300 xc:none -fill 'rgba(220,0,0,0.13)' -font DejaVu-Sans-Bold -pointsize 110 \
       -gravity center -annotate 330x330+0+0 'CONTOH / SAMPLE' \) -composite \
    -gravity southeast -fill '#888' -font DejaVu-Sans -pointsize 16 -annotate +30+24 'Fictitious demo letter - Surat Saman' \
    -quality 85 "public/samples/$name.jpg"
}
render saman-pdrm '#0b2a5b'
render lhdn-notis '#00594f'
render tnb-bil '#b3261e'
ls -la public/samples
