# BitsCrunch NFT Analytics Extension - Sidepanel Setup

## Overview

Your extension now supports both popup and sidepanel modes! The sidepanel provides a persistent interface that stays open while you browse OpenSea, making it easier to analyze NFTs without switching between tabs.

## Features Added

### 🆕 Sidepanel Support
- **Persistent Interface**: The extension now works in a sidepanel that stays open while browsing
- **Real-time Updates**: Automatically detects when you navigate to OpenSea NFT pages
- **External API Support**: All external API calls (BitsCrunch, OpenSea) work seamlessly in the sidepanel
- **Cross-browser Compatibility**: Works on Chrome, Brave, Edge, and other Chromium-based browsers

### 🔄 Enhanced NFT Detection
- **Content Script**: Automatically extracts NFT details from OpenSea pages
- **Multiple Detection Methods**: Uses URL parsing, JSON-LD data, and page content analysis
- **Real-time Updates**: Detects URL changes and page navigation
- **Fallback Support**: Works with both old and new OpenSea URL formats

## Installation & Setup

### 1. Build the Extension
```bash
# Run the build script
./build-extension.sh
```

### 2. Install in Browser
1. Open your browser (Chrome/Brave/Edge)
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist` folder from your project

### 3. Using the Sidepanel
1. **Open Sidepanel**: Click the extension icon in the toolbar
2. **Browse OpenSea**: Navigate to any OpenSea NFT page
3. **Automatic Detection**: The sidepanel will automatically detect NFT details
4. **Analyze**: Use the "Use Current Page NFT" button to analyze the current NFT

## How It Works

### Background Script (`background.js`)
- Manages communication between popup, sidepanel, and content scripts
- Handles tab updates and URL changes
- Coordinates NFT detail extraction
- Manages API key storage

### Content Script (`content-script.js`)
- Injected into OpenSea pages
- Extracts NFT details using multiple methods:
  - URL parsing for direct NFT links
  - JSON-LD structured data
  - OpenSea's internal data structures
  - Page content analysis
- Sends real-time updates when pages load or URLs change

### React App (`App.tsx`)
- Detects if running in sidepanel vs popup
- Shows current page information in sidepanel mode
- Provides refresh button for manual updates
- Maintains backward compatibility with popup mode

## API Integration

### External APIs Supported
- **BitsCrunch API**: All existing functionality works in sidepanel
- **OpenSea Integration**: Automatic NFT detail extraction
- **Cross-origin Requests**: Properly configured for external API calls

### Permissions Required
```json
{
  "permissions": [
    "storage",
    "activeTab", 
    "tabs",
    "scripting",
    "sidePanel"
  ],
  "host_permissions": [
    "https://api.unleashnfts.com/*",
    "https://opensea.io/*"
  ]
}
```

## Browser Compatibility

### ✅ Supported Browsers
- **Chrome** (v114+)
- **Brave** (v114+)
- **Edge** (v114+)
- **Other Chromium-based browsers** (v114+)

### 🔧 Requirements
- Manifest V3 support
- Sidepanel API support (Chrome 114+)
- Content script injection support

## Troubleshooting

### Sidepanel Not Opening
1. Check browser version (must be Chrome 114+)
2. Verify extension is properly installed
3. Check browser console for errors
4. Try refreshing the extension

### NFT Details Not Detected
1. Ensure you're on a valid OpenSea NFT page
2. Check if the page has fully loaded
3. Try refreshing the page
4. Use the manual refresh button in the sidepanel

### API Calls Not Working
1. Verify your API key is set
2. Check network connectivity
3. Ensure host permissions are granted
4. Check browser console for CORS errors

## Development

### File Structure
```
public/
├── manifest.json          # Extension manifest
├── background.js          # Background script
└── content-script.js      # Content script

src/
├── hooks/
│   └── useChromeExtension.ts  # Chrome API hook
├── types/
│   └── chrome.d.ts        # TypeScript definitions
└── App.tsx                # Main React component
```

### Key Components
- **`useChromeExtension`**: Custom hook for Chrome APIs
- **Content Script**: Handles page interaction
- **Background Script**: Manages extension state
- **Sidepanel UI**: Enhanced interface for persistent use

## Future Enhancements

- [ ] Support for more NFT marketplaces
- [ ] Enhanced error handling and user feedback
- [ ] Performance optimizations for large collections
- [ ] Additional analytics features
- [ ] Customizable sidepanel width

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify all files are properly built and copied
3. Test with different OpenSea NFT pages
4. Ensure API key is valid and has proper permissions 