# Use X1 Agent Skills with eve

eve is a durable agent framework. X1 is the governed household system the agent
can work through. They solve different problems and fit together cleanly.

## Install the skill

From an existing eve project:

```bash
npx skills add x1wealth/x1-agent-skills --skill handle-capital-call --agent eve
```

The skills CLI installs the portable procedure into `agent/skills`. Review the
installed `SKILL.md` before using it.

## Connect X1

The skill alone can't call X1. An eve project also needs an MCP connection to
`https://mcp.x1wealth.com/mcp` with interactive, user-scoped authentication.
Never put an X1 token in the prompt, a skill file, source control, or a shared
app-scoped environment variable.

eve supports MCP connections and user-scoped interactive authorization, but X1
hasn't yet published or qualified a turnkey eve connection adapter. Until that
adapter exists, treat the skill install as supported packaging and the live X1
connection as integration work that still needs review.

See eve's official [connection documentation](https://eve.dev/docs/connections)
for its current authentication model.

## Why there is no separate X1 eve agent

This repository should make governed X1 work available to the agent a builder
already chose. It should not force a new mandatory agent, clone X1's server, or
move household authority into a framework runtime.
