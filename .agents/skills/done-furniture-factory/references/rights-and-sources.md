# Rights and source policy

CC0 is a release decision by a rights holder, not an automatic property of AI output.

## Allowed inputs for the CC0 lane

- an image/design authored by the user;
- an original reference generated for this project whose terms allow the user to own and redistribute the output;
- CC0 reference or material assets with a saved source URL and license snapshot;
- facts such as dimensions and generic style vocabulary.

Do not use product photography, logos, branded designs, marketplace previews, or another artist's model merely because they are visible online. Inspiration may inform a broad style; the candidate must not copy distinctive protected expression.

## Provider output

- Meshy free plan: Meshy owns the output and provides it under CC BY 4.0. It cannot enter the CC0 lane.
- Meshy paid plan: paid customers own output to the extent possible under applicable law. Record the plan and terms date. This permits a later owner dedication but does not cure an infringing input.
- Open model code/weights licenses govern use of the generator; they do not automatically prove that a particular output is copyrightable, unique, non-infringing, or safe to dedicate.

## Materials

Poly Haven assets are CC0 and may be redistributed; save the asset URL and license record. ambientCG materials are also CC0, but save the exact asset page and current license evidence. Do not use generic web images as textures.

## Required files

Every candidate has `sources.json` containing each input's creator, source URL/path, license, terms date, and role. Keep `rights.json` in `pending` state until all inputs and the provider output are resolved. Only the user/owner can approve the final CC0 dedication.

Recommended states:

- `blocked`: known incompatible license or unclear ownership;
- `pending`: evidence gathered, owner decision not recorded;
- `approved-original`: owner controls the candidate but has not dedicated it;
- `cc0-dedicated`: signed/recorded owner dedication exists for the exact SHA-256.

Never rewrite third-party provenance as “self-authored.” Never claim that a model being free to download means it is CC0.

Primary sources checked 2026-09-19:

- Meshy terms: https://www.meshy.ai/terms-of-use
- Poly Haven asset license: https://polyhaven.com/license
- Creative Commons CC0: https://creativecommons.org/publicdomain/zero/1.0/
