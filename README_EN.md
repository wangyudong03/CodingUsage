# Coding Usage

Monitor your Cursor/Trae AI usage, supporting multi-account monitoring and remote data delivery to self-hosted servers.
Current Cursor usage rules: Basic $20 API usage + Official Bonus usage (currently $25) + Auto usage (currently $150).

**English Version | [中文版](README.md)**

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar.jpg" alt="Status Bar Configuration" width="400">
</div>

Currently supports [Cursor](cursor:extension/whyuds.coding-usage), [Trae International](trae:extension/whyuds.coding-usage)

## Features

- **Configuration Settings**: Cursor logged-in account serves as the primary account without configuration needed; secondary accounts can be configured via browser extension to automatically obtain SessionToken
- **Multi-Account Monitoring**: Monitor up to 3 secondary account usage data
- **Second-Level Usage Updates**: Monitor local AI conversations every 10 seconds, only reading official usage API when conversation changes
- **Team Collaboration**: Optional team server integration for shared usage tracking
- **Auto Discovery**: Automatically find and configure available team servers, currently deployed to [Demo Server](http://115.190.183.157:3000/)
- **Usage Display**: Detailed tooltips including usage details, progress bars, and billing cycle information


## Configuration Demo

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/standalone.gif" alt="Basic Configuration Demo" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>Configuration Demo</em></p>

## Quick Start

### 1. Install IDE Extension
- <a href="cursor:extension/whyuds.coding-usage">Cursor Extension Store - CodingUsage</a>
- <a href="trae:extension/whyuds.coding-usage">Trae Extension Store - CodingUsage</a>

### 2. Double-click the status bar at the bottom of the window

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/doubleclickconfig.png" alt="Double-click status bar to configure" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/quickpick.png" alt="Open QuickPick menu" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>Double-click status bar to configure | Open QuickPick menu</em></p>

### 3. Install browser extension from QuickPick menu

### 4. Navigate to official website via browser extension or QuickPick

### 5. Return and automatically configure SessionToken

## Team Features (Optional)

Configure team server URL to enable:
- Shared usage tracking among team members
- Historical usage data and analytics
- Current online status
- Multi-account usage queries

### Personal Multi-Account Query

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/mystats.png" alt="Personal multi-account query" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/plza.png" alt="Team account data" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>Personal multi-account query | Team account data</em></p>

### Configuration Demo

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/teamserver.gif" alt="Team Server Connection Demo" width="600" style="display: inline-block; flex-shrink: 0;"> 
</div>

<p align="left"><em>Team Server Connection Demo</em></p>


## FAQ

#### Why does Cursor Pro subscription show $45 total?
Currently, Pro total usage is: API billing $20 fixed + $25 Bonus, Auto billing: $150

#### How often does data update?
The extension checks for local database changes every 10 seconds and only calls the official API when changes are detected, ensuring real-time updates while avoiding frequent requests.

#### Is the team server required?
No. The team server is an optional feature for team collaboration and historical data tracking, as well as personal multi-account tracking.
The current configured server is only for public demonstration, disabled by default. It's recommended to deploy your own team server on an internal network according to the delivery protocol.

#### Team mode data delivery format

```json
{"client_token":"ck_eb....","email":"aisrvxxx@qiyi.com","expire_time":1767060076000,"membership_type":"pro","api_spend":2002,"api_limit":4500,"auto_spend":0,"auto_limit":15000,"host":"IQ275CG42123NJ","platform":"win32","app_name":"Cursor"}
```

#### Is my token secure?
Tokens are only stored locally. The extension does not send your token to any server except the official API.

---

## Support

For questions or suggestions, feel free to submit an [Issue](https://github.com/lasoons/CodingUsage/issues) or [Pull Request](https://github.com/lasoons/CodingUsage/pulls).