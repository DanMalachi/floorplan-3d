# P3a — lever #1 diagnose step: notch area as a fraction of room area

Per `docs/session-notes/p3a-handoff.md`'s bounded diagnose step for
converter-side doorway-notch handling (lever #1): before writing any
`rooms.py` code, size how big a notch actually is relative to its own
room's area, by room type, and decide whether option B (skip the
notch-flagged edge, eat the resulting area error against the 5%
`area_match_tolerance` gate) or option C (normalize the notch out of the
*source* room polygon before the area comparison) is the right build.
**Read-only. No changes to `rooms.py` or `skeleton.py` this session.**

## Method

`extraction/synth/qa/diagnose_notch_area_fraction.py`, full 17,000-plan
population. Reuses `measure_clean_at_source.py`'s already-validated notch
discriminator UNCHANGED (`opening_coverage >= 0.65`, perpendicular to the
nearest wall-backed ring neighbor, `edge_len <= 1.2 * wall_depth`) — this
script adds only an AREA computation on top of the same per-edge
classification, it does not re-derive or re-tune the discriminator.

**Grouping is by matched opening polygon, not ring-adjacency of flagged
edges.** `fill_openings_into_wall` typically heals a notch's own crossbar
edge (parallel to the wall run) back above `COVERAGE_THRESHOLD` on its
own — it isn't perpendicular, so it isn't jamb-shaped — even though it
sits *between* the two jamb edges that stay unbacked and flagged.
Grouping by ring-index contiguity of flagged edges alone would therefore
fragment one real notch into two disconnected single-edge pieces and
silently drop the crossbar. Each notch-flagged edge instead records which
door/window/front_door polygon produced its best `opening_coverage`
match (by stable `(type, index)` key, not Python object identity — a
same-request re-derivation risk, since shapely's `MultiPolygon.geoms`
does not guarantee the same object across repeated accesses); edges
sharing an opening are grouped into one pocket, whose ring-vertex span
runs from the group's earliest edge to its latest edge inclusive of any
interstitial edges.

**A same-opening match is necessary but not sufficient for "same pocket"
— a population-scale bug found and fixed before this report, not after.**
The first version of the script grouped purely by matched opening key and
produced two impossible outliers (fraction 100.51% and 99.69% of room
area — a notch cannot exceed the room it sits in). Both traced to the
same root cause: a room where two real, physically **unrelated** notches
on opposite sides of the ring both happened to best-match the *same*
opening polygon (plan 64, `bedroom_1`, a 16-edge ring: notch-flagged
indices 0/2 on one side and 8/10 on the other — 8 apart, exactly half the
ring — both keyed to `('door', 1)`). Grouping by key alone merged them
into one "pocket" spanning half the room. Fixed by clustering each
key-group by ring proximity first (`_cluster_ring_indices`, cap of 4 ring
edges between consecutive same-key indices — generous relative to the
validated zigzag case's gap of 2, tight enough to exclude plan 64's gap
of 6) before closing each cluster into its own span. Re-running plan 64
and the other outlier (plan 10374, `bathroom_0`) after the fix: both drop
to sane fractions (0.07% and 0.08% respectively). Population max dropped
from 100.51%/99.69% to 3.93%/2.00% (bathroom/bedroom) after the fix — see
Result below.

**Area is signed, not `abs()`.** A notch can only ever be a pocket the
room polygon dips INTO (adding area versus a straight-run reconstruction)
— ResPlan's room-boundary-through-the-threshold convention has no
mechanism to produce the opposite. Each candidate pocket's signed
shoelace area is compared against the parent ring's own signed area;
opposite signs are excluded from the area sum and counted separately
(`n_outward_anomaly`: 2 of ~950 candidate pockets population-wide — rare,
not investigated further, filed as a minor known anomaly).

**Denominator-convention check**: this script's `fraction =
total_notch_area / poly.area` uses the same denominator (source room
polygon area) `assemble_rooms`'s own area-match gate uses — confirmed by
reading the gate directly (`area_err = abs(implied_area - poly.area) /
max(poly.area, 1e-9)`, `extraction/synth/rooms.py:430`), not assumed.

**Rule-1 corroboration** (this phase's standing discipline — every
newly-derived QA number is provisional until corroborated or
spot-checked): two synthetic fixtures
(`extraction/synth/tests/test_diagnose_notch_area_fraction.py`) — a clean
single notch checked against its analytic area, and the exact geometry of
`test_measure_clean_at_source.py`'s zigzag adversarial fixture (plan
12017's real pattern: two doors, each a riser/crossbar/riser triple where
the crossbar independently heals and is never itself notch-flagged),
asserting the grouping collapses each door into ONE pocket with the
correct total area — both pass. Plus a visual spot-check
(`extraction/synth/qa/spotcheck_notch_area_fraction.py`) on 3 real
notch-affected rooms: two matched their door's footprint cleanly; the
third (plan 4375, `bathroom_1`) initially looked wrong (a thin sliver,
not the full ~19-unit door width) until direct inspection showed it was
*correct* — most of that door's recess is already wall-backed (would
assemble fine today) and only a narrow 0.74-unit sliver at one jamb is
genuinely unbacked, which is exactly the portion that would break
`assemble_rooms` and exactly what the script sizes. Worth noting as a
genuine finding: **a notch's sizeable area is not always the full door
footprint** — only the wall-unbacked fraction of it matters for this
question, and that fraction varies per instance.

## Result

By room type, notch-affected rooms out of all valid
`CLEAN_REQUIRED_ROOM_TYPES` instances scanned (population, not a sample):

```
                    notch-affected   total scanned   %
bathroom                       521           40413   1.29%
bedroom                        392           40756   0.96%
storage                          0            1797   0.0%
stair                             0             757   0.0%

n_outward_anomaly (excluded from area sums): 2
n_degenerate (span >= n-1 edges or zero-area, excluded): 54
```

**storage and stair show zero notch-affected instances, despite storage
rooms genuinely having broken (sub-threshold) edges** — spot-checked
separately (not the notch script itself): 154 of 308 storage-room
instances in the first 3000 plans have at least one edge below
`COVERAGE_THRESHOLD`, but none of them satisfy the notch conjunction.
Storage/stair's broken edges are not explained by the doorway-notch
mechanism at all — a different failure cause, not sized further here
(out of this diagnose step's bounded scope; filed for whichever session
looks at storage/stair specifically).

**Fraction of room area, among notch-affected rooms**:

```
              median    p90     max
bathroom      0.14%    0.34%   3.93%
bedroom       0.06%    0.79%   2.00%
```

**Exceedance, bracketed against the residual gate budget** (the notch
fraction adds to, doesn't replace, the room's own pre-existing
face-polygon area error — already measured elsewhere in this phase at
median 2.09% / p90 4.79% against the same 5% gate,
`extraction/synth/qa/measure_area_error.py`, 150-plan sample post
corner-fix):

```
                              bathroom (n=521)     bedroom (n=392)
> 5.00% (zero baseline)      0   (0.0%)            0   (0.0%)
> 2.91% (median baseline)    1   (0.2%)            0   (0.0%)
> 0.21% (p90 baseline)       116 (22.3%)           109 (27.8%)
```

The true "would eating the notch alone blow the gate" figure sits between
the median- and p90-baseline columns for both room types — i.e.
**somewhere between roughly 0.2% and 23-28%** of notch-affected rooms,
not a single number, because this script cannot assemble the real face
polygon (that requires the full wall_cycle/skeleton machinery this
diagnose step is deliberately staying out of).

**Recoverability split** (would a room with its notches suppressed have
any OTHER sub-threshold edge left, i.e. a second independent defect not
fixed by lever #1 alone):

```
                    notch_only          notch_plus_other
bathroom (n=521)    512  (98.3%)        9   (1.7%)
bedroom  (n=392)    342  (87.2%)        50  (12.8%)
```

## Reading this correctly — the decision

**Option B (skip the edge, eat the area error) is available.** The
notch's own area contribution is small in the overwhelming majority of
cases (median 0.06-0.14%, p90 well under 1%) — even at the pessimistic
end of the exceedance bracket (against the p90 baseline error, not the
median), roughly three-quarters to four-fifths of notch-affected rooms
would still clear the 5% gate with the notch simply eaten. The 22-28%
that might not clear it under the pessimistic bracket is a real cost, not
zero, but it is a minority, not the dominant outcome the original handoff
framing worried about ("plausibly at or over the 5% gate on its own").

**This measurement does not decide "B or C" — it decides whether B is
available as a simpler alternative.** Per the reframe going into this
diagnose step: option C (normalize the notch out of the source room
polygon) is viable essentially by construction regardless of notch size
— filling the notch out of the source makes both sides of the gate use
the same convention no matter how big the notch is, so C's real risk was
always discriminator *precision* (already audited elsewhere in this
phase: 3/3 confirmed, 0/57 wrongly excluded), not area. The notch-pocket
polygon this script builds for the area sum **is** the same polygon C
would union into the source room polygon — so C costs almost nothing
extra to implement now that this diagnostic exists, and it fully closes
the residual-budget ambiguity B leaves open (the 22-28% pessimistic-case
rooms). **Recommendation for the build session: implement C.** It
dominates B on cost (near-zero marginal cost given this script) and on
certainty (no bracket, no residual-budget gamble), and the size numbers
here rule out the one reason B might have been preferred (avoiding
source-polygon normalization work) — that work is already half-done.

**Recoverability**: 87-98% of notch-affected rooms have no other broken
edge, so lever #1 (whichever of B/C is built) should recover the large
majority of its own target population outright. The `notch_plus_other`
minority (1.7% bathroom, 12.8% bedroom) will need a second, independent
fix regardless of which option is chosen here — consistent with the
handoff's own framing that a materially-below-70-80% outcome on the
pre-registered conditional-rate prediction would point to a second
failure cause, not a disappointing result.

## What this changes

- The build session for lever #1 can proceed directly to option C
  (normalize the source room polygon by filling the confirmed notch
  pocket back in before the area comparison) with the discriminator,
  grouping, and area-computation logic already validated here — no
  further diagnose-step work needed before writing `rooms.py` code.
- Two known, filed-not-fixed items for whoever picks this up: (1)
  storage/stair's broken-edge population is NOT explained by the notch
  mechanism at all, a distinct question from lever #1; (2) the
  `n_outward_anomaly`/`n_degenerate` buckets (2 and 54 population-wide)
  are small and excluded from all sums here, not investigated further —
  worth a look if lever #1's own re-measurement ever looks off by a
  similarly small margin.
