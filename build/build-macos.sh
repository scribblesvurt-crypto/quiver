#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
APP_NAME="Quiver"
APP_DIR="$DIST_DIR/$APP_NAME.app"

echo "==> Cleaning previous build..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Step 1: Bundle with esbuild into a single file
echo "==> Bundling with esbuild..."
npx esbuild "$SCRIPT_DIR/sea-entry.js" \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile="$DIST_DIR/quiver-bundle.cjs" \
  --external:fsevents \
  --define:import.meta.url="'file:///quiver-bundle.cjs'" \
  --banner:js="/* Quiver */"

# Step 2: Create .app bundle
echo "==> Creating .app bundle..."
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy Info.plist
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/"

# Copy bundled JS
cp "$DIST_DIR/quiver-bundle.cjs" "$APP_DIR/Contents/Resources/"

# Copy UI files
cp -r "$PROJECT_DIR/ui" "$APP_DIR/Contents/Resources/ui"

# Step 3: Create the launcher script
cat > "$APP_DIR/Contents/MacOS/quiver" << 'LAUNCHER'
#!/bin/bash

# Find Node.js
NODE_BIN=""
for candidate in \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | tail -1)/bin/node" \
  /usr/bin/node \
  ; do
  if [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

# Also check PATH
if [ -z "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node 2>/dev/null || true)
fi

if [ -z "$NODE_BIN" ]; then
  osascript -e 'display dialog "Node.js is required but was not found.\n\nInstall it from https://nodejs.org or run:\n  brew install node" buttons {"OK"} default button "OK" with icon stop with title "Quiver"'
  exit 1
fi

# Get the Resources directory
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"

# Launch the server
exec "$NODE_BIN" "$DIR/quiver-bundle.cjs"
LAUNCHER

chmod +x "$APP_DIR/Contents/MacOS/quiver"

# Step 4: Sign the .app
echo "==> Signing .app..."
codesign --sign - --force --deep "$APP_DIR"

# Step 5: Zip for distribution
echo "==> Zipping..."
cd "$DIST_DIR"
zip -r -q "$APP_NAME.zip" "$APP_NAME.app"

# Cleanup
rm -f "$DIST_DIR/quiver-bundle.cjs"

echo ""
echo "==> Build complete!"
echo "    App: $APP_DIR"
echo "    Zip: $DIST_DIR/$APP_NAME.zip"
SIZE=$(du -sh "$APP_DIR" | cut -f1)
echo "    Size: $SIZE"
