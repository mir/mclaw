<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  A personal AI assistant that runs agents in isolated containers and talks to you through Telegram.
</p>

<p align="center">
  <a href="https://nanoclaw.dev">nanoclaw.dev</a>&nbsp; • &nbsp;
  <a href="README_zh.md">中文</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

Using Claude Code, NanoClaw can rewrite itself to match your workflow instead of forcing you into a generic assistant framework.

## Quick Start

```bash
git clone https://github.com/qwibitai/NanoClaw.git
cd NanoClaw
claude
```

Before starting NanoClaw, create a Telegram bot with BotFather and add `TELEGRAM_BOT_TOKEN=...` to `.env`. Then run `/setup`.

## What NanoClaw Is

NanoClaw is a single Node.js process that:
- connects to Telegram,
- stores chat state in SQLite,
- runs Claude agents in isolated Linux containers,
- keeps memory and filesystem state separate per registered group,
- supports scheduled tasks that can message groups back.

The base repo is intentionally Telegram-first. If you want Slack, Discord, email, or a different runtime shape, change the code or add a skill to your fork.

## Why It Exists

The project is deliberately small. The core should stay understandable enough that one person can inspect it, modify it, and trust it. Isolation happens at the container boundary, not through application-level permission tricks.

## Current Behavior

- Telegram is the only built-in messaging channel.
- `TELEGRAM_BOT_TOKEN` is required at startup.
- A chat becomes discoverable only after the bot has already seen a message there.
- Group registration still happens from the main group via the IPC tools and SQLite state.
- Each registered group has isolated memory under `groups/<name>/`.

## Usage

Talk to your assistant with the trigger word (default: `@Maratai`):

```text
@Maratai send a Monday morning AI news briefing
@Maratai review the repo changes from this week and summarize risks
@Maratai remind me every weekday at 9am to check payroll
```

From the main group, you can register other Telegram groups after the bot has seen them:

```text
@Maratai list available groups
@Maratai join the Family Chat group
@Maratai schedule a Friday report for the dev-team group
```

Use `/chatid` in Telegram to get a chat or topic JID directly when needed.

## Architecture

```text
Telegram -> SQLite -> Polling loop -> Containerized Claude Agent -> Telegram
```

Key files:
- `src/index.ts` - Orchestrator, message loop, agent invocation
- `src/channels/telegram.ts` - Telegram bot integration
- `src/ipc.ts` - IPC watcher and task processing
- `src/task-scheduler.ts` - Scheduled task runner
- `src/db.ts` - SQLite state and migrations
- `src/container-runner.ts` - Containerized agent execution

## Configuration

All configuration is in `.env` (copy `.env.example` to get started). Values shown are defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | *(required)* | Bot token from @BotFather |
| `ASSISTANT_NAME` | `Maratai` | Trigger word used in chats (`@Name`) |
| `CONTAINER_IMAGE` | `nanoclaw-agent:latest` | Container image for agents |
| `CONTAINER_TIMEOUT` | `1800000` | Hard timeout per container run (ms) |
| `CONTAINER_MAX_OUTPUT_SIZE` | `10485760` | Max stdout/stderr per run (bytes) |
| `IDLE_TIMEOUT` | `1800000` | Keep container alive after last output (ms) |
| `MAX_CONCURRENT_CONTAINERS` | `5` | Max simultaneous containers |
| `POLL_INTERVAL` | `2000` | Message polling interval (ms) |
| `SCHEDULER_POLL_INTERVAL` | `60000` | Task scheduler check interval (ms) |
| `IPC_POLL_INTERVAL` | `1000` | IPC file watcher interval (ms) |
| `MAX_RETRIES` | `5` | Max retries before dropping failed messages |
| `BASE_RETRY_MS` | `5000` | Base delay for exponential backoff (ms) |
| `EXTRA_PROJECTS_DIR` | *(empty)* | Host dir mounted at `/workspace/extra/projects` in main containers |
| `TZ` | system tz | Timezone for scheduled tasks |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |

## Setup Notes

- `.env` must contain `TELEGRAM_BOT_TOKEN`.
- `/setup` validates environment, container runtime, service setup, and bot token presence.
- The `groups` setup step lists Telegram groups already discovered in SQLite; it does not force a sync.

## Contributing

Keep the base repo small. Improvements to reliability, security, and the Telegram-first workflow belong in core. New integrations or alternate product shapes should generally land as skills or in a fork.

## Docs

- [Requirements](docs/REQUIREMENTS.md)
- [Spec](docs/SPEC.md)
- [Security](docs/SECURITY.md)
- [Debug Checklist](docs/DEBUG_CHECKLIST.md)

## License

MIT
