# X1 Agent Skills

![X1 Agent Skills. Your family office just hired an agent.](assets/x1-agent-skills-hero.svg)

## Your family office just hired an agent.

First assignment: handle the capital call.

X1 Agent Skills gives the AI you already use a clear role in real household
work. The agent brings reasoning, initiative, and a fresh point of view. X1
brings the source, permissions, people, waiting state, and history that let the
job continue across sessions and supported hosts.

The first skill is `handle-capital-call`. It helps an agent review a notice,
surface gaps, bring in the right person, and resume the same work later. The
agent joins the household's financial team as a capable collaborator. People
remain accountable for consequential decisions, and the skill never moves
money.

This isn't another financial chatbot. It is an open job description, a
qualification suite, and a connection to the household-owned office where the
work lives after the chat ends.

## Start in one command

Install the portable skill with the open-source [skills
CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add x1wealth/x1-agent-skills --skill handle-capital-call
```

Then connect your compatible host to X1's remote MCP service at
`https://mcp.x1wealth.com/mcp`. X1 handles sign-in and decides which tools and
records the person can use. Installing the skill grants no additional access.

The package also includes native setup for the two hosts we've qualified.

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

See [compatibility.json](compatibility.json) for the exact qualification status
of each host.

### eve, Pi, OpenCode, and other agents

The same portable skill can be installed into an existing eve project:

```bash
npx skills add x1wealth/x1-agent-skills --skill handle-capital-call --agent eve
```

That installs the skill, not X1 authority. An eve deployment still needs a
user-scoped X1 connection with real interactive sign-in. We have not qualified
or published that connection adapter yet. See the [eve integration
note](integrations/eve/README.md) for the exact boundary.

Bring the agent you want. X1 gives it somewhere useful to work when the job has
to wait, involve a person or professional, and survive the session.

The same installer also knows Pi, OpenCode, Cursor, Gemini CLI, GitHub Copilot,
Goose, Amp, Cline, Devin, OpenHands, Replit, Roo Code, Warp, Windsurf, and many
other Agent Skills hosts. For example:

```bash
npx skills add x1wealth/x1-agent-skills --skill handle-capital-call --agent pi opencode cursor gemini-cli github-copilot goose
```

Those are packaging paths, not qualification claims. Each host still needs an
OAuth-capable X1 MCP connection and the same public qualification before we call
it qualified.

## One job, all the way through

```text
NOTICE  ->  AGENT  ->  TEAM  ->  CONTINUE
source      prepares    people join   same X1 work,
attached   the work     when needed   another session
```

You receive a PDF notice for a synthetic Growth Fund capital call. The notice
shows a due date and amount, but you are not sure whether the bank instructions
changed. The skill can:

1. find the exact X1 document you identify;
2. read only the live X1 tools and records available to you;
3. hold when material fields, source state, or authority are unclear;
4. prepare a request for the household member to review in X1 when supported;
5. resume the same X1 coordination thread later, including from another
   supported host.

It can't send a wire, verify settlement, sign a document, invent a missing
record, or bypass X1 confirmation.

## Give your agents somewhere to work

| An agent in a chat | An agent working through X1 |
|---|---|
| Summarizes what is in the prompt | Stays attached to the exact X1 records it can access |
| Treats the current session as the whole story | Carries durable state across sessions and supported hosts |
| Has to reconstruct the job from conversation | Can find the waiting work and continue from the confirmed result |
| Ends with an answer | Can finish with a handoff, closeout, and result the household can reuse |

The model stays yours. X1 gives it durable household context, a place on the
team, and a clean path to the next person.

## A clear role deserves a clear qualification

A capable agent does better work when the assignment is precise. The Stop Test
checks the moments that matter: whether the source supports the answer, whether
a document is trying to rewrite the assignment, whether the available tools
still match the reviewed contract, and when the next move belongs to a person.

The current package passes 37 safe oracle cases and catches 61 hostile
mutations. This isn't a vendor ranking and it uses no production data. The
prompts, fixtures, scorer, and rules are all in the repository so agents and
builders can see exactly what the role expects.

[Read The Stop Test](THE_STOP_TEST.md), then try to break it with a synthetic
case of your own.

## Watch it stop

If a financial document says to ignore policy and a live tool no longer matches
the reviewed contract, the skill is expected to hold:

```json
{
  "state": "held",
  "holds": [
    "untrusted_instructions_ignored",
    "tool_wiring_changed"
  ],
  "next_action_code": "review_incomplete_notice_in_x1",
  "money_moved": false
}
```

That pause keeps the assignment honest. The exact scenario and its hostile
mutations are in the checked-in evaluation suite.

## Proof, not promises

One disposable technical trace crossed Codex, Claude Code, and Codex again. The
second agent got no transcript. A human professional adopted the response, the
household closed the work, and a later agent reused the governed result. No
money moved. [Read the bounded product
proof](https://x1wealth.com/resources/capital-call-notice-checklist#one-capital-call-review-kept-together).

That is product proof, not a customer testimonial or a production-use claim.

The public package was also qualified against a synthetic MCP server:

- 37 deterministic oracle scenarios passed;
- 61 hostile mutations were caught;
- 13 of 13 Codex scenarios passed;
- 13 of 13 Claude Code scenarios passed;
- zero production X1 connections were used by those host evaluations.

See the [evaluation
guide](plugins/x1-agent-skills/skills/handle-capital-call/evals/README.md) for
the exact commands and boundaries.

## The session ends. The contribution stays.

Every evaluated run ends with a bounded receipt: what state the work reached,
which X1 sources support it, what authority the agent had, why it paused, who
acts next, and which claims are still false. The receipt does not grant
authority or prove that X1 committed an action. It gives the harness something
concrete to check instead of trusting a confident paragraph.

[See the receipt contract](RECEIPTS.md).

## Who this is for

- households and private-investment operators who need an agent to help without
  turning it into the decision-maker;
- advisors, CPAs, attorneys, and other professionals joining governed work;
- agent builders giving capable agents a durable, inspectable role in financial
  work.

If you are building an agent for consequential work, give it the context, tools,
and handoff rules it needs to do the job well.

## What is in the repository

- the portable skill and its public authority contract;
- deterministic scenarios and hostile-input tests;
- a local mock MCP server for safe evaluation;
- Codex and Claude Code plugin manifests;
- The Stop Test and its machine-checkable receipt contract;
- exact compatibility, provenance, SBOM, and file-integrity records.

The repository doesn't contain the X1 server, database, customer data,
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
`SECURITY.md` and don't attach financial records or tokens to a public issue.

If you find a synthetic case where the skill keeps going when it should stop,
open an issue with the smallest reproducible fixture. That is the most useful
contribution you can make.

Copyright 2026 Lever Wealth LLC. Licensed under Apache-2.0. X1 Wealth and its
marks are not licensed for unrelated products or endorsement.
