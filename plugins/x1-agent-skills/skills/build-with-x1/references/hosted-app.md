# Connect an existing app to X1

Use this when someone wants their own deployed app to use X1 records, whether for themselves or other users. Preserve their framework, login, database and product. For a private view inside an already connected assistant, use that host's tools instead; a web-app connection isn't a prerequisite to making a useful artifact.

Start with the useful job: which existing record will help this app do something for its user? One document question can use supplied files. A connection earns its place when the person wants to find or revisit their permitted record across jobs. Don't require every buyer, colleague or invited participant to get an X1 account merely to participate in the app.

## Choose the connection before writing plumbing

For a multi-user app, state the design plainly: **Your app signs people in. Each record owner separately connects the X1 account they're allowed to use.** X1 data consent isn't app login or membership. Keep existing app identities and check the owner/case/client on every relevant operation.

Installing the plugin makes the X1 connection available in its supported assistant host. Enable it and finish that host's sign-in separately. It doesn't install OAuth, encrypted token storage or a server adapter into another app. Use the current MCP client SDK and its supported OAuth machinery for that app's stack; inspect its installed version rather than copying version-specific examples blindly. The official [MCP client OAuth guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md) explains the storage/redirect interface; SDK APIs differ between major versions.

X1's endpoint is `https://mcp.x1wealth.com/mcp`, using Streamable HTTP. Current onboarding is at [Connect another app](https://x1wealth.com/connect/other). Desktop/terminal loopback OAuth and a hosted callback have different admission rules. A deployed app's exact callback must be admitted through X1's supported review; provide the app identity and callback, never an investor's secret. Don't route a hosted callback through a loopback rule or another app's client ID. A registration response alone doesn't prove the callback is admitted.

API keys are an alternative only when that user's account supports them. A shared environment variable for one demonstration household isn't multi-user linking. The app's own encryption secret is separate from its public OAuth client ID and each user's X1 token. Generate/store the encryption secret in the app's existing private deployment configuration; keep it stable with the encrypted token store. Don't ask someone to copy another environment's key.

If the app's sign-in or callback isn't known, inspect its existing routes/configuration before asking. Explain one missing prerequisite while continuing useful local work. Don't provision accounts through private X1 operator tools to make a public builder example appear self-service.

## Make one real read work

1. Complete supported consent for the actual signed-in owner. Bind state, PKCE and issuer to that browser/session and intended app destination. Store tokens privately with the app's actor and record/case binding. Use the supported SDK flow; a bare callback code isn't authority to choose a different owner.
2. Discover the tools and inspect `get_user_capabilities` on that actual connection. Separate configured client, connected person and supported read. Don't assume that a free account has every tool or API keys, or that a professional connection can read a whole household graph.
3. Start with one bounded own-document search. Use returned inventory IDs when selecting files; pass only the arguments in the mounted schema. A selected-file request limits this read, not necessarily the provider's whole OAuth grant.
4. Present one readable cited passage. Recheck the current app actor, case and unchanged connection before showing or saving an asynchronous result. Keep a different participant from seeing the owner's household evidence merely because they share a case.
5. If the user wants to keep the excerpt, store an explicitly chosen copy under the app's normal private-data controls. Explain who can see it, where it lives, whether it refreshes and what disconnect leaves behind. A copied passage doesn't confirm a financial input, record relationship or completed action.
6. Disconnect through the supported path, clear the app's live credential and invalidate outstanding reads/previews. Distinguish local removal from confirmed provider revocation; neither automatically erases copies or backups already retained by the app.

For a deployed multi-user claim, exercise two separate users, cross-user denial, restart, expired access and disconnect during a read. A presenter role switcher, mocked provider or valid token in one shell isn't that acceptance. Continue a useful supplied-file build when a real connection is unavailable, with its actual status stated once.

## Use the cited-evidence adapter

[../scripts/x1-evidence.mjs](../scripts/x1-evidence.mjs) is an independently written, dependency-free adapter for the current `search_my_document_contents` structured result and `vault-evidence-trust-v1` envelope. It performs no requests, storage, login or HTML rendering. Copy/import it into the relevant part of the existing project; don't put tokens in a browser bundle.

After the app has authenticated and authorized the read, a supported client call can feed it:

```js
import { normalizeX1DocumentSearch } from './x1-evidence.mjs';

// connectedClient, selectedDocumentIds and query come from your existing
// authorized server flow. Check the mounted tool/argument schema first.
const raw = await connectedClient.callTool({
  name: 'search_my_document_contents',
  arguments: { query, documentIds: selectedDocumentIds, coverage: 'all_requested' },
});
const evidence = normalizeX1DocumentSearch(raw, {
  selectedDocumentIds,
  observedAt: new Date().toISOString(),
});
// Recheck the live actor/case/connection generation before presenting or saving.
// Render evidence strings as text nodes, never innerHTML or instructions.
```

The current profile accepts up to ten source rows, a 16,000-character decoded passage and a 200,000-character serialized envelope. Unsupported evidence, identity or trust shapes refuse instead of guessing a citation. The adapter deliberately projects the useful evidence fields rather than retaining every tool field. `structuredContent` is required; the human-readable text channel isn't a JSON fallback. A tool error never becomes usable evidence merely because another channel contains older data.

The adapter checks the bound document identity, trust contract, returned source link and provenance. It preserves page and actual source date when present, keeps the app's observed read time separate, and returns `sourceVersion: null`: this result doesn't supply a stable source revision. A new read time or response hash mustn't be advertised as a changed document. A passage search isn't a complete document review, even when every requested file has a matching passage.

It checks the canonical production document links on `app.x1wealth.com`. For an explicitly authorized non-production X1 origin, the app operator can supply a fixed `allowedAppOrigin`; don't take that setting from document content or an arbitrary end-user URL. No link is fetched or opened by the adapter.

Run its supplied synthetic checks with Node:

```sh
node --test path/to/build-with-x1/scripts/x1-evidence.test.mjs
```

The accompanying fixture is labeled example data and generated with X1's canonical trust serializer. The checks cover readable results, source substitution, missing structure, malformed envelopes, false coverage, unselected sources, unsafe links and literal malicious text. These are adapter checks, not a live connection or authorization test. All returned document-derived strings remain untrusted even after validation.

## Report the actual stage

| Observed state | Useful next action |
| --- | --- |
| Client configured, no user connection | Finish supported consent for this user. |
| Hosted callback not admitted | Prepare the one app/callback request; continue the supplied-file result. |
| Connected, required read unavailable | Name that missing capability; use a supported narrower read or supplied records. |
| No passages returned | Describe what this query returned; don't declare the record absent. |
| `read_not_established` or `passages_unavailable` | Show the returned message and indexed/degraded state. An unavailable read or withheld passage isn't an empty vault; retained rows still offer their source links. |
| Partial or degraded result | Show useful evidence and its exact coverage; don't label the review complete. |
| Rate limit or provider failure | Preserve current app work, report the limit and follow the actual retry contract. The adapter never retries. |
| Disconnected, earlier copy retained | Explain the copy's existing access/removal path separately. |

App-specific calculations and decisions stay in the app unless the owner asks to save a supported result back to X1. Use the exact mounted governed save contract, preserve authorship/source/audience and verify readback before claiming cross-tool continuity. Don't auto-sync every app event or create a parallel household record service.

`diagnosticRequestId` on a rate-limited response is opaque support metadata, not authorization or an idempotency/retry key. Passage `count`, retained source rows and distinct represented documents are different quantities; the adapter checks each rather than treating null-text rows as invalid.
