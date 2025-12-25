# Coding Usage

监控您的 Cursor/Trae/Antigravity AI 使用量情况，支持多IDE、多账号监控

当前使用量规则：
- **Cursor**: 基础20美元API使用量 + 官方额外Bonus使用量（当前25美元） + Auto使用量（当前150美元）
- **Trae**: 监控官方API提供的限额使用情况
- **Antigravity**: 监控 Claude 4.5、Gemini 3 Pro/Flash 等模型的限额与重置时间

**[English Version](README_EN) | 中文版**

| Cursor | Trae | Antigravity |
|:------:|:----:|:-----------:|
| ![Cursor](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_cursor.png) | ![Trae](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_trae.png) | ![Antigravity](https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/statebar_antigravity.png) |

---

## 场景一：单IDE单账号使用

> 仅使用 Cursor、Trae 或 Antigravity 其中一个，且只需监控当前登录账号

**只需从扩展商店安装即可，无需任何配置！**

- <a href="cursor:extension/whyuds.coding-usage">Cursor 扩展商店——CodingUsage</a>
- <a href="trae:extension/whyuds.coding-usage">Trae 扩展商店——CodingUsage</a>
- <a href="antigravity:extension/whyuds.coding-usage">Antigravity 扩展商店——CodingUsage</a>

安装后状态栏即可显示当前登录账号的使用量。

---

## 场景二：多IDE同时使用

> 同时使用 Cursor、Trae、Antigravity 等多个IDE，希望在任意一个IDE中查看所有IDE的使用量

**配置步骤：**

1. 在各个IDE中分别安装 CodingUsage 扩展
2. 双击状态栏，选择 **Show All** 选项
3. 重启IDE

配置完成后，可在任意一个IDE中查看所有已配置IDE的使用量统计。

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/ShowAll.gif" alt="ShowAll 功能演示" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>ShowAll 功能：在一个IDE中查看所有IDE使用量</em></p>

---

## 场景三：监控其他账号

> 需要监控除当前IDE登录账号外的其他账号使用量

**配置步骤：**

1. 双击状态栏，选择安装浏览器扩展
2. 在浏览器中登录目标账号的官网
3. 点击浏览器扩展，Token将自动获取并粘贴到IDE中

<div align="left">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/standalone.gif" alt="配置其他账号演示" width="600" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="left"><em>通过浏览器扩展快速配置其他账号</em></p>

<div align="center" style="display: flex; gap: 10px; overflow-x: auto; white-space: nowrap;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/doubleclickconfig.png" alt="双击状态栏配置" width="400" style="display: inline-block; flex-shrink: 0;">
  <img src="https://raw.githubusercontent.com/lasoons/CodingUsage/refs/heads/main/CodingUsage/img/quickpick.png" alt="唤醒QuickPick菜单" width="400" style="display: inline-block; flex-shrink: 0;">
</div>
<p align="center"><em>双击状态栏配置 | QuickPick菜单</em></p>

---

## 功能特性

- **多平台支持**：一套插件同时支持 Cursor、Trae 和 Antigravity 监控，自动切换显示
- **免配置监控**：监控当前登录账号时，所有IDE均无需任何配置，安装即用
- **秒级更新**：每10秒/分钟监控本地对话或进程，仅在变更时请求官方 API
- **使用量显示**：详细的工具提示，包含使用情况明细、进度条和账单周期信息

---

## 常见问题

#### Cursor的Pro订阅为什么显示总量45美元？
目前Pro总使用量为：API计费20美元固定 + 25美元Bonus，Auto计费：150美元

#### 数据多久更新一次？
扩展每10秒检查一次本地数据库变化，仅在检测到更改时才调用官方API，既保证实时性又避免频繁请求。

#### 我的令牌安全吗？
令牌仅存储在本地。扩展不会将您的令牌发送到除官方 API 之外的任何服务器。

#### 团队服务器是什么？
团队服务器是可选的高级功能，可用于团队协作场景下的共享使用情况追踪和历史数据分析。如需使用，可参考 [TeamServer 投递协议](https://github.com/lasoons/CodingUsage) 自行部署。

---

## 支持

如有问题或建议，欢迎提交 [Issue](https://github.com/lasoons/CodingUsage/issues) 或 [Pull Request](https://github.com/lasoons/CodingUsage/pulls)。
