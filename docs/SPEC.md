# NanoClaw Spec

## Overview

NanoClaw is a Telegram-connected Claude assistant that runs each group in an isolated container context.

Runtime flow:

```text
Telegram update -> SQLite -> polling loop -> containerized Claude agent -> Telegram response
```

## Core Components

- `src/index.ts`
  - loads SQLite-backed state
  - connects the Telegram channel
  - runs the message loop
  - starts IPC and scheduler subsystems

- `src/channels/telegram.ts`
  - receives Telegram messages, callbacks, and media placeholders
  - exposes `/chatid` and `/ping`
  - sends replies, topic replies, typing indicators, and inline keyboards

- `src/db.ts`
  - owns schema creation and migrations
  - stores chat metadata, messages, registrations, tasks, sessions, and router state
  - purges legacy WhatsApp rows during init

- `src/ipc.ts`
  - receives outbound message and task requests from agent containers
  - authorizes cross-group actions
  - supports `register_group`, scheduling, and task management

- `src/task-scheduler.ts`
  - evaluates due tasks
  - runs them through the same container execution path
  - sends task output back through Telegram

## Startup Contract

- `TELEGRAM_BOT_TOKEN` must be present in `.env` or the process fails fast.
- Container runtime must be available.
- Existing WhatsApp rows in SQLite are removed on startup so discovery is Telegram-only.

## Group Discovery and Registration

- Telegram chats appear in `available_groups.json` only after the bot has seen a message there.
- Main-group agents can register a group by JID through IPC.
- Supported JID shapes:
  - `tg:<chat_id>`
  - `tg:<chat_id>:topic:<thread_id>`

## Message Processing

- Main group processes all messages.
- Other groups require the trigger unless `requiresTrigger=false`.
- Topic messages keep a topic-qualified JID and separate session key.
- Agent output strips `<internal>...</internal>` blocks before user delivery.

## Scheduling

- Supported schedules:
  - cron
  - interval in milliseconds
  - one-time local timestamp
- Tasks run in either `group` or `isolated` context mode.
- Main group can target any registered group.
- Non-main groups can only manage their own tasks.

## Security Expectations

- Containers are the primary isolation boundary.
- Only explicit mounts are visible to agents.
- Project root is mounted read-only.
- Credential exposure is minimized to the variables required for Claude auth and runtime behavior.
