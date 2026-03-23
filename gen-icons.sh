#!/bin/bash
# Usage: gen-icons.sh [output_dir] LETTER:COLOR [LETTER:COLOR ...]
# Colors can be named vars (GREEN, GREY) or hex values (#ff0000)
# Example: gen-icons.sh public/icon r:#9ca3af i:GREEN p:#9ca3af
# Example: gen-icons.sh r:GREY i:GREEN p:GREY  (uses default output dir)

FONT=$(fc-match "IBM Plex Mono:weight=500" --format="%{file}")
GREEN="#1BB76E"
GREY="#9ca3af"
SIZES=(16 32 48 96 128)

resolve_color() {
    local arg="$1"
    local resolved="${!arg}"
    if [ -n "$resolved" ]; then
        echo "$resolved"
    else
        echo "$arg" # assume raw hex
    fi
}

# Check if first arg looks like an output dir (no colon)
if [[ "$1" != *":"* ]]; then
    OUTPUT_DIR="$1"
    shift
else
    OUTPUT_DIR="public/icon"
fi

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 [output_dir] LETTER:COLOR [LETTER:COLOR ...]"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Parse letter:color pairs
LETTERS=()
COLORS=()
for arg in "$@"; do
    LETTER="${arg%%:*}"
    COLOR_ARG="${arg#*:}"
    LETTERS+=("$LETTER")
    COLORS+=("$(resolve_color "$COLOR_ARG")")
done

COUNT="${#LETTERS[@]}"

for SIZE in "${SIZES[@]}"; do
    POINTSIZE=$((SIZE * 60 / 100))
    CMD=(convert -size "${SIZE}x${SIZE}" xc:transparent -font "$FONT" -pointsize "$POINTSIZE")

    # Space letters evenly across the icon
    # For N letters, positions go from -(N-1)/2 * SPACING to +(N-1)/2 * SPACING
    SPACING=$((SIZE / 3))

    for ((idx = 0; idx < COUNT; idx++)); do
        LETTER="${LETTERS[$idx]}"
        COLOR="${COLORS[$idx]}"

        # Offset: centre around 0
        # idx=0 -> -(COUNT-1)/2 * SPACING, idx=COUNT-1 -> +(COUNT-1)/2 * SPACING
        OFFSET=$(((idx * 2 - (COUNT - 1)) * SPACING / 2))

        if ((OFFSET >= 0)); then
            ANNOTATE_ARG="+${OFFSET}+0"
        else
            ANNOTATE_ARG="${OFFSET}+0"
        fi

        CMD+=(-fill "$COLOR" -gravity Center -annotate "$ANNOTATE_ARG" "$LETTER")
    done

    CMD+=("${OUTPUT_DIR}/${SIZE}.png")
    "${CMD[@]}"
done

echo "done"
