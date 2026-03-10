<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  一个通过 Telegram 与您通信、并在隔离容器中运行智能体的个人 AI 助手。
</p>

<p align="center">
  <a href="https://nanoclaw.dev">nanoclaw.dev</a>&nbsp; • &nbsp;
  <a href="README.md">English</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

NanoClaw 会使用 Claude Code 按您的需求直接修改代码，而不是让您去配置一个臃肿的平台。

## 快速开始

```bash
git clone https://github.com/qwibitai/NanoClaw.git
cd NanoClaw
claude
```

先用 BotFather 创建一个 Telegram 机器人，并把 `TELEGRAM_BOT_TOKEN=...` 写入 `.env`，然后运行 `/setup`。

## 现在的基础版本

- 内置消息渠道只有 Telegram
- 启动时必须提供 `TELEGRAM_BOT_TOKEN`
- 机器人看见消息之后，群组或话题才会出现在可注册列表里
- 每个已注册群组都有独立的 `groups/<name>/` 目录和容器上下文
- 定时任务仍然通过 Claude 智能体执行，并可回发 Telegram 消息

## 它做什么

NanoClaw 是一个单进程 Node.js 应用，负责：
- 连接 Telegram
- 把聊天状态存进 SQLite
- 在隔离 Linux 容器里运行 Claude 智能体
- 按群组隔离记忆和文件系统
- 运行计划任务并向聊天回传结果

## 使用方式

默认触发词是 `@Maratai`：

```text
@Maratai 每周一早上给我发 AI 新闻摘要
@Maratai 总结这个仓库这周的改动和风险
@Maratai 每个工作日上午九点提醒我检查报销
```

主群组可以管理其他 Telegram 群：

```text
@Maratai 列出可用群组
@Maratai 加入 Family Chat
@Maratai 给 dev-team 群安排周五报告
```

需要直接拿到聊天 ID 时，可以在 Telegram 里对机器人发送 `/chatid`。

## 架构

```text
Telegram -> SQLite -> 轮询循环 -> 容器化 Claude Agent -> Telegram
```

关键文件：
- `src/index.ts` - 编排器、消息循环、智能体调用
- `src/channels/telegram.ts` - Telegram 集成
- `src/ipc.ts` - IPC 与任务处理
- `src/task-scheduler.ts` - 计划任务执行
- `src/db.ts` - SQLite 状态与迁移
- `src/container-runner.ts` - 容器运行器

## 文档

- [需求说明](docs/REQUIREMENTS.md)
- [规格说明](docs/SPEC.md)
- [安全模型](docs/SECURITY.md)
- [调试清单](docs/DEBUG_CHECKLIST.md)

## 许可证

MIT
