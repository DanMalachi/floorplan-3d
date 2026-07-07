# floorplan-3d

**Goal: the best editable 3D home design experience — one a user can trust.**
Upload a floorplan and, moments later, walk around your own home in 3D and start
designing it. The enabling technology — and where our effort goes right now — is
**automatically and faithfully understanding the uploaded floorplan**:
generalizing across drawing styles, countries, languages, and scan quality with
no plan-specific tuning, so the user can trust the generated home without
verifying every wall, door, and window. Perception is the current bottleneck to a
magical product, not the product itself; the technology stays invisible.

📖 **See [`docs/VISION.md`](docs/VISION.md) for the full project vision — why the
design experience is the destination and automatic understanding is the current
bottleneck.** That document is the north star; every architectural decision is
justified against it.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
