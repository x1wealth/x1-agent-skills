# Claude Code integration

Add and install the public marketplace from inside Claude Code:

```text
/plugin marketplace add x1wealth/x1-agent-skills
/plugin install x1-agent-skills@x1-wealth
/reload-plugins
```

The included remote X1 MCP connection uses
`https://mcp.x1wealth.com/mcp` and is disabled by default. Review the plugin,
enable it when ready, and complete X1 sign-in through the host. X1 decides which
tools are available to the signed-in user.

Claude Code 2.1.154 or later is required because earlier versions can ignore
`defaultEnabled: false` for an external-service plugin. Exact public-release
qualification is recorded separately in `compatibility.json`.
