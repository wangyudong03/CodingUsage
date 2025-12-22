# Coding Usage

No need to manually extract Cookies - monitor your Cursor/Trae AI usage, with support for remote data delivery to your self-hosted server.
Current Cursor usage rules: Basic $20 API usage + official Bonus usage provided by Cursor (currently $25) + Auto usage (currently $150). When the official statistics show "You've hit your usage limit", it only indicates that the basic $20 API usage has been exhausted (this is currently a Cursor statistics bug that incorrectly includes Auto usage in the count).

**English Version | [中文版](README_CN.md)**

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar.jpg" alt="Status Bar Configuration" width="400">
</div>

Currently supports [Cursor](cursor:extension/whyuds.coding-usage) and [Trae International](trae:extension/whyuds.coding-usage)

## Configuration Demo

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/standalone.gif" alt="Basic Configuration Demo" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>Basic Configuration Demo</em></p>

## Features

- **Easy Setup**: Browser extension automatically fetches tokens from the official website and copies to clipboard, IDE extension automatically reads and configures from clipboard
- **Real-time Updates**: Monitors local AI conversations every 10 seconds, fetches official usage API only when changes are detected
- **Team Collaboration**: Optional team server integration for shared usage tracking
- **Auto Discovery**: Automatically finds and configures available team servers, currently deployed to [Demo Server](http://115.190.183.157:3000/)
- **Detailed Display**: Comprehensive tooltips with usage details, progress bars, and billing cycle information

## Quick Start

### 1. Install IDE Extension
- <a href="cursor:extension/whyuds.coding-usage">Cursor Extension Store - CodingUsage</a>
- <a href="trae:extension/whyuds.coding-usage">Trae Extension Store - CodingUsage</a>

### 2. Double-click Status Bar at Bottom of Window

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/doubleclickconfig.png" alt="Double-click Status Bar Configuration" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/quickpick.png" alt="Open QuickPick Menu" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>Double-click Status Bar Configuration | Open QuickPick Menu</em></p>

### 3. Install Browser Extension from QuickPick Menu

### 4. Navigate to Official Website via Browser Extension or QuickPick

### 5. Return and Automatically Configure SessionToken

## Team Features (Optional)

Configure team server URL to enable:
- Shared usage tracking among team members
- Historical usage data and analytics
- Current online status
- Multi-account usage queries

### Personal Multi-Account Query

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/mystats.png" alt="Personal Multi-Account Query" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/plza.png" alt="Team Account Data" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>Personal Multi-Account Query | Team Account Data</em></p>

### Configuration Demo

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/teamserver.gif" alt="Team Server Connection Demo" width="600" style="display: inline-block; flex-shrink: 0;"> 
</div>

<p align="left"><em>Team Server Connection Demo</em></p>

## FAQ

#### Why does Cursor Pro subscription show a total of $45?
Currently, Pro total usage includes: $20 API fixed + $25 Bonus, Auto billing: $150

#### How often is the data updated?
The extension checks the local database every 10 seconds and only calls the official API when changes are detected, ensuring real-time updates while avoiding frequent requests.

#### Is a team server required?
No. The team server is an optional feature for team collaboration, historical data tracking, and personal multi-account tracking.
The current configured server is only for public demonstration purposes and is disabled by default. It's recommended to deploy your own team server on an internal network according to the submission protocol.

#### Team Mode Data Submission Format

```json
{"client_token":"ck_eb33d6fb4d5b541d28a0d042b0e4ba56","email":"aisrv0615@qiyi.com","expire_time":1767060076000,"membership_type":"pro","api_spend":2002,"api_limit":4500,"auto_spend":0,"auto_limit":15000,"host":"IQ275CG42123NJ","platform":"win32","app_name":"Cursor"}
```

#### Is my token secure?
Tokens are stored locally only. The extension does not send your token to any server except the official API.

---

## Support

For issues or suggestions, please submit an [Issue](https://github.com/lasoons/CodingUsage/issues) or [Pull Request](https://github.com/lasoons/CodingUsage/pulls).
