# Name Verification App

This is a Next.js app with two tabs on one page:

- **Generate**: Calls Gemini to generate one target name string.
- **Verify**: Compares a candidate name against the latest generated target name using deterministic logic (no LLM calls).

## Run the app

From the `nameverification/` folder:

```bash
npm install
```

Create `nameverification/.env.local`:

```bash
GEMINI_API_KEY=your_key_here
# Optional:
# GEMINI_MODEL=gemini-2.0-flash
```

Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```bash
npm run lint
npm run build
npm run start
```
