# Code Usage

**Complete AI IDE Usage Monitoring Solution** - A comprehensive system for tracking and sharing Cursor/Trae AI usage across teams and communities.

![Code Usage System](docs/banner.png)

## 🎯 Overview

Code Usage is a three-component ecosystem that provides seamless, automatic usage tracking for AI-powered IDEs (Cursor and Trae). From zero-config token extraction to real-time dashboards, monitor your AI usage effortlessly.

## 📦 Components

### 1. [Browser Extension](./CodingUsageBrowserExtension)
**Automatic Token Extraction**

- Auto-detects and extracts session tokens from Cursor/Trae dashboards
- One-click copy to clipboard with proper formatting
- Zero configuration required
- Available on [Chrome Web Store](https://chromewebstore.google.com/detail/trae-usage-token-extracto/edkpaodbjadikhahggapfilgmfijjhei) and [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/trae-usage-token-extracto/leopdblngeedggognlgokdlfpiojalji)

### 2. [IDE Extension](./CursorUsage)
**Real-Time Usage Monitoring**

- Smart sync: checks local changes every 5s, calls API only when needed
- Visual progress bars in VS Code status bar
- Auto-generated client API keys from device fingerprint
- Team server integration support
- Works with both Cursor and Trae platforms

### 3. [Web Dashboard](./tool-cursor-usage-web)
**Shared Usage Analytics**

- Public plaza for community usage statistics
- Personal dashboard for multi-device tracking
- 30-day usage trend charts
- Privacy controls (public/private toggle per device)
- No registration required - bind API keys directly

## 🚀 Quick Start

### For Individual Users

1. **Install Browser Extension** (optional but recommended)
   - Chrome: [Install from Web Store](https://chromewebstore.google.com/detail/trae-usage-token-extracto/edkpaodbjadikhahggapfilgmfijjhei)
   - Edge: [Install from Add-ons](https://microsoftedge.microsoft.com/addons/detail/trae-usage-token-extracto/leopdblngeedggognlgokdlfpiojalji)

2. **Install IDE Extension**
   ```
   VS Code → Extensions → Search "Coding-Usage"
   ```

3. **Auto-Configure**
   - Visit cursor.com or trae.ai and log in
   - Token auto-copied → extension auto-configures
   - Done! 🎉

### For Teams

1. **Deploy Web Dashboard**
   ```bash
   cd tool-cursor-usage-web
   npm install
   npm start
   ```

2. **Configure Team Members**
   - Share server URL: `http://your-server:3000`
   - IDE extensions auto-discover and connect
   - View team usage in web dashboard

## 💡 How It Works

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser    │ Token   │     IDE      │  API    │     Web      │
│  Extension   │────────▶│  Extension   │────────▶│  Dashboard   │
│              │         │              │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
     Auto                     Smart                    Shared
   Extract                    Sync                   Analytics
```

1. **Browser Extension**: Extracts session token when you visit dashboard
2. **IDE Extension**: Monitors usage with intelligent sync (no unnecessary polling)
3. **Web Dashboard**: Aggregates and displays usage with privacy controls

## ✨ Key Features

### 🎯 Zero Configuration
- Automatic token extraction from clipboard
- Auto-generated client API keys (hostname + MAC)
- Auto-discovery of team servers

### ⚡ Smart Sync
- Database-driven monitoring (checks local changes every 5s)
- Only calls API when usage actually changes
- Minimal network overhead

### 🌐 Multi-Platform
- Supports both Cursor and Trae AI
- Cross-platform: Windows, macOS, Linux
- Multi-device aggregation in dashboard

### 👥 Team Ready
- Optional team server for shared tracking
- Public plaza for community statistics
- Privacy-first: toggle public/private per device

### 📊 Rich Analytics
- Real-time progress bars in IDE
- 30-day historical trends
- Color-coded usage alerts
- Detailed tooltips with breakdown

## 🛠️ Technology Stack

- **Browser Extension**: Vanilla JS, Chrome Extension APIs
- **IDE Extension**: TypeScript, VS Code Extension API, SQLite
- **Web Dashboard**: Node.js, Express, EJS, SQLite

## 📖 Documentation

- [Browser Extension Guide](./CodingUsageBrowserExtension/README.md)
- [IDE Extension Guide](./CursorUsage/README.md)
- [Web Dashboard Guide](./tool-cursor-usage-web/README.md)

## 🔐 Privacy & Security

- Client API keys generated from device fingerprint (no server-side secrets)
- Privacy-first: usage statistics are private by default
- Optional public sharing with per-device controls
- No registration required for web dashboard
- All data stored locally in SQLite (no cloud dependencies)

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -am 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📝 License

MIT License - see LICENSE file for details

## 🌟 Show Your Support

If this project helps you, please give it a ⭐️!

## 📧 Contact

- **Issues**: [GitHub Issues](https://github.com/yourusername/code-usage/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/code-usage/discussions)

---

**Made with ❤️ for AI developers who want effortless usage tracking** 🚀