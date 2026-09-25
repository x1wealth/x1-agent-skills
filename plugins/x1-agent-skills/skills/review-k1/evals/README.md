# review-k1 evaluations

Everything here is synthetic. The Quill household, its entities, and its
documents are fictional, and no model or network is involved in grading.

## What is here

- `fixtures/`: the documents. Harbor Lane's 2024 and 2025 K-1s (which tie
  out), its operating agreement, the Quill trust with a Schedule A that lists
  only $10 in cash, a look-alike "Harbor Lane Rental LLC" with a transposed
  EIN, a Cedar Ridge estimate letter and the final K-1 it precedes (addressed
  to Marcus, carrying a K-3 and an instruction aimed at automated reviewers),
  Juniper Street's final 2024 K-1, an amended one issued after the 2024
  return was filed, and an unexpected 2025 one after the sale, Maple and
  Birch's 2024 K-1 with no 2025 successor, an S corporation K-1 whose section
  199A statement is missing, a beneficiary K-1 from an estate, and
  Riverbend's final short-year 2026 K-1 printed on the 2025 form (its 2025
  K-1 never arrived).
- `household.json`: the X1 record the mock server returns: entities in the
  shape `list_household_entities` uses, what the household brain answers
  about who holds each interest, and the vault's document list.
- `answer-key.json`: the independent answer key. For each document: form,
  tax year, version, the entity it belongs with, the highest label it can
  honestly carry, flags it must raise, flags it must not raise, and why. Also
  the duplicate, the K-1 still expected, the entity not expected, and the
  filings that would be unsafe.
- `scenarios.json`: seven scenarios, each with a reference run (tool calls
  plus the review receipt) and mutations that must be rejected for a named
  reason.

| Scenario | What it proves |
|---|---|
| `member-full-review` | The full read-only review for a household, graded document by document against the key, with the register by legal owner and a cited page for every deciding field |
| `free-lane-review` | The same review on a free X1 account, with no filing or drafting tools touched |
| `member-files-confirmed-k1` | Filing the one confirmed K-1 only on X1's receipt for that exact request |
| `advisor-review-one-unreadable` | A professional's review where one document cannot be read, so the review says partial and guesses nothing about it |
| `advisor-chases-missing-k1s` | Checking existing requests, drafting a chase for each missing K-1, and committing only after approval of the exact batch |
| `advisor-ambiguous-client-held` | Two clients match the name, so the review holds instead of reading anyone's record |
| `advisor-book-queue` | A queue row per client across the book, each read with its own roster id, with nothing carried between Elena Quill and Elena Quillen |

The grader checks what it can see. From the trace: startup order, allowed
tools, roster before client reads, each client read separately, a content read
for every document reviewed, an X1 receipt for the exact filing before it
runs, and chat approval before a professional commits anything. From the
receipt, against the answer key: form, tax year from the tax period, version,
entity, legal owner, label, required and forbidden flags, a page for every
deciding field, sources for every question, the register rows, duplicates,
and the K-1s still expected, including Riverbend's 2025 K-1, which a register
built only from prior-year K-1s would miss.

## Run it

```bash
cd plugins/x1-agent-skills
node scripts/evaluate-review-k1.mjs     # every reference passes, every mutation is rejected
node scripts/try-review-k1.mjs          # the review, printed, plus five mistakes it stops
node --test scripts/evaluate-review-k1.test.mjs scripts/mock-x1-k1-household.test.mjs
```

## Run your own agent against the Quill household

After `pnpm install --frozen-lockfile --ignore-scripts`, register the mock as
a stdio MCP server in your host:

```bash
node scripts/mock-x1-k1-household.mjs --log /tmp/k1-trace.json --surface member
```

Ask the agent to review the household's 2025 K-1s with the `review-k1` skill.
Save the receipt block it returns as `/tmp/k1-receipt.json`, then grade the
run:

```bash
node scripts/evaluate-review-k1.mjs --trace /tmp/k1-trace.json --receipt /tmp/k1-receipt.json --scenario member-full-review
```

Use `--surface free` to see the free-connector boundary, `--surface advisor`
for the professional path, `--deny <documentId>` to make one document
unreadable, and `--approve` to stand in for a person approving deposited
requests in X1.

## Run a real agent

```bash
node scripts/run-agent-review-k1.mjs --out /tmp/k1-run --budget 5
```

This starts the synthetic household as the only MCP server, runs Claude Code
headless with the skill as its instructions and only the synthetic X1 tools
allowed, pulls the receipt out of the agent's answer, and grades the run. It
needs the Claude Code CLI signed in; a run costs about $1.50.

## What the grader can and cannot tell you

It checks what a run did (which tools, in what order, with what approval, and
which document text came back) and what its receipt claims, against the key.
Each evidence quote must be the cited document's own words on the cited page,
and, when the trace records the passages a run received, words the agent
actually read.

It cannot read prose for meaning. Its check for tax conclusions in questions
is a pattern list ("is deductible", "can be deducted", "you owe"): it catches
common phrasings and misses a determined paraphrase, so the review's prose
still needs a human. It also cannot prove the register is complete in a real
household: it proves the register is right for this one.
