# Agreement on the RQ3 classification

Classifications: the codebook rules applied to the facts (`rq3_rules.csv`, produced by `analysis/rq3_sheet.js`) and Demetre (`rq3_demetre.csv`), both with the facts in `rq3_facts.md` and the codebook in `rq3_instructions.md`.

```
node analysis/compare_reviews.js analysis/review/rq3_rules.csv analysis/review/rq3_demetre.csv id category
Agreement: 47 of 48 rows (97.9 %)
  41_basic:38 [category]: "other: misspelled in diagram" vs "other: diagram typo"
```

The only difference is the name of the same additional category for the misspelled method `findSecurityContraints`; in substance, both classifications agree on all 48 messages. **Resolution (2026-11-07):** the name `other: misspelled in diagram` is kept, so `rq3_rules.csv` and `../output/rq3_categories.csv` are the final classification.

**Note on independence (for the reliability discussion and the AI Use Disclosure):** according to `../effort_log.csv`, Demetre's classification was made with Claude (claude.ai), which wrote the first five rows as an example and a full version that Demetre compared his answers with; most of his answers match that version. The rules classification and the analysis scripts were written with Claude Code. The agreement therefore does not measure two fully independent human judgements.
