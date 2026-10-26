# X1 Agent Skills plugin

This plugin packages six skills for Codex, Claude Code, and Grok:
`ask-household-record`, `handle-capital-call`, `prepare-meeting`,
`record-meeting-outcomes`, `review-k1`, and `build-with-x1`. It
connects to X1's existing remote MCP service. It does not bundle a server,
credentials, X1 server implementation, or household data.

Every workflow reviews, drafts, and coordinates. None moves money, verifies
settlement, sends to an outside recipient, or treats a proposal as a completed
action. `ask-household-record` answers from the person's own documents with
the page behind each answer and adds documents only after the person approves
them in X1. `prepare-meeting` is read only. `review-k1` reads the tax year's K-1s against
the household record and drafts a CPA handoff; it files a K-1 under an entity
or commits a request only after the person approves it in X1. `record-meeting-outcomes` drafts every
proposal first, shows one exact batch for approval before any write, and then
follows the write authority X1 reports for the connection: a first-party
confirmation receipt where X1 requires one, or a direct call under the
connector's beta posture where X1 reports none is enforced. A confirmed
document request notifies the record's own member through X1, and the batch
says so before approval. Start with the repository README for installation and
each skill's `SKILL.md` for the exact operating contract.

`build-with-x1` helps you customize an in-host view or extend an existing project.
Its property, bookkeeping and insurance recipes preserve your chosen workspace;
ordinary questions can stay with the existing outcome skills. Supplied files are
enough for a local build. See [the recipe library](skills/build-with-x1/references/recipes.md).
The new builder instructions have source and synthetic review only; connected
artifacts and professional-client operation need their own checks.

Version 0.6.0 adds [hosted-app guidance](skills/build-with-x1/references/hosted-app.md) and a pure cited-evidence adapter with synthetic tests. It helps with one integration component; installing the plugin does not connect your deployed app or qualify its login, storage and per-user authorization. Run `pnpm run test:builder` from this plugin directory to check the adapter.
