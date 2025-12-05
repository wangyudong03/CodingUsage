# Coding Usage

**Effortless AI Usage Tracking** - No manual cookie extraction needed. This extension monitors your Cursor/Trae AI usage directly in your editor with automatic configuration and intelligent sync.

![Coding Usage Monitor Demo](img/cursorusage.gif)

## ✨ Highlights

- **🎯 Zero-Configuration Setup**: Browser extension auto-extracts session tokens from clipboard
- **⚡ Smart Sync**: Database-driven monitoring checks local changes every 5 seconds, only calls API when needed
- **🌐 Multi-Platform Support**: Works with both Cursor and Trae AI editors
- **👥 Team Collaboration**: Optional team server integration for shared usage tracking
- **🔐 Privacy-First**: Client API keys generated from device fingerprint (hostname + MAC)
- **🔄 Auto-Discovery**: Automatically finds and configures available team servers
- **📊 Rich Status Display**: Detailed tooltips with usage breakdown, progress bars, and billing cycle info

## Features

- Real-time usage monitoring with smart sync (no unnecessary polling)
- Visual progress bars and percentage indicators
- Automatic session token detection from clipboard
- Team server connectivity with health checks
- Support for both Cursor and Trae platforms
- One-click configuration through browser extensions

## Requirements

- A Cursor or Trae account
- Browser extension for automatic token extraction (optional but recommended)

## Extension Settings

* `cursorUsage.sessionToken`: Session token (auto-configured via browser extension)
* `cursorUsage.teamServerUrl`: Team server URL (auto-discovered from server list)
* `cursorUsage.clientApiKey`: Auto-generated device identifier (read-only)

## Quick Start

### Automatic Setup
1. Install the browser extension:
   - [Chrome Web Store](https://chromewebstore.google.com/detail/trae-usage-token-extracto/edkpaodbjadikhahggapfilgmfijjhei)
   - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/trae-usage-token-extracto/leopdblngeedggognlgokdlfpiojalji)
2. Visit cursor.com or trae.ai and log in
3. Token auto-copied to clipboard → extension auto-configures
4. Done! 🎉

## Usage

- **Single Click**: Refresh usage data
- **Double Click**: Open configuration menu
- **Status Bar**: Shows real-time usage with color-coded alerts

## Team Features (Optional)

Configure team server URL to enable:
- Shared usage tracking across team members
- Historical usage data and analytics
- Automated ping for connection status

## License

MIT

---

**Note**: This extension works with both Cursor and Trae AI editors, automatically detecting your platform.