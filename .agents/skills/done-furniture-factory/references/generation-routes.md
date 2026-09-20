# Generation routes

Choose by visual need, rights, available hardware, and total cost per approved asset.

## Route A — paid image-to-3D service (default now)

Use for static beds, sofas, chairs, tables, cabinets, lamps, and decor when a strong reference image exists. This is the closest match to the successful Meshy experiment and is the most reliable route on the current 6 GB GTX 1060 workstation.

- Generate from an original/user-owned reference, not a retailer photo or branded product.
- Use the provider's high-detail image-conditioned model with PBR enabled.
- Preserve the original/pre-remesh GLB. Produce the room derivative only after the source silhouette is accepted.
- Paid Meshy is currently the implemented adapter. Its free-plan output is CC BY 4.0 and is not eligible for this factory's CC0 lane. Paid-plan customers own output to the extent possible under Meshy's terms, but the input and any third-party textures must still be cleared.
- Never spend credits or upload an image without approval at action time.

## Route B — local/open image-to-3D

Prefer this when compatible GPU hardware is already available or short-lived GPU rental is cheaper than provider credits.

| Engine | Practical use | License/hardware constraint |
|---|---|---|
| Microsoft TRELLIS.2 | Best open route to evaluate for high-fidelity PBR assets; image-conditioned; MIT | Official workflow is Linux/NVIDIA and needs roughly 24 GB VRAM. |
| Microsoft TRELLIS | Mature textured image-to-3D fallback; MIT | NVIDIA/CUDA stack; validate PBR/material quality against the benchmark. |
| Stability SPAR3D | Fast single-image reconstruction with GLB, remeshing, and improved materials | About 10.5 GB VRAM normally and roughly 7 GB in low-VRAM mode; Stability Community License and revenue threshold apply. Current 6 GB GPU is below the low-VRAM target. |
| Tencent InstantMesh | Apache-2.0 code and textured mesh export | Older quality baseline; use only after a visual bake-off. |
| Hunyuan3D 2.1 | Strong PBR research result | Do not use for this project without legal approval: its community license excludes the EU, UK, and South Korea and constrains output use by territory. |

Do not download or install these stacks speculatively. Record model/revision, code license, weight license, dependency licenses, hardware, runtime, and output-rights conclusion before production use.

## Route C — procedural/static Blender

Use for simple hard furniture whose quality comes from exact joinery and real materials, or when image-to-3D loses critical openings. Start from a designed reference and model semantic parts in Blender. Reuse proven authored techniques: real member thickness, six-segment bevels, weighted normals, analytic padded panels, derived piping/seams, and physical-scale PBR maps.

**Proven 2026-09-20:** an oak platform bed (rigid oak members, modelled foam pillows, cloth-simulated duvet) shipped via this route, built by a deterministic script in about 80 s. Tooling is in `scripts/blender/` and `references/blender-recipes.md`; read `references/lessons-learned.md` first.

Do not assign a cheap builder to invent the design while coding. The design, dimensions, part graph, edge profiles, and materials must already be resolved.

## Route D — parametric or modular asset-backed

Use only when live controls are required. First approve a static asset. Keep rigid parts rigid, stretch only declared zones, repeat modules at thresholds, regenerate cloth/seams, and preserve metres-per-repeat. See `parametric.md`.

## Source links checked 2026-09-19

- TRELLIS.2: https://github.com/microsoft/TRELLIS.2
- TRELLIS: https://github.com/microsoft/TRELLIS
- SPAR3D: https://github.com/Stability-AI/stable-point-aware-3d
- InstantMesh: https://github.com/TencentARC/InstantMesh
- Hunyuan3D 2.1: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1
- Stability license: https://stability.ai/license
