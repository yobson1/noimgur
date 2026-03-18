#!/bin/bash
FONT=$(fc-match "IBM Plex Mono:weight=500" --format="%{file}")
GREEN="#1BB76E"
SIZES=(16 32 48 96 128)

for SIZE in "${SIZES[@]}"; do
    magick -size ${SIZE}x${SIZE} xc:transparent \
        -font "$FONT" \
        -pointsize $((SIZE * 60 / 100)) \
        -fill white -gravity Center -annotate -$((SIZE / 6))+0 "no" \
        -fill "$GREEN" -gravity Center -annotate +$((SIZE / 3))+0 "i" \
        public/icon/${SIZE}.png
done

echo "done"
