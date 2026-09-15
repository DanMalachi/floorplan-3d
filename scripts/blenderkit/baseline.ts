/**
 * The 71 BlenderKit items shipped as of commit c87b3ba (2026-09-15, IKEA removal),
 * frozen by id. build-catalog.ts applies the gates added on 2026-09-15 (measured
 * height band, no rescaling out of the extent band, brand/named-product scan,
 * props and wall/ceiling lights excluded) to NEW items only; these keep the
 * behaviour they shipped with, so tightening the gates cannot silently delete
 * a piece from someone's saved plan. Gate hits on these are PRINTED for Dan's
 * decision instead (e.g. the brand-named "Carl-hansen-son 501").
 *
 * Removing an id here is how a baseline item becomes subject to the new gates.
 */
export const BASELINE_IDS: ReadonlySet<string> = new Set([
  "3a845132-df64-4f02-8da6-44229fe774e4", // Master bed
  "4db7593a-c7c0-4517-82e6-6f5be2c865cc", // Floor Lamp
  "dc252bcb-1465-4c65-a03b-9e564204eae0", // Light Kinkiet
  "c0997e86-cb55-4607-a4fe-1b855c957ac0", // Projector Screen
  "f4b1081f-6d3e-4b06-b55e-8fc2f80de17a", // Wall light
  "0d8f6d0a-a383-4476-bc1b-a8ae8ff22135", // Wall Light
  "b8b951c4-1600-40f0-ba23-36ff3f5e86bb", // Waste Paper Basket
  "76e31f48-a0f7-4854-868a-c2f692b68f67", // Electric Stove
  "d889e3b1-6e86-48c6-bc5e-c6beeae322fc", // Bar Stool
  "c07eef6b-349e-487a-8315-c58fe9aa1d44", // Bench Alley Loft Classic
  "0bfe4a6a-7c4a-49de-9b6b-a4e855dde193", // Carl-hansen-son 501
  "dfdffe2b-4c26-4c33-9f13-784fe54c5570", // Carl-hansen-son CHAIR 29
  "498c5874-53ea-4706-8603-5face9777157", // Chair
  "703fe964-84bb-4468-84bd-f6aa3fb337b4", // Chair
  "1fa0bc00-505a-40cb-bcc4-19f237e041d4", // Chaise lounge (Sofa)
  "0716c650-c735-493b-8f3a-3be2edfd3115", // China Chair
  "e8a6bdac-2b8e-424c-ba9c-af3e0584e9a6", // Chinese Armchair
  "d4e83285-807e-4bcf-8d84-3dd83cb44da5", // Chinese Sofa
  "11adaf6f-177b-4301-82a8-8030ea31c421", // Chinese Stool
  "d19dd7b1-6573-41c7-b12c-b3eccdb7047d", // Cotton Mini Sofa
  "ecba830a-8df6-4375-b59c-a10a18f947f0", // Cotton Mini Sofa
  "2d312a73-fa7c-4a42-8b97-fb432e9275b6", // Ditre Italia Arlott High Sofa
  "e663848a-ed62-40a2-ae71-a56a34d7d443", // Folding Wooden Stool
  "b32f180a-a041-4b01-bcfb-5ff8e6794699", // Gallinera Chair
  "246cc152-48b6-46a9-b4c1-7f7f299d0148", // High Chair for Little Ones
  "6c59319d-a7b6-470b-a0f9-981083a415ae", // Leather Sofa
  "4faac4b8-cc88-4ff2-b7fd-a7edf46d3518", // Leather Sofa
  "722988c3-67ad-497d-84ea-7b5408b05d38", // Marina Bench without Backrest
  "17208e80-4a12-4509-ac48-ed20ea923f87", // Metal Bench
  "2e1631c7-96ab-45c0-b822-4b4868b8d83e", // Metal Stool 01
  "5670b13c-e817-48a8-a78e-4dcfc2e4ec89", // Metal Stool 03
  "f5f8aa7e-aa53-4c35-abb2-6c6c81b30604", // Mid Century Lounge Chair
  "c0afe8be-94f7-4c7d-929c-8d8d0a36d7de", // Modern Fabric Pouf
  "eaeba31c-8d32-4d47-b3ce-2a494ce2b17f", // Office Chair
  "8e9f05a2-8a6b-4bcf-a10c-3b30756d3892", // Painted Wooden Bench
  "ac92d62f-df99-4af2-89ac-be9549c268a6", // Painted Wooden Chair 02
  "331afbd0-0322-423e-8967-d41257b93b62", // Painted Wooden Sofa
  "aad78f1d-ca8a-4def-bee7-836207e91484", // Painted Wooden Stool
  "0e9aa213-afd4-4b45-ba88-d3b76bcef9ce", // Plastic chair
  "a48fb06f-f8d1-4936-82d1-053e6f0c372a", // Rustic chair
  "2762707d-892d-4fd1-8ce6-5460da1f0b5a", // Trecento Sessanta
  "9df5c46e-cadf-4c15-816c-31ef905892ee", // Vincent shepard Teo
  "bf356937-e6e7-4a2e-91c7-c1251d1a406b", // Vintage Armchair
  "a9acd8c6-7c9f-4d2d-9125-ab73b5dfa4ae", // Vintage Day Bed
  "a31c827d-81e6-4d1a-ba5a-1a6c5ea5459a", // Wodden chair
  "9bff6a18-14e1-4442-aa22-6d7bb686d776", // Wooden Bench
  "0d05c301-90b9-469a-8d52-91f9e9010244", // Wooden Chair
  "1890dedc-c249-40b7-947a-296ee154df2b", // Wooden Picnic Table
  "eb82ecf0-7240-4e91-a699-ed8f28cae459", // Wooden Stool 02
  "2b43761f-123c-4017-b706-ebef91754456", // Chinese Cabinet
  "b529df0c-671b-4589-bc1c-367fda168cc4", // Corner Shelf
  "d69acfaa-14da-4513-8026-3887bfd3125b", // Miomare bathroom shelf
  "89df3e31-303c-4401-a54f-ec834e46e180", // Modern Wooden Cabinet
  "30a3d1c5-6554-42fd-a8d0-a1efdff162b3", // Painted Wooden Cabinet
  "9c201695-6847-410f-89df-7cdc0ec14f23", // Painted Wooden Nightstand
  "830e4547-ad81-48cb-b61d-d387d046a449", // Painted Wooden Shelves
  "2747a371-7a7e-4b76-be24-7660093c0b84", // Steel Frame Shelves 03
  "4b94c4f8-45c6-4e66-aaeb-ea2221b5f29e", // Worn Metal Rack
  "294c2ee9-a12f-4b8c-a5c5-f7178326cb75", // Chinese Console Table
  "4db96473-72ed-4947-80d8-af6dc1c4dee8", // Coffee Table
  "a85d4f2f-b1d6-4a05-8e54-a3ba0b7efe9f", // Dining table
  "8c7111e8-3d2e-4be1-a2d2-b03e9acd9a45", // Dining Table
  "1057fdd0-a688-4ba1-b624-94f8466ce6c8", // Gallinera Table
  "1a2474e6-2fce-480a-be98-0b12c6b696ab", // Industrial Coffee Table
  "8a90d1ac-eefb-45ff-b854-e0d66b067d39", // L Shape Glass Desk
  "d4de2ba6-412d-4e23-8cbc-50f5ee7cfa4e", // Luxury Coffee Table
  "0ab00d3f-db59-42cf-b000-e8a3ce25b12c", // Metal Office Desk
  "b6bdc26a-36bb-4be3-8f64-312836aae79b", // Modern Coffee Table
  "c56d5811-f7c7-42a0-b007-11547d50f798", // Modern Glass Table
  "4fd0b237-9527-45d5-b82a-4cfec427f673", // Round Wooden Table 02
  "0dd6f649-dbef-4c78-a8ae-574bcc9cad64", // Wooden Corner Table
]);
