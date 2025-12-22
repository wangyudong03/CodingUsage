# Coding Usage

Monitor your Cursor/Trae/Antigravity AI usage, supporting multi-account local monitoring with optional data delivery to self-hosted servers.

Current usage rules:
- **Cursor**: Base $20 API usage + Official bonus ($25 currently) + Auto usage ($150 currently)
- **Trae**: Monitor API quota usage provided by the official platform
- **Antigravity**: Monitor quotas and reset times for Claude 4.5, Gemini 3 Pro/Flash, and other models

**English Version | [中文版](README_CN.md)**

| Cursor | Trae | Antigravity |
|:------:|:----:|:-----------:|
| ![Cursor](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_cursor.png) | ![Trae](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_trae.png) | ![Antigravity](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_antigravity.png) |


Currently supports [Cursor](cursor:extension/whyuds.coding-usage), [Trae International](trae:extension/whyuds.coding-usage), and **Antigravity**

## Configuration Demo

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/standalone.gif" alt="Basic Configuration Demo" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>Additional account configuration; no configuration needed for IDE login account</em></p>

## Features

- **Multi-Platform Support**: One extension supports Cursor, Trae, and Antigravity monitoring with automatic display switching
- **Zero-Configuration Monitoring**: Antigravity supports automatic local process detection and token retrieval without manual input
- **Real-time Updates**: Monitor local conversations or processes every 10 seconds/minute, only requesting official API when changes are detected
- **Team Collaboration**: Optional team server integration for shared usage tracking
- **Auto-Discovery**: Automatically finds and configures available team servers, currently deployed to [Demo Server](http://115.190.183.157:3000/)
- **Usage Display**: Detailed tooltips with usage breakdown, progress bars, and billing cycle information

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

### 3. Install Browser Extension via QuickPick Menu

### 4. Navigate to Official Website via Browser Extension or QuickPick

### 5. Return and Auto-configure SessionToken

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
Currently, the Pro total usage consists of: Fixed $20 API billing + $25 Bonus, Auto billing: $150

#### How often is data updated?
The extension checks local database changes every 10 seconds and only calls the official API when changes are detected, ensuring real-time updates while avoiding frequent requests.

#### Is the team server required?
No. The team server is an optional feature for team collaboration, historical data tracking, and personal multi-account tracking.
The current configured server is only for public demonstration, disabled by default. It's recommended to deploy your own team server internally according to the delivery protocol.

#### Data format for team mode delivery

```json
{"client_token":"ck_eb33d6fb4d5b541d28a0d042b0e4ba56","email":"aisrv0615@qiyi.com","expire_time":1767060076000,"membership_type":"pro","api_spend":2002,"api_limit":4500,"auto_spend":0,"auto_limit":15000,"host":"IQ275CG42123NJ","platform":"win32","app_name":"Cursor"}
```

#### Are my tokens safe?
Tokens are only stored locally. The extension does not send your tokens to any server except the official API.

---

## Support

For questions or suggestions, please submit an [Issue](https://github.com/lasoons/CodingUsage/issues) or [Pull Request](https://github.com/lasoons/CodingUsage/pulls).