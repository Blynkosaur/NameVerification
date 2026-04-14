# Name Verification App

Small web app with two independent capabilities:

1. Generate a target name from a free-form prompt.
2. Verify a candidate name against the latest generated target name.

## Goal and Constraints

### What this app builds

- **Target name generation** from a user prompt.
- **Candidate verification** against the latest generated target name.

### Black-box architecture constraint

The verifier treats the generator as a black box:

- Verifier only receives the latest target name string.
- Verifier does **not** use generator chat history/context.
- Verifier does **not** call the generator to decide matches.
- No hidden shared state between generator/verifier decisions.

This is enforced by API separation:

- Generator route: `app/api/generate/route.ts`
- Verifier route: `app/api/verify/route.ts`
- Verifier logic: `lib/nameVerifier.ts`

The frontend stores the latest generated target name in:

- React state (`targetName`)
- `localStorage` key (`latestTargetName`) for refresh persistence

Verifier uses that stored string only.

## Functional Behavior

### Generator

User can:

- Enter a free-form prompt
- Click Generate
- See one returned target name string

Behavior:

- Each call returns exactly one target name
- Latest generation overwrites prior target name
- Name output is sanitized to Latin letters and spaces only

### Verifier

User can:

- Enter candidate name
- Click Verify
- Receive structured response:
  - `match` (boolean)
  - `confidence` (0.0 to 1.0)
  - `reason` (short explanation)

If no target name exists, verifier returns a clear error.

## Verification Pipeline (Current)

Pipeline is tiered and stable/consistent.

### Tier 1: Formatting normalization match (deterministic true)

Normalize both names:

- lowercase
- strip accents (`NFD`)
- remove punctuation/apostrophes
- collapse whitespace

If names are identical after normalization (including space-only split/join differences), return:

- `match: true`
- `confidence: 1.0`
- reason: identical after normalization

Example:

- `Jean-Luc Picard` vs `jean luc picard` -> Tier 1 match

### Tier 2: Nickname table match (deterministic true)

Tokenize both names (including particle-aware token parsing), then compare token pairs positionally using `lib/nicknameTable.json`.

If every token pair is exact or mapped by the nickname table, return:

- `match: true`
- `confidence: 0.95`
- reason: nickname table token mapping

Example:

- `Bob Ellensworth` vs `Robert Ellensworth` -> Tier 2 match

### Tier 3: Deterministic reject (deterministic false)

Reject immediately when any strong no-match signal is present:

- strict order swap (`Bryan Lin` vs `Lin Bryan`)
- unlisted prefix/same-root distinct-name patterns
- very dissimilar strings: full-name Jaro-Winkler `< 0.5` and no shared tokens

Returns:

- `match: false`
- `confidence`: deterministic score
- reason explaining reject path

Example:

- `Emanuel Oscar` vs `Belinda Oscar` -> Tier 3 reject

### Tier 4: LLM tiebreaker (Gemini structured output)

If unresolved by Tiers 1-3, call Gemini with structured JSON schema:

```json
{ "match": true, "confidence": 0.0, "reason": "..." }
```

LLM receives deterministic signals (normalized forms, tokens, metaphone outputs, similarity) and the nickname table. Prompt enforces:

- nickname matching only from provided table
- if nickname pair is not in table, do not match by nickname

## How to Run

From `nameverification/`:

```bash
npm install
```

Create `nameverification/.env.local`:

```bash
GEMINI_API_KEY=your_key_here
# Optional overrides:
# GEMINI_MODEL=gemini-2.0-flash
# GEMINI_VERIFY_MODEL=gemini-2.0-flash
```

Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then:

1. Generate tab -> prompt -> Generate
2. Verify tab -> candidate -> Verify

## Useful Commands

```bash
npm run lint
npm run build
npm run start
```

## Notes on Evaluation Requirements

- Deterministic tiers (1-3) are fully programmatic and stable.
- Structured outputs always include `match`, `confidence`, and `reason`.
- Verifier remains architecturally isolated from generator internals and uses only latest target name string.
