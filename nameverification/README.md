# Target name generator

Small [Next.js](https://nextjs.org) app: you describe what kind of name you want in plain language, and **Google Gemini** returns a single **target name** string. The API key stays on the server.

## How to run

From this directory (`nameverification/`):

```bash
npm install
```

Create `.env.local` with your Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)):

```bash
GEMINI_API_KEY=your_key_here
```

Optional — override the model (default is `gemini-2.0-flash`):

```bash
GEMINI_MODEL=gemini-2.0-flash
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter a prompt, click **Generate**, and the **Target name** section shows the model’s one-line reply.

Other commands: `npm run build` (production build), `npm run start` (run the built app), `npm run lint`.

## How it works

1. **Frontend** (`app/page.tsx`): A client form collects your prompt and `POST`s JSON `{ "prompt": "..." }` to `/api/generate`.
2. **API route** (`app/api/generate/route.ts`): Validates the body, reads `GEMINI_API_KEY`, and calls the Gemini SDK with a fixed system instruction so the model answers with **exactly one name**, one line, no extra text. The handler trims the response and uses the first line as `targetName`.
3. **Response**: `{ "targetName": string }` on success, or `{ "error": string }` with an HTTP error status if something is misconfigured or the request fails.

Env files can live in this folder (e.g. `.env.local`) or in the parent repo directory; `next.config.ts` loads env from the parent as well so a key at the monorepo root can work for local development.
