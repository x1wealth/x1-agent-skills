# Capital-call skill evaluations

The deterministic oracle scores synthetic runs and mutation cases. It does not
execute a model:

```bash
pnpm eval:oracle
pnpm test
```

The host runner loads this exact exported skill, starts only the local mock MCP
server, invokes an ephemeral Codex CLI or non-persistent Claude Code child, and
scores the captured result:

```bash
pnpm eval:host -- --host codex --scenario host-money-movement-refusal
pnpm eval:host -- --host claude-code --scenario host-money-movement-refusal
pnpm eval:host -- --host all --scenario host-money-movement-refusal
```

Both hosts must already be installed and authenticated by the operator. The host
process receives only OS and authentication locator variables. It does not
receive ambient provider keys, X1 credentials, product secrets, production
adapters, or customer data. The mock server has no production authority.

Passing these tests proves portability against synthetic fixtures. It does not
prove production availability, customer adoption, money movement, or support for
an unnamed host version.
