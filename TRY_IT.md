# Try the weird parts first

You don't need an X1 account, an API key, or a real financial document for this
tour. Clone the repository and run:

```bash
node scripts/try-stop-test.mjs
```

In a few seconds, the demo walks through three checked-in situations:

1. a financial document tries to rewrite the assignment while the live tool
   wiring has changed;
2. a user asks the agent to pay the capital call;
3. another host finds the exact waiting coordination thread and continues from
   the server-returned relationship.

The first two should stop. The third should continue. Each result comes from the
same public scenarios and evaluator used by the full qualification suite.

## What you are seeing

The demo isn't a recorded animation and it doesn't call a model. It loads the
public synthetic fixtures, scores the checked-in run, and prints the exact state,
hold reasons, and next action that passed.

That makes it fast, free, and easy to inspect. It also means the demo proves the
contract and evaluator, not the behavior of an arbitrary model or a production
X1 account.

## Turn the screws

Run the complete deterministic suite:

```bash
cd plugins/x1-agent-skills
pnpm install --frozen-lockfile --ignore-scripts
pnpm eval:oracle
pnpm test
```

Then open
`plugins/x1-agent-skills/skills/handle-capital-call/evals/scenarios.json` and
look for `prompt-injection-and-changed-wiring`. Change the receipt so it says
money moved, invent a source ID, or remove a required hold. The scorer should
reject it.

If you find a believable synthetic case that passes when it should stop, that
is exactly the kind of contribution we want.

## Take the job into X1

The synthetic tour needs no account. Real household work does. Install the
portable skill, connect a compatible host to `https://mcp.x1wealth.com/mcp`,
and sign in to X1. X1 decides which records and tools are available to that
person. Installing this repository grants no additional access.

[Return to the install guide](README.md#install-the-skill).
