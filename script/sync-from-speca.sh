#!/bin/sh
# Bring the verbatim copy under speca/ up to date with a Speca checkout (default ../../Speca next to this repo's parent).
# Every file is copied as it is; speca/tsconfig.json (the one file of ours there) stays. Then run the tests: seam.test.ts
# fails if an address the seam replaces moved.
set -e
SPECA="${1:-/Users/roman/Projects/Speca}"
cd "$(dirname "$0")/.."
rm -rf speca/plugins/design-canvas && cp -R "$SPECA/plugins/design-canvas" speca/plugins/
for f in core/web/html.ts core/web/sandbox.ts core/web/fmt.ts core/web/ui/icons.ts core/web/ui/kit.ts core/util/merge3.ts core/i18n/en.ts core/i18n/ru.ts core/i18n/i18n.ts \
         web/assets/vendor/htmx.js web/assets/vendor/basecoat.css web/assets/vendor/basecoat.js web/assets/css/app.css web/assets/css/product.css; do
  mkdir -p "speca/$(dirname "$f")" && cp "$SPECA/$f" "speca/$f"
done
rm -rf speca/web/assets/vendor/fonts && cp -R "$SPECA/web/assets/vendor/fonts" speca/web/assets/vendor/
echo "speca/ ← $SPECA ($(cd "$SPECA" && git rev-parse --short HEAD)$(cd "$SPECA" && git diff --quiet -- plugins/design-canvas core web || echo ', with uncommitted changes'))"
