# Meshy adapter

The adapter exists to reproduce the successful image-to-3D route with traceable inputs, credits, and artifacts. It never runs without both `MESHY_API_KEY` and `--confirm-spend`.

## Prepare without spending

```text
node .agents/skills/done-furniture-factory/scripts/meshy-image-to-3d.mjs \
  --image <reference.png> \
  --output <candidate-revision-directory> \
  --target-triangles 75000 \
  --dry-run
```

Show the resulting request summary to the user. Confirm that the image may be transmitted to Meshy and that up to the displayed credits may be spent. Current Meshy terms say non-Enterprise user content may be used to train or improve the service unless otherwise agreed, so confirm the account/privacy setting as well.

## Generate after approval

```text
node .agents/skills/done-furniture-factory/scripts/meshy-image-to-3d.mjs \
  --image <reference.png> \
  --output <candidate-revision-directory> \
  --target-triangles 75000 \
  --confirm-spend
```

The default uses Meshy 7.1 standard image-to-3D, 2K textures, PBR maps, triangle remesh, and saves the pre-remesh GLB. The service recommends no remesh for maximum source quality, which is why both source and room candidates are preserved. Do not overwrite either.

The adapter downloads temporary outputs immediately because API assets have limited retention. It writes the provider response, credit count, thumbnails, GLBs, and a pending rights record. It does not declare CC0.

API reference checked 2026-09-19: https://docs.meshy.ai/en/api/image-to-3d
