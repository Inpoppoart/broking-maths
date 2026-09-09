# Price Drill

A mental-arithmetic trainer for desk-style broking maths: a two-digit price with
an eighth, plus or minus another. The aim is automaticity — see the calculation,
recognise it, answer — rather than working through a long conscious chain of
steps. It does not teach an alternative method; it drills the one you already use
until it stops needing thought.

Every operand carries a real eighth (⅛ ¼ ⅜ ½ ⅝ ¾ ⅞) — never a bare whole number.
Subtraction comes up roughly twice as often as addition.

## The five levels

**2-digit ± 1-digit** — a price against a small spread

| | | |
|---|---|---|
| A1 | clean eighths | `73 5/8 − 3 3/8` |
| A2 | the eighths carry | `53 1/4 − 8 3/8` |

**2-digit ± 2-digit** — a price against a price

| | | |
|---|---|---|
| B1 | clean eighths | `99 7/8 − 88 5/8` |
| B2 | the eighths carry | `63 1/8 − 40 3/8` |
| B3 | eighths *and* tens carry | `52 1/2 − 19 7/8` |

The ladder is built around the two things that actually cost time: whether the
eighths column borrows into the whole number, and whether the whole number then
borrows across tens. B3 is the full desk case.

## How it adapts

Every answer records the level, the pattern, whether borrowing was required, the
response time and whether it was correct.

**Not every question comes from the level you are on.** Roughly:

| | |
|---|---|
| ~65–85% | the level you are training |
| ~15% | earlier levels, interleaved |
| up to 20% | earlier levels that are *due*, on an expanding schedule |

Blocked practice — drilling one pattern at a time until it sticks — produces
faster gains in the session and worse retention than interleaving. And material
you never revisit decays. So mastered levels keep reappearing: first a few
minutes later, then twice as far out after each clean pass, up to several days.
A missed review pulls the interval back in. Review questions are labelled, so a
sudden easy one is not mistaken for the app regressing.

Within a level, selection is weighted toward the patterns you are slow or wrong
on, with a floor so nothing is starved — but also toward items you get right
**about 85%** of the time. Something you always get right teaches nothing;
something you usually miss teaches little either. The curve is deliberately
asymmetric, since too easy is the worse failure of the two.

Promotion is gated on **accuracy first, then speed** — never by simply shortening
a timer:

- judged on **recent** performance, so early mistakes don't hold back a learner who has improved
- **median** response time, not average; long pauses are excluded and counted separately as outliers
- **consistency** as well as speed: automatic recall is steady, effortful calculation is erratic, so
  a fast-but-uneven median does not count as automatic
- the first few answers of a session are slow but not less accurate, so their
  correctness counts and their timing does not
- tested once per fully-refreshed window with a Wilson lower bound, so a lucky run doesn't promote you
- **fast but inaccurate** is detected and called out rather than silently blocking you
- if a level turns out to be beyond you, the app steps you back down

## Dashboard

Today's questions, accuracy, median, average and best; medians split by **minus**
and **plus**; and the weakest pattern named for each — for example
*"2-digit ± 2-digit, minus, eighths + tens carry"*.

Splitting by operation is the point: if subtraction is the slow one, the two
medians say so directly.

## Answering

Tap it in on the on-screen numpad and hit **ANSWER !** — no typing. There is no
text input on the page at all, so the iOS keyboard can never appear and the
layout never shifts mid-drill.

- `⌫` backspace, `C` clear, `−` toggles a negative
- tap `45` then `⅛` for `45 1/8`
- a physical keyboard still works — digits, `-`, `/`, `.`, Backspace, Escape and Enter

Mixed numbers, decimals and bare fractions are all accepted: `45 1/8`,
`45.125`, `7/8`, `-3/4`.

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
