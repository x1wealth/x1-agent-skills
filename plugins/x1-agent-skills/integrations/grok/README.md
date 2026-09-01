# Grok integration

## Grok Build

Install the exact public plugin from GitHub:

```bash
grok plugin install x1wealth/x1-agent-skills@v0.2.0#plugins/x1-agent-skills
grok plugin install x1wealth/x1-agent-skills@v0.2.0#plugins/x1-agent-skills --trust
grok inspect
```

The first command is a dry run. Grok shows the plugin source and stops before
installing code, skills, or MCP configuration. Re-run with `--trust` only after
reviewing the repository and exact tag. The plugin supplies the portable skill
and points Grok to `https://mcp.x1wealth.com/mcp`. Complete X1 OAuth in Grok;
never paste an access token into chat or a config file.

Run `grok mcp doctor x1 --json` to confirm discovery. Before OAuth, a healthy
transport that reports authorization required is the expected boundary, not a
failed X1 credential.

## Grok Bot

Grok Bot uses the same two pieces, but configure them separately so the user can
review each boundary:

1. In Grok, open Connectors, create a Custom connector, and enter
   `https://mcp.x1wealth.com/mcp`.
2. Complete X1 OAuth. X1 returns only the tools available to the signed-in
   person and current surface.
3. In Grok Bot, open Settings -> Plugins -> Yours and enable the installed
   `handle-capital-call` skill for the Bot.
4. Use the share-safe profile in `GROK_BOT_PROFILE.md`.
5. Test one notice manually. Do not create a routine until the one-time task
   stops correctly on missing evidence, changed payment details, and required
   human confirmation.

A Bot's memory, files, browser sessions, and shared cloud computer are working
context, not X1 household truth or a security boundary. Reopen current X1 data
for consequential decisions. Keep money movement, settlement claims, external
messages, and record-changing effects behind X1's first-party authority and
human confirmation.

## Qualification boundary

Grok Build can validate and install Claude-compatible plugin manifests, which is
how the published v0.1.1 release was first discovered by Grok. A successful
install and OAuth challenge do not qualify the complete skill workflow. Check
`compatibility.json` for the exact current status before making a host-support
claim.
