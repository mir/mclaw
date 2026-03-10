# NanoClaw Debug Checklist

## Quick Status Check

```bash
# Service status
launchctl list | grep nanoclaw

# Recent errors
grep -E 'ERROR|WARN' logs/nanoclaw.log | tail -20

# Telegram connection
grep -E 'Telegram bot connected|Telegram bot stopped|Telegram bot error' logs/nanoclaw.log | tail -10

# Registered groups loaded
grep 'groupCount' logs/nanoclaw.log | tail -3
```

## Bot Token and Discovery

```bash
# Confirm bot token exists
grep '^TELEGRAM_BOT_TOKEN=' .env

# See discovered Telegram groups/topics
sqlite3 store/messages.db "
  SELECT jid, name, last_message_time
  FROM chats
  WHERE channel = 'telegram' AND is_group = 1
  ORDER BY last_message_time DESC
  LIMIT 20;
"
```

If a Telegram group is missing from discovery:
- verify the bot was added to the chat
- send one message in the chat so the bot sees it
- if it is a forum/supergroup topic, send a message inside the topic
- use `/chatid` in Telegram to inspect the exact JID

## Agent Not Responding

```bash
grep 'New messages' logs/nanoclaw.log | tail -10
grep -E 'Processing messages|Spawning container' logs/nanoclaw.log | tail -10
grep -E 'Piped messages|sendMessage' logs/nanoclaw.log | tail -10
grep -E 'Starting container|Container active|concurrency limit' logs/nanoclaw.log | tail -10
```

## Scheduled Tasks

```bash
sqlite3 store/messages.db "
  SELECT id, group_folder, chat_jid, schedule_type, next_run, status
  FROM scheduled_tasks
  ORDER BY created_at DESC;
"
```

## Mount Issues

```bash
grep -E 'Mount validated|Mount.*REJECTED|mount' logs/nanoclaw.log | tail -10
cat ~/.config/nanoclaw/mount-allowlist.json
sqlite3 store/messages.db "SELECT jid, name, container_config FROM registered_groups;"
```

## Restarting

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
tail -f logs/nanoclaw.log
```
