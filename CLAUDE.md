# Discogs Collection Viewer — Claude Guidelines

## Project Overview

A personal vinyl collection browser. React + TypeScript + Vite frontend, Vercel Serverless Functions backend, Vercel Blob for caching. Fetches data from the Discogs API and displays a user's collection with tracklist and YouTube video embeds.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Vercel Serverless Functions — Node.js runtime (`VercelRequest`/`VercelResponse`)
- **Storage**: Vercel Blob
- **Data**: Discogs API (personal access token auth)
- **Hosting**: Vercel

---

## Design System

**Use [shadcn/ui](https://ui.shadcn.com/) as the reference design system.**

- Follow shadcn/ui conventions for component structure, spacing, and visual language
- Prefer shadcn/ui patterns for primitives (cards, buttons, inputs, dialogs, etc.)
- shadcn/ui uses Tailwind CSS under the hood — if Tailwind is added to this project, follow its utility-first approach
- Before building a UI component, check if a shadcn/ui equivalent exists and use it as the reference implementation
- For the `/frontend-design` skill, use shadcn/ui as a baseline quality bar — then push beyond it

---

## Local Development

Always use `vercel dev` — **not** `npm run dev`. Running `npm run dev` alone starts only Vite and the `/api/*` routes will 404.

```bash
vercel dev        # starts frontend + API functions together on :3000
```

After a fresh setup or after adding new env vars to the Vercel project, restart `vercel dev` for changes to take effect.

### First-run collection sync

After starting `vercel dev` for the first time, populate the blob snapshot:

```bash
curl http://localhost:3000/api/admin/sync -H "x-admin-secret: <ADMIN_SYNC_SECRET>"
```

---

## Environment Variables

Managed in the **Vercel project dashboard** (not just `.env.local`). Add user-defined vars with:

```bash
printf "value" | vercel env add VAR_NAME development
```

Use `printf` (not `echo`) to avoid trailing newlines in the stored value. After adding vars, restart `vercel dev`.

Required vars: `DISCOGS_TOKEN`, `DISCOGS_USERNAME`, `DISCOGS_USER_AGENT`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_SYNC_SECRET`.

---

## API Function Runtime

All `api/` handlers **must use the Node.js runtime format** (`VercelRequest`/`VercelResponse`). The Workers-style `export default { fetch() }` format runs in Edge Runtime where user-defined env vars are not injected by `vercel dev`.

```ts
// Correct
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async function handler(req: VercelRequest, res: VercelResponse) { ... }

// Avoid — Edge Runtime, env vars won't load in vercel dev
export default { async fetch(request: Request) { ... } }
```

---

## Commit Conventions

- Prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Short imperative subject line
- Include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` on AI-assisted commits
- Each logical change gets its own commit — don't batch unrelated changes
- Always get user approval before committing or pushing

---

## Code Style

- TypeScript strict mode — no `any` unless unavoidable
- Inline styles for one-off layout; CSS classes for reusable or animated styles
- No external UI libraries beyond what's already installed unless explicitly approved
- No new packages without user approval
- Keep `src/App.tsx` as the single frontend file unless components grow large enough to warrant splitting
