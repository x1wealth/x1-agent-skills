# Grok integration

## Grok Build

Install the exact public plugin from GitHub:

```bash
grok plugin install x1wealth/x1-agent-skills@v0.4.0#plugins/x1-agent-skills
grok plugin install x1wealth/x1-agent-skills@v0.4.0#plugins/x1-agent-skills --trust
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

Grok Bot uses the same two pieces, but you add them separately so you can review each boundary. These steps match the Grok Bot desktop app 0.58.

1. Add X1 by asking the Bot in chat: `Add a custom MCP server called x1 at https://mcp.x1wealth.com/mcp`. The Bot asks you to confirm, then adds an `x1` connector to your account. Connectors apply to every Bot on the account.
2. Sign in from the Bot's connect card, or from Marketplace -> Your plugins -> x1 -> Authenticate. Complete X1 sign-in in the browser on the same computer; the desktop app receives the sign-in callback locally. X1 returns only the tools available to the signed-in person and current surface.
3. Ask the Bot to create a private skill named `handle-capital-call` from this repository's exact files at a pinned commit, such as the `v0.4.0` release commit `fdc2bdb5cfbdabff923d3874422c44db7a073359`. Give it `plugins/x1-agent-skills/skills/handle-capital-call/SKILL.md` and `plugins/x1-agent-skills/skills/handle-capital-call/references/current-x1-contract.md`, word for word. Confirm the skill's first heading reads "Handle a Capital Call Through X1".
4. Use the share-safe profile in `GROK_BOT_PROFILE.md`.
5. Test one notice manually. Do not create a routine until the one-time task stops correctly on missing evidence, changed payment details, and required human confirmation.

A Bot's memory, files, browser sessions, and shared cloud computer are working
context, not X1 household truth or a security boundary. Reopen current X1 data
for consequential decisions. Keep money movement, settlement claims, external
messages, and record-changing effects behind X1's first-party authority and
human confirmation.

### Sharing a Bot as a template

A Grok Bot template packs each skill as a single text, with no companion files, so don't rely on a template to carry the skill. Before you share a Bot as a template:

- Set your Cursor profile name. The public share page shows `by <name>` and may otherwise show the account email.
- Keep each template memory under 500 characters. Longer memories are silently cut off.
- Check the template's contents on its card before you publish.

## Qualification boundary

Grok Build can validate and install Claude-compatible plugin manifests, which is
how the published v0.2.0 release was qualified in Grok. A successful
install and OAuth challenge do not qualify the complete skill workflow. Check
`compatibility.json` for the exact current status before making a host-support
claim.
