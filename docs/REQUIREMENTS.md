# NanoClaw Requirements

## Intent

NanoClaw is a small, personal assistant that is easy to understand, easy to change, and safe enough to run because the actual trust boundary is the container runtime.

The base distribution is Telegram-first. It is not trying to be a universal chat gateway.

## Product Constraints

- One Node.js process.
- Telegram is the only built-in chat integration.
- `TELEGRAM_BOT_TOKEN` is required to start the runtime.
- Group isolation is mandatory: separate filesystem, memory, and agent session boundaries.
- Group registration is explicit and controlled from the main group.
- A Telegram chat is only discoverable after the bot has already seen a message there.
- Scheduled tasks are first-class and run through the same containerized agent path.
- Customization should happen through code changes, not layered runtime configuration.

## User Model

- `main` is the admin group.
- Non-main groups are untrusted.
- Users interact through Telegram groups, direct chats, and optionally Telegram topics.
- `/chatid` is the supported manual fallback for discovering a Telegram JID.

## Architecture Requirements

- Store chat metadata, messages, registrations, sessions, and tasks in SQLite.
- Route only registered groups into the agent loop.
- Preserve trigger-based behavior outside the main group unless `requiresTrigger=false`.
- Run Claude agents inside isolated Linux containers with explicit mounts only.
- Keep the project root read-only for agents.
- Support task scheduling, task history, and outbound messaging through IPC.

## Setup Requirements

- `/setup` validates host environment, credentials, container runtime, and Telegram token presence.
- No QR-code auth flow or channel-specific interactive login is part of the base product.
- Group discovery setup is passive: it lists groups already seen by the Telegram bot.

## Non-Goals

- Built-in WhatsApp support.
- A multi-channel abstraction that preserves old channel-specific setup flows.
- A configuration-heavy product meant to satisfy every deployment style out of the box.
