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

## Testing

Run the complete test suite with:

```bash
npm test
```

Pricing and preset-data tests use Node.js's built-in test runner. UI tests use
Vitest, jsdom, and React Testing Library.

Run lint with:

```bash
npm run lint
```

Run the production build with:

```bash
npm run build
```

## Local Supabase

Docker Desktop with Docker Compose is required for the local Supabase stack.
The Supabase CLI is installed as a project development dependency, so no
global installation is needed.

Start the local services:

```bash
npm run supabase:start
```

Rebuild the local database from committed migrations:

```bash
npm run supabase:reset
```

Generate TypeScript database types from the running local database:

```bash
npm run supabase:types
```

Run the PostgreSQL constraint and Row Level Security tests:

```bash
npm run test:db
```

Stop local services when they are no longer needed:

```bash
npm run supabase:stop
```

Commit `supabase/config.toml`, migrations, database tests, and generated
database types. Supabase `.temp` and branch metadata, `.env` files, local
credentials, signing keys, database dumps, and service-role secrets must never
be committed. Local CLI output may display development-only keys; do not copy
them into source files. No hosted Supabase credentials are required for local
database work.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
