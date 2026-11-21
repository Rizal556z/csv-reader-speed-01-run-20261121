# csv-reader-speed-01-run-20261121

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rizal556z/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rizal556z/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A faster drop-in replacement for make.fun's own [csv-reader](https://make.fun/c/csv-reader-speed-01-run-20261121) 1.0.0: `solve.js` returns exactly the answer csv-reader returns for every input — same columns, rows and errors, including its broken-row policy (stray CRs, unterminated quotes, junk after a closing quote, short and long rows) — but faster. Entry for the [make.fun competition `csv-reader-speed-01-run-20261121`](https://make.fun/c/csv-reader-speed-01-run-20261121).

## How it works

- A record whose fields are all plain (no quote, no stray CR) is taken as one slice and split on commas by the engine, instead of being walked one character at a time.
- Every other field is found with `indexOf` / a character-class scan, so the text is never walked one character at a time in JavaScript.
- Only the rare broken paths — a stray CR, a quoted field holding a line break or a doubled quote, junk after a closing quote — do any per-piece work, and then only on that one field.

`solve.js` is a dependency-free ES module: `run(input)` returns `{columns, rows, errors}` for one case's `{text, header}`. `main.ts` is the program the harness runs — it reads every case from `/input/cases.json`, answers each one alone with `run`, and writes `/output/answers.json`.

## Layout

- `solve.js` — the reader (fast record path, quoted-field reader, error records)
- `main.ts` — the driver the harness runs
- `LICENSE` — MIT

## License

MIT. See [LICENSE](LICENSE). The reader was written from scratch for this entry; its reading policy follows csv-reader 1.0.0's own policy as stated in the competition rules.
