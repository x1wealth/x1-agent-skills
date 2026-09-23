# X1 Agent Skills plugin

This plugin packages four skills for Codex, Claude Code, and Grok:
`ask-household-record`, `handle-capital-call`, `prepare-meeting`, and
`record-meeting-outcomes`. It
connects to X1's existing remote MCP service. It does not bundle a server,
credentials, production code, or household data.

Every workflow reviews, drafts, and coordinates. None moves money, verifies
settlement, sends to an outside recipient, or treats a proposal as a completed
action. `ask-household-record` answers from the person's own documents with
the page behind each answer and adds documents only after the person approves
them in X1. `prepare-meeting` is read only. `record-meeting-outcomes` drafts every
proposal first, shows one exact batch for approval before any write, and then
follows the write authority X1 reports for the connection: a first-party
confirmation receipt where X1 requires one, or a direct call under the
connector's beta posture where X1 reports none is enforced. A confirmed
document request notifies the record's own member through X1, and the batch
says so before approval. Start with the repository README for installation and
each skill's `SKILL.md` for the exact operating contract.
