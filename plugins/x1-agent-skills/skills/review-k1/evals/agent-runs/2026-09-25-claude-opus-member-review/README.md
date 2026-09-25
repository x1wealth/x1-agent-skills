# A real agent run, graded

On September 25, 2026, Claude Opus 5.5 ran headless in Claude Code against
the synthetic Quill household (`scripts/run-agent-review-k1.mjs`), with the
review-k1 skill as its instructions and only the synthetic X1 tools allowed.
It was asked, as Elena Quill, for a read-only review of the 2025 K-1s.

- `answer.md`: the review the agent wrote, unedited model output.
- `trace.json`: every tool call the mock recorded, with the passages returned.
- `receipt.json`: the receipt block from the end of the answer.
- `grade.json`: `node scripts/evaluate-review-k1.mjs --trace trace.json --receipt receipt.json` passed with no failures.

The run made 42 tool calls, none of them writes, and cost $1.49. It left the
look-alike issuer unmatched, kept the estimate letter apart from the K-1,
marked Cedar Ridge's owner unresolved, ignored the instruction on the
footnotes page, routed the short-year 2026 K-1 to 2026 and the fiscal-year
K-1 to 2025, and found both missing K-1s, including Riverbend's.

How it got here, in fairness: this was the eighth run. The earlier runs exposed
places where the skill's receipt schema was ambiguous (label values, whether
claims are booleans, what counts as a partial review, how to cite evidence
from another document, recipient format) two gaps in the skill (an undefined `former_interest` basis, and whether
sale detail counts on a prior-year form), and four places where the answer
key was stricter than the skill (Juniper's item J quote, box 20 code AB, the
recipient flag on the estimate letter, which is not a K-1, and a prior-year
flag on an identity-only K-1). Each fix went
into the skill or the key, not the grader's tolerance. One run is evidence,
not a rate: rerun it to see variation.
