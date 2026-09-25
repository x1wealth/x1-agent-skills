# Current X1 contract for review-k1

Checked against the X1 MCP tool registry, tool metadata, surface policy, and
entity profile source on 2026-09-25. Tool availability is decided by the live
`get_user_capabilities` result at run time; this file explains what to
expect, not what is granted.

## Surfaces

| Surface | Who gets it | What review-k1 can do there |
|---|---|---|
| `free_connector` | A free X1 account connected from an assistant | The full read-only review: inventory, entity profiles, the household brain, and cited passage search. No filing, drafting, or coordination tools, so the CPA handoff is text the household copies. |
| `external_connector`, `consumer` | A member household | The review, plus filing a K-1 under an entity with the person's approval, and drafting a document request that the member confirms in X1. |
| `external_connector`, `advisor`, `coach`, `admin` | Professionals | The review for an assigned client, plus drafting and, after approval, confirming a document request, and drafting a coordination thread. |

The free connector mounts `get_x1_guide`, `get_x1_workflow_guide`,
`get_user_capabilities`, `ask_household_brain`, `search_my_document_contents`,
`get_vault_documents`, `check_vault_deposit`, `list_household_entities`, and
`list_household_entity_change_proposals`, plus a bounded self-vault intake. It
does not mount `file_vault_document_under_entity`, `draft_document_request`,
or `draft_coordination_thread`.

## Tools this skill uses

| Tool | Roles | Arguments | Notes |
|---|---|---|---|
| `get_x1_guide` | all | none | Read before choosing tools |
| `get_user_capabilities` | all | none | `mcp.audienceContext.registryRole`, `mcp.currentSurface.readOnly`, `mcp.currentSurface.writes`, `mcp.mutationSafety`, `mcp.audienceContext.toolAvailabilityByAudience` |
| `get_x1_workflow_guide` | all | `workflow: "document_review"` | Returns `canExecuteWithCurrentSurface` and destinations |
| `list_assigned_members` | professionals | none | `members[]` with `id`, `name`, `email`; use the exact `id` as `clientId` |
| `get_vault_documents` | all | optional `clientId`, `category`, `limit` | Titles, categories, dates; metadata only |
| `list_household_entities` | all | optional `clientId`, `entityType`, `status` (`current` default, `all`, `former`, `member_asserted`), `includeCounts` | Per entity: `id`, `displayName`, `entityType` (`business`, `trust`, `property`, `asset`, `personal`), `status`, `sourceBacked`, `fileable`, `formerSince`, `memberFacingState`, and `documentProfile` |
| `ask_household_brain` | consumer | `question` | Cite-or-refuse answer from the governed record; the source for who holds an interest |
| `ask_client_household_brain` | professionals | `question`, `clientRef` | Same, for an assigned client. `clientRef` is a name or email resolved inside the roster; pass the roster `email` and check the answer names the same member |
| `search_my_document_contents` | all (own vault) | `query`, optional document scope | Cited snippets with document and page provenance; may report still-indexing for a just-saved file |
| `search_client_document_contents` | professionals | `clientId`, `query` | Document and page locations, **without text** |
| `get_document_content` | professionals, external connector | `clientId`, `documentId` | Content only when the caller has current document and download access |
| `list_household_entity_change_proposals` | all | optional filters | Pending entity cleanup and proposed ownership edges; relevant only to show an unresolved proposal, never as confirmed ownership |
| `list_document_requests` | all | optional `clientId` | Existing requests, to avoid drafting a duplicate chase |

## What the entity profile is, and is not

`documentProfile` holds what X1 read from documents already filed under that
entity: `legal` (formation record: members, managers, legal form,
jurisdiction, dates), `trust` (grantors, trustees, successor trustees), and
`k1s` (for each K-1 filed there: tax year, partnership and partner names,
capital account beginning and ending, contributions, distributions, profit,
loss, and capital share percents, and the main income lines), newest tax year
first, each with its `source` and whether the household reviewed it.

It omits EINs and TINs by design, so an EIN comparison comes from the
documents themselves. It is built from at most 200 extraction records per
request and reflects only filed documents, so it is not an ownership ledger
and never proves a list is complete. It carries no
ownership edges; ask the household brain who holds an interest.

## Writes, and how approval works

| Tool | Roles | What it does | Path |
|---|---|---|---|
| `file_vault_document_under_entity` | members and authorized operators | Files an existing vault document under an existing entity or Personal | Needs explicit human confirmation of the exact document and destination. On surfaces that require a receipt: `request_human_confirmation` deposits the exact request, the person approves it in X1, `list_my_confirmation_receipts` returns a single-use receipt, and only then does the filing run. Read `mcp.mutationSafety` before choosing the path. |
| `request_human_confirmation` | all | Deposits one exact pending request | Grants nothing by itself |
| `list_my_confirmation_receipts` | all | Lists unused receipts the person granted | X1 re-verifies the receipt, surface, tool, entitlements, and arguments before anything runs |
| `draft_document_request` | all | Drafts a request for a missing document; writes nothing | A member's own draft is confirmed in X1, not over MCP |
| `confirm_document_request` | professionals | Commits a drafted request | Only after the person approves the exact proposal |
| `draft_coordination_thread` | all where mounted | Drafts a thread to a professional | A draft for review in X1 |

## What the receipt may claim

`filed_tax_return`, `gave_tax_advice`, and `moved_money` are always false;
no X1 tool could make them true. `wrote_to_x1` is true only when a filing or
a committed request actually succeeded. `sent_externally` is true only when a
committed request or thread was actually delivered by X1.
