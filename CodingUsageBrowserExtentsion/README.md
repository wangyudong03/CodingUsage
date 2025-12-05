# AI IDE Usage Token Extractor

Automatically extract and copy session tokens from Cursor and Trae AI platforms for seamless IDE integration.

## Features

- Automatic token detection and extraction from dashboard visits
- One-click copy to clipboard with proper formatting
- Visual feedback through toast notifications and badge indicators
- Support for multiple AI IDE platforms (Cursor and Trae)
- Zero configuration required

## Installation

### From Browser Store
1. Install from Chrome Web Store or Microsoft Edge Add-ons
2. Visit your AI IDE platform and log in
3. Token automatically extracted and copied to clipboard

### Manual Installation
1. Download or clone this repository
2. Open `chrome://extensions/` in your browser
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Usage

### Cursor
1. Navigate to cursor.com/dashboard
2. Extension automatically extracts `WorkosCursorSessionToken`
3. Token copied to clipboard with format: `WorkosCursorSessionToken=<value>`
4. Return to your IDE - the extension will auto-configure

### Trae
1. Navigate to trae.ai/account-setting#usage
2. Extension monitors API calls and extracts `X-Cloudide-Session`
3. Token copied to clipboard with format: `X-Cloudide-Session=<value>`
4. Return to your IDE - the extension will auto-configure

## How It Works

**Cursor Platform:**
- Detects dashboard page visits
- Reads WorkosCursorSessionToken from browser cookies
- Automatically copies formatted token to clipboard

**Trae Platform:**
- Monitors ide_user_pay_status API requests
- Reads X-Cloudide-Session from browser cookies
- Uses smart debouncing to avoid multiple extractions

## Extension Interface

Click the extension icon to access:
- Quick navigation buttons to platform dashboards
- Platform-specific extraction instructions
- Help section with usage guide

## Technical Details

### Permissions Required
- `activeTab` - Read current tab URL
- `storage` - Store extracted tokens locally
- `webRequest` - Monitor network requests for Trae
- `tabs` - Detect dashboard visits
- `cookies` - Read session cookies
- `clipboardWrite` - Copy tokens to clipboard

### Supported Platforms
- Cursor (*.cursor.com)
- Trae (*.trae.ai)

## Privacy & Security

- All processing happens locally in your browser
- No data sent to external servers
- Tokens stored only in local browser storage
- Only accesses specific session cookies on supported domains
- Open source code available for audit

## Integration with IDE Extensions

This browser extension works with IDE extensions:

1. Browser extension extracts and copies token to clipboard
2. IDE extension auto-detects clipboard changes
3. Session automatically configured without manual steps

## Troubleshooting

**Token not extracted:**
- Verify you're logged into the platform
- Ensure you're on the correct page (dashboard/usage)
- Check extension badge for status indicator
- Try refreshing the page

**Clipboard issues:**
- Verify clipboard permissions are granted
- Check browser console for errors (F12)
- Try using extension popup buttons

**Extension not working:**
- Confirm extension is enabled in chrome://extensions/
- Verify you're on a supported domain
- Try reloading the extension

## Project Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for token extraction
├── content.js            # Content script for clipboard and UI
├── popup.html            # Extension popup interface
├── popup.js              # Popup interaction logic
├── icon16.png            # Extension icons
├── icon48.png
├── icon128.png
└── package.json          # Package configuration
```

## Development

### Building from Source
```bash
git clone <repository-url>
cd trae-usage-web-extension
npm run package
```

### Testing Locally
1. Make code changes
2. Navigate to chrome://extensions/
3. Click "Reload" on the extension card
4. Test on supported platforms

## Version History

**v1.3.0** - Current version
- Multi-platform support (Cursor + Trae)
- Enhanced popup UI
- Smart API monitoring with debouncing
- Improved notifications and status indicators

## License

MIT License

## Support

For issues and questions, please open an issue on the project repository.

---

Made for AI developers who want seamless IDE integration