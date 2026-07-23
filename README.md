# floorplan-3d

**Goal: the best editable 3D home design experience — one a user can trust.**
Upload a floorplan and, moments later, walk around your own home in 3D and start
designing it. The enabling technology — and where our effort goes right now — is
**automatically and faithfully understanding the uploaded floorplan**:
generalizing across drawing styles, countries, languages, and scan quality with
no plan-specific tuning, so the user can trust the generated home without
verifying every wall, door, and window. Perception is the current bottleneck to a
magical product, not the product itself; the technology stays invisible.

![3D view of an uploaded floorplan, furnished, ceiling removed](<img width="1268" height="898" alt="Screenshot 2026-07-23 134034" src="https://github.com/user-attachments/assets/ce6e25bb-5717-444c-b16e-220790a4d665" />
)

📖 **See [`docs/VISION.md`](docs/VISION.md) for the full project vision — why the
design experience is the destination and automatic understanding is the current
bottleneck.**  That document is the north star; every architectural decision is
justified against it.

## What's here

- A **Next.js / React Three Fiber** app: upload or trace a floorplan, edit it in
  2D, and render/walk it in 3D — walls, openings, furniture (a real IKEA
  catalog), paint, and floors — with live multi-user co-editing.
- A **ground-up rebuild of the floorplan-understanding pipeline** (Python), built
  phase-by-phase against a held-out benchmark rather than tuned per plan. This is
  the active R&D surface of the project.

| Walkthrough mode | Material / paint catalog |
|---|---|
| ![First-person walkthrough of a furnished room]<img width="1271" height="901" alt="Screenshot 2026-07-23 134317" src="https://github.com/user-attachments/assets/d34a957a-0c01-49c2-b0b0-372f6cd1da5c" />
) | ![Paint color catalog panel](<img width="1264" height="901" alt="Screenshot 2026-07-23 134614" src="https://github.com/user-attachments/assets/d798c605-b58d-4137-8be5-39752551b249" />
) |

## Documentation

- [`docs/VISION.md`](docs/VISION.md) — north star: why this is a design-experience product, not a floorplan parser
- [`docs/paper.md`](docs/paper.md) — technical blueprint behind the extraction pipeline
- [`docs/extraction-plan.md`](docs/extraction-plan.md) — phase-by-phase execution plan and current status
- [`CLAUDE.md`](CLAUDE.md) — the working rules this project is built under (phase gates, frozen contracts, protected paths)

## Getting started

The product (Next.js app):

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The extraction/understanding pipeline (Python, standalone service, consumed by
the app through a JSON contract — see [`CLAUDE.md`](CLAUDE.md) for the full
repo map):

```bash
pip install -r extraction/requirements.txt
python -m eval.cli run
```

## License

All rights reserved. Source is visible for portfolio purposes; no license is
granted for reuse or redistribution.
