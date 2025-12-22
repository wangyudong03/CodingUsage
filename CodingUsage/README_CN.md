# Coding Usage

无需手动提取 Cookie，监控您的 Cursor/Trae AI 使用量情况，支持数据远程投递到自建服务器。
当前Cursor使用量规则：基础20美元API使用量+官方额外提供Bonus使用量（当前25美元）+ Auto使用量（当前150美元）。官方右下角统计显示"You've hit your usage limit" ，仅表示API基础20美元使用完毕（Cursor当前统计Bug，将Auto使用量一同计入）。

**[English Version](README.md) | 中文版**

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar.jpg" alt="状态栏配置" width="400">
</div>

当前支持[Cursor](cursor:extension/whyuds.coding-usage)、[Trae国际版](trae:extension/whyuds.coding-usage)

## 配置演示

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/standalone.gif" alt="基础配置演示" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>基础配置演示</em></p>

## 功能特性

- **配置设置**：浏览器扩展自动从官网获取令牌，复制到剪贴板，IDE扩展自动读取粘贴板进行配置
- **秒级使用量更新**：每10秒监控本地与AI对话，仅在对话变更时读取官方使用量API
- **团队协作**：可选的团队服务器集成，实现共享使用情况追踪
- **自动发现**：自动查找并配置可用的团队服务器，当前已部署至[演示服务器](http://115.190.183.157:3000/)
- **使用量显示**：详细的工具提示，包含使用情况明细、进度条和账单周期信息

## 快速开始

### 1. 安装IDE扩展
- <a href="cursor:extension/whyuds.coding-usage">Cursor 扩展商店——CodingUsage</a>
- <a href="trae:extension/whyuds.coding-usage">Trae 扩展商店——CodingUsage</a>

### 2. 双击窗口底部状态栏

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/doubleclickconfig.png" alt="双击状态栏配置" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/quickpick.png" alt="唤醒QuickPick菜单" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>双击状态栏配置 | 唤醒QuickPick菜单</em></p>

### 3. QuickPick菜单安装浏览器扩展

### 4. 浏览器扩展或QuickPick跳转至官网

### 5. 返回并自动配置SessionToken

## 团队功能（可选）

配置团队服务器 URL 以启用：
- 团队成员间的共享使用情况追踪
- 历史使用数据和分析
- 当前在线状态
- 多账号使用量查询

### 个人多账号查询

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/mystats.png" alt="个人多账号查询" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/plza.png" alt="团队账号数据" width="400" style="display: inline-block; flex-shrink: 0;">
</div>

<p align="center"><em>个人多账号查询 | 团队账号数据</em></p>

### 配置演示

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/teamserver.gif" alt="Team Server 连接演示" width="600" style="display: inline-block; flex-shrink: 0;"> 
</div>

<p align="left"><em>Team Server 连接演示</em></p>


## 常见问题

#### Cursor的Pro订阅为什么显示总量45美元？
目前Pro总使用量为，API计费20美元固定 + 25美元Bonus，Auto计费：150美元

#### 数据多久更新一次？
扩展每10秒检查一次本地数据库变化，仅在检测到更改时才调用官方API，既保证实时性又避免频繁请求。

#### 团队服务器是必需的吗？
不是。团队服务器是可选功能，用于团队协作和历史数据追踪，以及个人多账号追踪。
当前配置服务器仅作为公共演示使用，默认关闭，建议根据投递协议内网部署自己团队服务器。

#### 团队模式的投递数据格式

```json
{"client_token":"ck_eb33d6fb4d5b541d28a0d042b0e4ba56","email":"aisrv0615@qiyi.com","expire_time":1767060076000,"membership_type":"pro","api_spend":2002,"api_limit":4500,"auto_spend":0,"auto_limit":15000,"host":"IQ275CG42123NJ","platform":"win32","app_name":"Cursor"}
```

#### 我的令牌安全吗？
令牌仅存储在本地。扩展不会将您的令牌发送到除官方 API 之外的任何服务器。

---

## 支持

如有问题或建议，欢迎提交 [Issue](https://github.com/lasoons/CodingUsage/issues) 或 [Pull Request](https://github.com/lasoons/CodingUsage/pulls)。
