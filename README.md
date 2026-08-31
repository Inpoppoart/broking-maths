# Subtraction Drill

A mental-arithmetic trainer for desk-style subtraction. The aim is automaticity —
see the calculation, recognise it, answer — rather than working through a long
conscious chain of steps. It does not teach an alternative method; it drills the
one you already use until it stops needing thought.

Every operand and every answer stays between **10 and 300**.

## The four stages — 16 levels

**Stage 1 · Integer foundation**
| | |
|---|---|
| 1A | 2-digit − 1-digit — `83 − 7` |
| 1B | 2-digit − 2-digit, no borrowing — `74 − 32` |
| 1C | 2-digit − 2-digit, borrowing — `91 − 46` |
| 1D | 3-digit − 1-digit — `157 − 8` |
| 1E | 3-digit − 2-digit — `183 − 47` |

**Stage 2 · Harder integer**
| | |
|---|---|
| 2A | 3-digit − 2-digit, borrowing across hundreds — `231 − 45` |
| 2B | 3-digit − 2-digit, cascade borrowing — `205 − 66` |
| 2C | 3-digit − 3-digit — `287 − 206` |
| 2D | 3-digit − 3-digit, multiple borrowing — `273 − 196` |

**Stage 3 · Fraction-only** (retrieval speed, not fraction knowledge)
| | |
|---|---|
| 3A | eighths, quarters, halves — `5/8 − 1/8` |
| 3B | negative differences — `1/8 − 7/8` |
| 3C | sixteenths — `11/16 − 3/8` · unlocked by mastering 3A **and** 3B |

**Stage 4 · Mixed** — the desk skill
| | |
|---|---|
| 4A | easy integration — `274 3/4 − 58 3/8` |
| 4B | fractional borrowing — `187 1/4 − 17 1/2` |
| 4C | hard integer + fractional borrowing |
| 4D | desk simulation — everything, sixteenths included |

## How it adapts

Every answer records the level, the pattern, whether borrowing was required, the
response time and whether it was correct. Question selection is then weighted
toward the patterns you are slow or wrong on, with a floor so nothing is starved.

Promotion is gated on **accuracy first, then speed** — never by simply shortening
a timer:

- judged on **recent** performance, so early mistakes don't hold back a learner who has improved
- **median** response time, not average; long pauses are excluded and counted separately as outliers
- tested once per fully-refreshed window with a Wilson lower bound, so a lucky run doesn't promote you
- **fast but inaccurate** is detected and called out rather than silently blocking you
- if a level turns out to be beyond you, the app steps you back down

## Dashboard

Today's questions, accuracy, median, average and best; medians split by integer /
fractions / mixed; and the weakest pattern named in each category — for example
*"3-digit − 2-digit borrowing across hundreds"* or *"fractional borrowing"*.

## Answering

Tap it in on the on-screen numpad and hit **ANSWER !** — no typing. There is no
text input on the page at all, so the iOS keyboard can never appear and the
layout never shifts mid-drill.

- `⌫` backspace, `C` clear, `−` toggles a negative (Stage 3B answers go negative)
- the keypad adapts per level: digits on integer stages, fractions from stage 3,
  and on fraction-only levels the digits collapse away since the answer is always a fraction
- tap `135` then `⅞` for `135 7/8`
- a physical keyboard still works — digits, `-`, `/`, `.`, Backspace, Escape and Enter

Mixed numbers, decimals and bare fractions are all accepted: `135 7/8`,
`135.875`, `7/8`, `-3/4`.

## Files

| | |
|---|---|
| `index.html` | markup |
| `app.js` | DOM wiring and the drill loop |
| `drill.js` | all pure logic — generators, statistics, adaptive selection, progression |
| `fx.js` | audio feedback only |
| `styles.css` | styles |
| `sw.js` | service worker (network-first, so updates land immediately) |
| `test.js` | test suite for the engine — `node test.js` |
| `manifest.webmanifest`, `icon-*.png` | PWA install |

`drill.js` has no DOM dependency and loads under Node, so the generators and the
adaptive engine can be tested directly:

```
node test.js
```

## Install

Settings → Pages → Deploy from branch → `main` → `/root`.
Open the Pages URL in Safari → Share → Add to Home Screen.
