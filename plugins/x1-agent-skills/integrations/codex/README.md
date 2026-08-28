# Codex integration

```bash
codex plugin marketplace add x1wealth/x1-agent-skills
codex plugin add x1-agent-skills@x1-wealth
codex mcp add x1 --url https://mcp.x1wealth.com/mcp
```

The public plugin is skill-only until X1's exact registered OpenAI app mapping is
verified. The separate `codex mcp add` command connects the existing remote X1
service and preserves the user's visible host configuration. X1 handles sign-in
and returns only the tools available to that user and surface.
