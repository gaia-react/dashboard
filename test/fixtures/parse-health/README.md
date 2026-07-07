# parse-health/ (W16)

`ParseHealthSlice` shapes (SPEC section 6.8) for the `ParseHealth` footer section,
one pair per scenario: a costs-side slice and an activity-side slice, mirroring
what `/api/costs` and `/api/activity` each carry under `parseHealth`.

- `costs-dirty.json` / `activity-dirty.json`: skipped lines, an unparseable
  ledger file, unknown `kind`/`status` values (with `"review"` appearing on
  both sides to prove the union dedupes), and a note describing an archived
  `cost.md` phase the SPEC-024 backfill missed (section 4.3): an upstream bug
  the footer surfaces verbatim, never a reason to add a `cost.md` parser.
- `costs-clean.json` / `activity-clean.json`: zero skips/unparseable files, no
  unknown values, no notes, driving the quiet all-clean state.
