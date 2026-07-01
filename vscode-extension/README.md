# Cognis Code — local, uncensored AI agent for VS Code

A private coding agent that runs entirely on **your** fleet (Ollama / llama.cpp). Chat, or hand
it a task and it plans → runs shell commands (guarded) → edits files → verifies — the Claude-Code
/ opencode / Aider loop, **local and uncensored**, with **intelligent context loading** (only the
relevant repos/MCPs enter the model's limited window).

## Features
- Sidebar **Agent** panel (chat + agent tasks) on your local model
- **Runs shell commands intelligently** in your workspace (destructive-guarded; approve-each or autonomous)
- **Intelligent capability loading** — picks the relevant repos/MCPs per task (no context overload)
- No cloud, no API keys, no limits. Configurable endpoint/model.

## Install (local)
```
cd vscode-extension && npm run package     # -> cognis-code-0.1.0.vsix
code --install-extension cognis-code-0.1.0.vsix
```

## Publish (to the VS Code Marketplace, from cognis-digital)
Requires a marketplace **publisher** (`cognis-digital`) + a Personal Access Token:
```
npx @vscode/vsce login cognis-digital   # paste PAT (Azure DevOps > cognis-digital org)
npm run publish
```

## Config (Settings → Cognis Code)
`endpoint` (default Ollama :11434) · `model` · `autonomous` · `capabilitiesCmd` · `maxSteps`
