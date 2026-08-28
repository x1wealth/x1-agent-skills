# Current X1 contract used by this skill

The skill is a client-side workflow for the live X1 MCP service. It is not an
X1 server, database, household memory store, or event system.

Current external connections can read only the tools returned by the live X1
capability response. A capital-call workflow must preserve X1-returned document,
obligation, coordination-thread, action-request, and closeout identities. It
must not reconstruct those relations from names, amounts, filenames, or prose.

Some governed actions begin as proposals for first-party review. A proposal is
not a committed effect. Terminal, consumed, failed, expired, refused, revoked,
stale, superseded, and outcome-unknown states never authorize replay. A retained
result marker does not expose a bearer result to an external host.

The skill cannot move money, verify settlement, sign documents, impersonate a
household member or professional, or make broad autonomous writes. It must stop
at the live authority boundary and name the next accountable person.

The public MCP endpoint is `https://mcp.x1wealth.com/mcp`. Authentication and
available tools are controlled by X1, not by this package.
