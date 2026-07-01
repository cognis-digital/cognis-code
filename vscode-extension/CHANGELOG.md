# Changelog

## 0.1.0
First release — a local, uncensored, Copilot-class agent for VS Code, running entirely on your
own fleet (Ollama / llama.cpp). No cloud, no API keys, no limits.

- **Inline completions** (ghost text), routed to a code-specialized model
- **`@cognis` chat participant** — streaming, with `/agent` and `/edit` slash commands
- **Native Language Model Tools** — `cognis_shell`, `cognis_editFiles` (multi-file), `cognis_capability`, `cognis_connector`
- **Agent loop** — plan → run shell (destructive-guarded) → observe → fix, with an **auto-verify** step (runs your tests/build and repairs failures)
- **Code-model routing** — completions/edits use your best local coder (e.g. qwen3-coder via LM Studio, or codellama on Ollama)
- **Intelligent capability loading** — only the relevant repos/MCPs (of 400+) enter the model's context
- **27 connectors** with live actions (GitHub, Slack, Discord, Notion, Telegram, Gmail, GitLab, Linear, Jira, HubSpot, Sentry, Stripe, PagerDuty, Zendesk, Confluence, OpenWeather, Brave…)
