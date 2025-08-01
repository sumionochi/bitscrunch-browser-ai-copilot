#!/bin/bash

# Build script for BitsCrunch NFT Analytics Extension

echo "Building BitsCrunch NFT Analytics Extension..."

# Build the React app
npm run build

# Copy necessary files to dist directory
echo "Copying extension files..."
cp public/manifest.json dist/
cp public/background.js dist/
cp public/content-script.js dist/

echo "Extension built successfully!"
echo "To test the extension:"
echo "1. Open Chrome/Brave/Edge"
echo "2. Go to chrome://extensions/"
echo "3. Enable 'Developer mode'"
echo "4. Click 'Load unpacked'"
echo "5. Select the 'dist' folder"
echo ""
echo "The extension will work as both a popup and sidepanel!" 