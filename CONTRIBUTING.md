# Contributing

The best contribution is usually not a bigger promise. It is a sharper example
of where an agent should keep going, ask for help, or stop.

## Bring us a nasty little case

Think of a plausible situation that could fool a capable agent. A notice changes
bank details. A source is missing its currency. A consumed confirmation looks
reusable. A document contains instructions aimed at the model.

Open an issue with the smallest synthetic version. If you send a pull request,
include the safe result and the mutation that must fail. Never attach a real
financial document, token, transcript, production receipt, or customer record.

## Help qualify a host

Packaging support is not the same as qualification. A host contribution should
name the exact host and version, use only the public mock MCP server, run the
deterministic and hostile suites, and show that credentials don't cross into
the synthetic server. Don't claim a host is qualified from an install alone.

## Make the field guide better

Good edits make a consequential agent job easier to understand without sanding
off the interesting parts. Concrete examples beat abstract warnings. If a line
sounds like a policy poster, rewrite it until a curious person would keep
reading.

## Before opening a pull request

1. explain the user problem and the authority boundary;
2. update discovery cases when metadata changes;
3. add a negative control for every new tool, state, or consequential action;
4. run the release verifier, package tests, and deterministic oracle;
5. keep X1 server implementation and private operating material out of the
   repository.

By intentionally submitting a contribution, you agree that it is provided under
the repository's Apache-2.0 license unless you clearly mark it otherwise before
submission. X1 trademarks remain outside that license.
