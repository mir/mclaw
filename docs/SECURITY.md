# NanoClaw Security Model

## Trust Model

| Entity | Trust Level | Notes |
|--------|-------------|-------|
| Main group | Trusted | Admin control channel |
| Non-main groups | Untrusted | User input may be malicious |
| Telegram messages | Untrusted input | Potential prompt injection |
| Container agents | Sandboxed | Restricted to explicit mounts |

## Primary Boundary

The container runtime is the real security boundary.

- agents run in isolated Linux containers
- the project root is mounted read-only
- group directories are mounted separately
- mount permissions come from an external allowlist

## Data Protection

- SQLite and runtime state stay on the host
- the Telegram bot token stays in `.env` on the host
- only filtered Claude auth variables are mounted into containers
- mount allowlist lives outside the repo and is never mounted into containers

## Group Isolation

- each registered group has its own folder
- each group gets its own agent session state
- non-main groups cannot send IPC commands on behalf of other groups

## Telegram-Specific Notes

- only chats the bot has already seen are discoverable
- `/chatid` is the fallback path for explicit registration
- topics are isolated by topic-qualified JIDs

## Residual Risks

- agents can still misuse any host path you explicitly mount
- outbound network access is not restricted by default
- anyone able to message a registered group can still attempt prompt injection
