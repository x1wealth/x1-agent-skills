# Current X1 contract for prepare-meeting

Checked against the X1 MCP tool registry, tool metadata, surface policy, and
capability tool on 2026-09-15. Tool availability is decided by the live
`get_user_capabilities` result at run time; this file explains what to
expect, not what is granted.

## Surfaces

The X1 MCP service mounts different tool sets per surface. This skill is
written for the `external_connector` surface, which is what Claude, Codex,
ChatGPT, and other MCP hosts receive after sign-in with a member or
professional X1 account.

The `free_connector` surface (a free X1 account connected from an assistant)
mounts a bounded read set for one self-vault intake and one capital-call job.
It does not mount `get_meeting_prep`, `get_client_memory`,
`list_my_coordination_threads`, `get_client_record_changes`, or
`ask_client_household_brain`. This skill therefore does not run on the free
connector, and it must not describe free-lane capability it cannot verify.

## Roles and access classes

The registry roles are `consumer`, `advisor`, `coach`, and `admin`. Read the
live value at `mcp.audienceContext.registryRole`; the per-tool mount state is
under `mcp.currentSurface` and `mcp.audienceContext.toolAvailabilityByAudience`.
"Specialist" is not a registry role; it is a scoped relationship access class
that limits what a professional can reach for a given member. Tools that say
"scoped specialists are excluded" refuse for that relationship even though
the tool is mounted.

| Registry role | Who | Subject resolution |
|---|---|---|
| `consumer` | A household member | Own record only; omit `clientId` and `clientRef` |
| `advisor` | A paid practice user | `list_assigned_members`, then the exact roster `members[].id` |
| `coach`, `admin` | Managed-program staff | `list_assigned_members`, then the exact roster `members[].id` |

`list_assigned_members` takes no arguments and returns `members[]` with `id`,
`name`, `email`, `yourRole`, `accessClass`, and `scopedRelationships`. Use the
`id` wherever a tool takes `clientId`. Tools that take `clientRef` accept a
name or email and resolve it inside the same roster plus the caller's
advisor-relationship clients; passing the exact `id` there is not supported,
so pass the roster `email` or `name` and check that the answer names the same
member.

## Read tools this skill uses

| Tool | Registry roles | Arguments | Notes |
|---|---|---|---|
| `get_x1_guide` | all | none | Read before choosing tools |
| `get_user_capabilities` | all | none | Returns `mcp.audienceContext.registryRole`, `mcp.currentSurface.readOnly`, `mcp.currentSurface.writes`, `mcp.mutationSafety`, `mcp.audienceContext.toolAvailabilityByAudience` |
| `get_x1_workflow_guide` | all | `workflow: "prepare_meeting"` | Returns `canExecuteWithCurrentSurface` and destinations |
| `list_assigned_members` | all | none | Professionals resolve the client here |
| `get_meeting_prep` | all | optional `clientId` | Returns `profile`, `productState`, `pulseSnapshot`, `currentPriority`, `sharedMemberIntelligence`, `crmOperatingContext`, `activePlays`, `recentDocuments`, `recentActivity`, `familyOfficeContext`, `decisionMemory`, `recentlySettled`, `quickFlags`, and `provenance.sections` keyed by section name; scoped specialists excluded |
| `get_client_record_changes` | advisor and professional roles | `clientRef`, `since` (YYYY-MM-DD), optional `asOf` | Governed answer with citations, no balances |
| `get_client_memory` | all | optional `clientId`, `category`, `limit`, `drafts: "authored_by_me"` | Recorded decisions with status and provenance |
| `ask_household_brain` | consumer | `question` | Cite-or-refuse; refuses money-detail questions |
| `ask_client_household_brain` | advisor | `question`, `clientRef` | Cite-or-refuse; assigned clients only |
| `list_household_entities` | all | optional filters | Stable IDs, lifecycle state, `sourceBacked`, `fileable` |
| `list_my_coordination_threads` | all | optional `clientId`, `attention` (`waiting_on_me`, `changed_since_last_read`), `includeClosed` | Threads with next owner and attention signals |
| `get_vault_documents` | all | optional `clientId`, `category`, `limit` | Metadata only for a brief |

`get_client_brief` is mounted on the external connector but reads the state of
a client import (`importId` from `prepare_client_import`). It is not a general
brief and this skill does not call it.

## How to read a governed answer

`ask_household_brain`, `ask_client_household_brain`, and
`get_client_record_changes` return claims with citations and a `confidence`
value, plus gap notes. A citation does not make a claim confirmed. A claim
whose `confidence` is `reported`, or whose statement says it is pending or
waiting for confirmation, is an identified item, not a confirmed one. A
refusal, or a gap note that says the item is not in the record, is an
unknown. Copy the returned state; do not upgrade it.

## Known seams that require a stated gap

- `get_meeting_prep` reads recently settled outcomes as a separate step. If
  that read fails, the bundle still returns and `provenance.sections` has no
  `recentlySettled` entry. Report "could not read recently settled outcomes",
  not "nothing settled".
- When the bundle exceeds its size budget, `get_meeting_prep` silently empties
  `familyOfficeContext` and `recentActivity` and, if still too large,
  `activePlays`, `recentDocuments`, and `recentlySettled`, and removes their
  `provenance.sections` entries. There is no marker in the emptied sections
  themselves. The only reliable signal is the missing provenance entry, so
  check `provenance.sections` for every section before treating an empty
  list as an empty result.
- The household brains answer only from the promoted governed record. They do
  not read connected-account balances or raw vault text. Their refusal is an
  answer, not an error to route around.
- A professional whose access to this member is a scoped specialist
  relationship receives shared documents and coordination threads only. For
  that relationship the brief is built from those two sources and says so.

## What the receipt may claim

`wrote_to_x1`, `sent_externally`, and `raw_documents_opened` are always false
for this skill. There is no authorized X1 result that could make them true.
