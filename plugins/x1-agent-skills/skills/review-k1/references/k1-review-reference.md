# K-1 review reference, rule set for tax year 2025

A map of the fields review-k1 reads, taken from the final 2025 IRS forms and
recipient instructions. It is here so the agent keeps form, box, and code
together, not to support a tax conclusion. Codes mean different things on
different forms and boxes: 1065 box 20 code Z is section 199A information,
1065 box 13 code Z is itemized deductions, and AH or AJ mean one thing in box
15 and another in box 20.

Sources, all checked 2026-09-25:
[Schedule K-1 (Form 1065) 2025](https://www.irs.gov/pub/irs-pdf/f1065sk1.pdf),
[partner's instructions](https://www.irs.gov/instructions/i1065sk1),
[Schedule K-1 (Form 1120-S) 2025](https://www.irs.gov/pub/irs-pdf/f1120ssk.pdf),
[shareholder's instructions](https://www.irs.gov/instructions/i1120ssk),
[Schedule K-1 (Form 1041) 2025](https://www.irs.gov/pub/irs-pdf/f1041sk1.pdf),
[Form 1041 instructions](https://www.irs.gov/instructions/i1041),
[partnership K-2/K-3 instructions](https://www.irs.gov/instructions/i1065s23),
[S corporation K-2/K-3 instructions](https://www.irs.gov/instructions/i1120s23),
[Form 7004 instructions](https://www.irs.gov/instructions/i7004), and
[BBA administrative adjustment requests](https://www.irs.gov/businesses/partnerships/file-an-administrative-adjustment-request-for-a-bba-partnership).
Draft 2026 forms exist and are marked "DRAFT, DO NOT FILE"; this reference
uses the final 2025 forms.

## Who is who

| Form | Issuer | Recipient fields | Ownership fields |
|---|---|---|---|
| 1065 (partnership or LLC taxed as one) | Part I: EIN, name, address, IRS center, PTP box | Part II: partner TIN and name; general or limited; domestic or foreign; disregarded entity name and TIN; entity type; retirement plan | Item J beginning and ending profit, loss, and capital percents, and the "decrease is due to sale or exchange" box; K1 liabilities, K2 lower-tier liabilities, K3 guarantees; L capital account; M contributed property; N net unrecognized section 704(c) gain or loss |
| 1120-S (S corporation) | Part I: EIN, name, address, IRS center, total shares | Part II: shareholder number and name; F2 the person responsible for reporting when the named shareholder is a disregarded entity, trust, estate, or nominee; F3 entity type | G allocation percent, H shares, I shareholder loans. No item J, K, L, M, or N |
| 1041 (estate or trust) | Part I: EIN, name, fiduciary, 1041-T, final Form 1041 box | Part II: beneficiary number and name, domestic or foreign | None. A beneficiary K-1 is not a partnership K-1 received by a trust |

Final and amended checkboxes sit above Part I on all three.

## The boxes review-k1 flags

| What | 1065 | 1120-S | 1041 |
|---|---|---|---|
| K-3 indicated (the box says one is attached; whether the pages are in the packet is a separate fact) | box 16 | box 14 | none |
| Section 199A information | box 20 code Z | box 17 code V | box 14 code I |
| More than one activity (at-risk, passive) | boxes 22 and 23 | boxes 18 and 19 | per-activity statement |
| Items affecting basis | box 19 distributions (codes A to G) | box 16 (A to F, including D distributions and E loan repayments) | none |
| Sale detail | item J sale box; box 20 AB section 751; AC and AD | none on the face | none |
| Final-year deductions | none | none | box 11 (A and B are two separate categories of excess deductions on termination; C, D capital loss carryovers; E, F NOL carryovers) |

Statements are part of the packet. When a code says "see statement", the
statement's presence is a separate fact from the code: present, absent, or
unknown.

## Things that are easy to get wrong

- Item L is tax-basis capital, not the partner's outside basis. Basis, at-risk
  (Form 6198), passive (Form 8582), and excess business loss (Form 461) are
  the CPA's calculations, in that order. S corporation stock and debt basis
  is tracked on Form 7203; a property distribution from a partnership may
  call for Form 7217.
- A blank item L can be permitted for a small partnership that meets the 2025
  Schedule B question 4 conditions. It is a question, not an error.
- A missing K-3 is not automatically a defect. The domestic filing exception
  requires limited foreign activity, eligible partners, and timely
  notification; a partner who needs K-3 can request it, and for an extended
  calendar-year 2025 return the request date runs to August 17, 2026.
- An estimate letter is a forecast. It never replaces the K-1.
- A Form 8986 push-out statement from a BBA partnership's administrative
  adjustment request is not an amended K-1; IRS guidance says such a
  partnership should not issue amended K-1s for that request.
- Match a fiscal-year K-1 by its stated tax year end, not by the upload date
  or a folder name.

## Rule sets

| Tax year | Status | Applies to |
|---|---|---|
| 2025 | Shipped (this file) | K-1s printed "2025", received during 2026 |
| 2026 | Not published | As of September 25, 2026 the IRS has posted drafts of all three 2026 K-1s (1065 created March 24, 1120-S April 23, 1041 May 22), draft 2026 shareholder and beneficiary instructions, and draft 2026 K-2 and K-3; the 2026 partner instructions are not posted. The draft face boxes match 2025. Changes that start in 2026 land at the recipient level (section 199A phase-in and $400 minimum, the section 461(l) threshold, the 0.5% individual and 1% corporate charitable floors) and in the 1041 page-two guide. X1 will publish 2026 checks after the forms are final (the 2025 forms were finalized December 16, 2025 to January 13, 2026). Until then a K-1 whose return year is 2026 is reviewed for identity and version only, and flagged `tax_year_rules_not_published`; if it is printed on the 2025 form, it is also flagged `form_year_differs_from_tax_year`. |

## Dates for calendar-year 2025

| Filer | Original due date | With extension |
|---|---|---|
| Partnership (1065) or S corporation (1120-S) | March 16, 2026 (March 15 was a Sunday) | September 15, 2026 |
| Estate or trust (1041) | April 15, 2026 | September 30, 2026 (a bankruptcy estate: October 15, 2026) |
| Individual (1040), the K-1 recipient | April 15, 2026 | October 15, 2026 |

An extension extends filing, not the recipient's payment obligations. Late
fund K-1s are common; use "past the original date" freely, and "past the
extended date" only when something on file shows the issuer extended.

## State K-1s

State K-1s are separate artifacts, not copies of the federal one. Examples:
California Schedule K-1 (565) and K-1 (568), New York IT-204-IP,
Pennsylvania PA-20S/PA-65 NRK-1, Colorado DR 0106 K-1. State-source amounts,
pass-through entity tax, composite returns, and nonresident withholding can
change the owner's state work even when the federal K-1 is complete.

## Evidence field names

Use these names in a receipt's `evidence` and question `sources`, so a CPA,
another agent, or the grader can find the line. Each item carries the page
and a verbatim `quote` from the document.

| Field | Where it is |
|---|---|
| `tax_period` | The line with the calendar year or "tax year beginning ... ending ..." |
| `final_amended_boxes` | The Final K-1 and Amended K-1 checkboxes |
| `part_i_ein`, `part_i_name` | Part I, the issuer's EIN and name |
| `part_ii_recipient` | Part II, the partner or shareholder named (1065 item F, 1120-S item F1) |
| `part_ii_beneficiary` | 1041 Part II, the beneficiary named |
| `item_j`, `item_j_sale_box` | 1065 item J percentages, and its sale-or-exchange checkbox |
| `item_l` | 1065 item L capital account |
| `item_i` | 1120-S item I shareholder loans |
| `item_e_final_return` | 1041 item E, the final-return checkbox |
| `box_16`, `box_17_v`, `box_11` | The box by number (and code, where a code is named) |
| `box_20_z_statement`, `box_20_ab` | A box and code, or the statement that code points to |
| `amendment_explanation` | The issuer's explanation of what an amended K-1 changed |
| `letter_status`, `letter_recipient` | An estimate letter's own status line and investor line |
| `footnotes` | A footnotes or notes page |
| `exhibit_a`, `schedule_a` | An operating agreement's member exhibit, a trust's property schedule |
| `metadata:filedOn`, `metadata:name` | A fact from the vault record, not the page (no page number) |

