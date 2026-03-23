#!/bin/bash
# cws-patch.sh <input.zip>
# Renames noimgur -> Rimgo Imgur Proxy in manifest/HTML/JS and swaps icons

set -e

INPUT_ZIP="$(realpath "$1")"
OUTPUT_ZIP="$(dirname "$INPUT_ZIP")/$(basename "${INPUT_ZIP%.zip}")-patched.zip"

if [ -z "$INPUT_ZIP" ]; then
    echo "Usage: $0 <input.zip>"
    exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Extracting $INPUT_ZIP..."
unzip -q "$INPUT_ZIP" -d "$WORK_DIR"

echo "Patching text..."
# Replace all lowercase occurrences of noimgur with Rimgo Imgur Proxy in text files
find "$WORK_DIR" -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.css" \) | while read -r file; do
    sed -i 's/noimgur/Rimgo Imgur Proxy/g' "$file"
done

# Patch the logo span specifically
find "$WORK_DIR" -type f -name "*.html" -o -name "*.js" | while read -r file; do
    sed -i 's|<span class="logo">no<span>imgur</span></span>|<span class="logo">rimgo<span>imgur</span>proxy</span>|g' "$file"
done

echo "Generating Chrome icons..."
ICON_DIR="$WORK_DIR/icon"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/gen-icons.sh" "$ICON_DIR" r:GREY i:GREEN p:GREY

echo "Repacking $OUTPUT_ZIP..."
cd "$WORK_DIR"
zip -qr "$OUTPUT_ZIP" .

echo "Done: $OUTPUT_ZIP"
