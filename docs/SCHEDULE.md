# Schedule — the only source of truth

Every other file's times are descriptive. **If two files disagree, this table wins.** Times are
NZ (UTC+13, daylight saving) and nobills' local (UTC+3, NZ − 10).

## The two kickoff calls

The event runs the same call twice:

- **Call 1 — Sat 11:00 NZ / Sat 01:00 his.** Oceania + Americas. **A attends; nobills is asleep.**
- **Call 2 — Sat 21:00 NZ / Sat 11:00 his.** Europe, Middle East, Africa, South Asia.
  **Both attend. This is nobills's start.**

| NZ (host, judges) | B local | What happens | Owner | Blocks |
|---|---|---|---|---|
| Sat 10:45 | Sat 00:45 | Warm bun cache; cloudflared + OBS binaries present | A | — |
| Sat 11:00 | Sat 01:00 | **Kickoff call 1.** Confirm deadline, prizes, judging format, theme; register nobills | A | everything |
| Sat 11:30 | Sat 01:30 | Fresh repo, `bun init`, tsconfig, skeleton | A | A0–A5, B1 |
| Sat 12:00 | Sat 02:00 | **GATE 0:** skeleton merged to `main` | A | all client work |
| Sat 13:00 | Sat 03:00 | **GATE 1:** two browsers, two ids, two cubes, movement replicates → tag `playable-1` (Kevin) | A | — |
| Sat 15:00 | Sat 05:00 | A2 block authority merged | A | B3 |
| Sat 17:00 | Sat 07:00 | Survival combat (hp, death) + win screen merged | A | B7 |
| Sat 19:00 | Sat 09:00 | Disasters merged (meteor first) | A | B6 |
| Sat 21:00 | Sat 11:00 | **Kickoff call 2 — both attend.** nobills online: clone, install, read pack; then B4/B5 | Both | B3–B8 |
| Sat 22:00 | Sat 12:00 | **A soft freeze** — no new mechanics for A; B continues feature work | A | — |
| Sat 23:00 | Sat 13:00 | **GATE 2 (B's first merge):** one B branch merged, or the solo cut list activates | B | — |
| Sun 08:30 | Sat 22:30 | Cold start on the host + a local second device (or two windows); one full round | A | — |
| Sun 09:30 | Sat 23:30 | **HARD FREEZE.** Demo-blocking fixes only. Tag `freeze`. B stops merging. | Both | video |
| Sun 10:00 | Sun 00:00 | Record the 2-minute video, one take | A (+B if awake) | submission |
| Sun 10:45 | Sun 00:45 | Upload video, **submit placeholder** | A | — |
| Sun 11:30 | Sun 01:30 | Rehearse the 3-minute demo twice, timed | A | — |
| Sun 12:30 | Sun 02:30 | **FINAL SUBMIT** — link, video, three one-liners. Tag `gold` | A | — |
| Sun 14:00 | Sun 04:00 | **Hard deadline** (assume 2:00pm is real) | — | — |
| Sun 15:00 | Sun 05:00 | Live demo, presented solo (finalist showcase per the Nov 11 blast) | A | — |

## The five numbers everyone must agree on

- **Freeze:** A soft freeze Sat 22:00 NZ; hard freeze Sun 09:30 NZ / his 23:30. B builds until
  the hard freeze.
- **Final submit:** Sun 12:30 NZ. Hard deadline Sun 14:00 NZ.
- **Demo length:** 3 minutes live, 2-minute video.
- **Disaster clock:** 2:00, 4:00, 6:00 into an 8-minute round. Never "every 90 seconds".
- **Tag rights:** only the human creates tags. `playable-1` (GATE 1), `playable-2` (A soft freeze),
  `freeze` (hard freeze), `gold` (after final submit).

## The one conversion

`his time = NZ time − 10 hours`. If you are reading this at a time not listed above, convert before
you accept any task: a "12:30" with no timezone in it is the single most expensive ambiguity in
this repo.

## Known conflicts (do not silently choose)

- **Demo slot:** the Luma page says **Sunday 5:00pm NZ**; the Nov 11 Discord blast says
  **02:00–03:30 UTC = 15:00–16:30 NZ**. This table uses **15:00**. Confirm in `#help`. For nobills
  that is 05:00 (15:00 NZ) or 07:00 (17:00 NZ).
- **Prize split:** the Luma page says **$175 / $75 / $50**; the Nov 9 blast says
  **$125 / $75 / $50 plus two $25 awards**. Confirm in `#help`; it does not change scope.
- **Submission:** treat **14:00 NZ** as hard. The 15:00 and 16:00 posts are demo/showcase times,
  not the deadline.
