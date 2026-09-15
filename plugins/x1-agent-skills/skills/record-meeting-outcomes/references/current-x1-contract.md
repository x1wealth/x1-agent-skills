# Current X1 contract for record-meeting-outcomes

Checked against the X1 MCP tool registry, tool metadata, surface policy, and
capability tool on 2026-09-15. Write availability on the external connector
depends on server-side activation state that `get_user_capabilities` reports
at run time. This file explains the shapes; the live result decides.

## Surfaces

This skill is written for the `external_connector` surface. It does not run on
the `free_connector` surface, which mounts no decision, document-request,
profile-fact, or coordination tools and whose only governed write is a
self-vault intake.

## Roles and access classes

The registry roles are `consumer`, `advisor`, `coach`, and `admin`. Read the
live value at `mcp.audienceContext.registryRole`. "Specialist" is not a
registry role; it is a scoped relationship access class that limits what a
professional can reach for a given member, and several tools exclude scoped
specialists by contract.

| Registry role | Subject resolution | Writes this skill may reach when mounted |
|---|---|---|
| `consumer` | Own record; omit `clientId` and `clientRef` | `log_decision`, `save_member_artifact`, `propose_profile_fact`; document requests are a professional tool |
| `advisor`, `coach`, `admin` | `list_assigned_members`, then the exact roster `members[].id` as `clientId` | `log_decision`, `confirm_document_request` after `draft_document_request`, `propose_profile_fact`, `save_member_artifact` |

`list_assigned_members` takes no arguments and returns `members[]` with `id`,
`name`, `email`, `yourRole`, `accessClass`, and `scopedRelationships`. Tools
that accept `clientRef` (a name or email) resolve it inside that same roster
plus the caller's advisor-relationship clients; the security check happens
afterward on the resolved id.

## Where the capability result says what a write may do

| Path | Meaning |
|---|---|
| `mcp.currentSurface.readOnly` | No write tool is mounted for this caller |
| `mcp.currentSurface.writes.canLogDecision` | `log_decision` is mounted |
| `mcp.currentSurface.documents.canDraftDocumentRequest` | `draft_document_request` is mounted |
| `mcp.currentSurface.writes.canRequestMissingDocumentViaConfirmation` | `draft_document_request` and `confirm_document_request` are both mounted |
| `mcp.currentSurface.coordination.canStartThread` | `start_coordination_thread` is mounted; false on external connectors by policy |
| `mcp.currentSurface.memberArtifactSavePolicy.available` | `save_member_artifact` is authorized for this caller |
| `mcp.mutationSafety.availableWriteTools[]` | One entry per mounted write tool: `name`, `authorityPosture.availability` (`beta_unrestricted`, `confirmation_receipt`, `resolved_effect_confirmation_receipt`, `first_party_action_request`, or `approved_result_release`), `authorityPosture.receiptEnforcement` (`not_enforced` under the beta posture, otherwise a first-party receipt is required before the effect), and `betaAvailability` when the beta posture applies. `executionContract` on the same entry is static guidance about side effects and idempotency, not the authority discriminator |

A mounted tool whose `authorityPosture.receiptEnforcement` is not `not_enforced` refuses a direct call.
That is the case to route through `request_human_confirmation` (`toolName`,
`arguments`, `idempotencyKey`), then `get_my_action_requests` with the
returned `requestId` and `projection: "disposition_v1"`. A pending request is
finished by a person in X1. A consumed request is never replayed.

Under the connector's beta posture the same tools execute directly without a
server receipt. The batch approval in the conversation is then the only gate,
which is why the skill never writes before an explicit approval of the exact
batch.

## Argument shapes, from the registered schemas

| Tool | Required | Optional |
|---|---|---|
| `log_decision` | `title` (2 to 120), `description` (3 to 1000), `category` in `tax`, `estate`, `insurance`, `cashflow`, `investments`, `governance`, `other`; `nextAction` with `title` (2 to 160) and `ownerLabel` (1 to 120) | `nextAction.dueAt`, `nextAction.routeTo` in `self`, `advisor`, `coach`, `cpa`, `attorney`; `alternativesConsidered` (to 500), `ownerLabel`, `visibility` (`member_only` or `advisor_shared`), `outcomeStatus` (`pending_review`, `in_progress`, `resolved`), `deferredUntil`, `memberEntityId`, `clientFacing`, `idempotencyKey`, `clientId` or `clientRef` |
| `draft_document_request` | `documentType` (to 160), `category` from the X1 document taxonomy | `clientId` (omit for own household), `institutionOrRecipient`, `subCategory`, `reason` (to 2000), `deadline` (ISO datetime), `urgency` (`normal` or `time_sensitive`) |
| `confirm_document_request` | `proposalId` from the draft, `confirmed: true`, `clientId`, `documentTypes` (1 to 20) | `requestType` in `specific_docs`, `annual_review`, `tax_prep`, `other` (defaults to `specific_docs`), `deadline`, `description` (to 2000), `taxYear` |
| `draft_coordination_thread` | `subject` (2 to 160), `message` (2 to 10000) | `clientId` (omit for own household), `intent`, `recipientIds` (to 12, only from `availableRecipients`) |
| `propose_profile_fact` | `facts` (1 to 25) | `clientId` |
| `request_human_confirmation` | `toolName`, `arguments`, `idempotencyKey` | none |

## Result shapes the receipt copies from

- `draft_document_request` returns `draftOnly: true`, `proposal.proposalId`,
  `proposal.documentTypes`, `proposal.requestType`, `proposal.reviewLink`,
  and `status` of `ready_for_confirmation` or `draft_only`. A `proposalId`
  exists even when the caller cannot confirm; `status` says which.
- `confirm_document_request` returns `ok`, `requestId`,
  `confirmedProposalId`, `created`, `documentsNeeded`, `source`, and
  `appDestinations`. X1 then notifies the member by email and in-app
  according to their notification preferences.
- `log_decision` returns `entryId`, `reviewState` (`draft` or `recorded`),
  `reviewUrl`, `memberVisible`, `undoEligible: false`, `externalSent: false`,
  and `effectState` (`committed` or `replayed`).
- `draft_coordination_thread` returns the draft, `availableRecipients`, and
  the X1 destination where the person starts the thread.
- `request_human_confirmation` returns `requestId`, `status`, `expiresAt`,
  `reviewAudience`, and `nextStep`; the effect has not run.

## Duplicate checks

- `get_client_memory` (optional `clientId`, `category`, `limit`) for existing
  decisions.
- `list_my_coordination_threads` (optional `clientId`, `attention`,
  `includeClosed`) for open threads on the topic.
- `list_document_requests` (optional `clientId`) for pending requests.

## What the receipt may claim

`sent_externally`, `client_created`, `money_moved`, and
`wrote_without_approval` are always false for this skill. No authorized X1
result can make them true. A member notification caused by a confirmed
document request is an X1 notification to the record's own member, not an
outside send, and the batch discloses it before approval.
