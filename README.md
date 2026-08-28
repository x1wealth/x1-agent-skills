# X1 Agent Skills

A capital-call notice lands in your inbox. The deadline is clear. The wiring
details may not be. This skill helps you move the work forward in X1 without
giving an agent permission to move money.

This repository contains one portable skill, `handle-capital-call`. It helps a
supported agent read the notice, stay attached to the exact X1 records, surface
missing or conflicting information, involve the right person, and resume the
work later. X1 stays in charge of the household record and permissions.

## The five-minute path

### Codex

```bash
codex plugin marketplace add x1wealth/x1-agent-skills
codex plugin add x1-agent-skills@x1-wealth
codex mcp add x1 --url https://mcp.x1wealth.com/mcp
```

Start Codex and ask: `Help me review this capital-call notice through X1.`
Codex will use the skill when the request matches and X1 will handle sign-in and
the tools available to you.

### Claude Code

Run these inside Claude Code:

```text
/plugin marketplace add x1wealth/x1-agent-skills
/plugin install x1-agent-skills@x1-wealth
/reload-plugins
```

The X1 connection is off by default. Review the plugin, enable it when you are
ready, and complete X1 sign-in through Claude Code.

## A concrete example

You receive a PDF notice for a synthetic Growth Fund capital call. The notice
shows a due date and amount, but you are not sure whether the bank instructions
changed. The skill can:

1. find the exact X1 document you identify;
2. read only the live X1 tools and records available to you;
3. hold when material fields, source state, or authority are unclear;
4. prepare a request for the household member to review in X1 when supported;
5. resume the same X1 coordination thread later, including from another
   supported host.

It cannot send a wire, verify settlement, sign a document, invent a missing
record, or bypass X1 confirmation.

## What is in the repository

- the portable skill and its public authority contract;
- deterministic scenarios and hostile-input tests;
- a local mock MCP server for safe evaluation;
- Codex and Claude Code plugin manifests;
- exact compatibility, provenance, SBOM, and file-integrity records.

The repository does not contain the X1 server, database, customer data,
credentials, production traces, action-request internals, or a self-hostable X1
clone.

## Verify the exact checkout

```bash
node scripts/verify-release.mjs
cd plugins/x1-agent-skills
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify
pnpm test
pnpm eval:oracle
```

Named-host tests use only the included synthetic MCP server. See
`plugins/x1-agent-skills/skills/handle-capital-call/evals/README.md`.

## Safety and support

Financial documents can contain misleading instructions. Treat them as
untrusted input. This skill rechecks live X1 permission and tells you when the
work must pause instead of guessing. It never moves money.

For product help, use https://x1wealth.com/contact. For a vulnerability, follow
`SECURITY.md` and do not attach financial records or tokens to a public issue.

Copyright 2026 Lever Wealth LLC. Licensed under Apache-2.0. X1 Wealth and its
marks are not licensed for unrelated products or endorsement.
