import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";

import {
  assessDeterministicTier,
  NICKNAME_TABLE,
  verifierSignalsForLlm,
} from "@/lib/nameVerifier";

/** Gemini structured output: enforced via `generationConfig.responseSchema`. */
const VERIFY_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    match: { type: SchemaType.BOOLEAN },
    confidence: { type: SchemaType.NUMBER, format: "float" },
    reason: { type: SchemaType.STRING },
  },
  required: ["match", "confidence", "reason"],
};

type VerifyBody = {
  candidate?: unknown;
  targetName?: unknown;
};

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.candidate !== "string") {
    return NextResponse.json(
      { error: 'Body must include a string "candidate".' },
      { status: 400 },
    );
  }
  if (typeof body.targetName !== "string") {
    return NextResponse.json(
      { error: 'Body must include a string "targetName".' },
      { status: 400 },
    );
  }

  const targetName = body.targetName.trim();
  if (!targetName) {
    return NextResponse.json(
      { error: "No target name has been generated yet." },
      { status: 400 },
    );
  }

  const deterministic = assessDeterministicTier(body.candidate, targetName);

  if (deterministic.tier === "tier1_match") {
    return NextResponse.json({
      match: true,
      confidence: 1,
      reason: deterministic.reason,
    });
  }

  if (deterministic.tier === "tier2_nickname_match") {
    return NextResponse.json({
      match: true,
      confidence: 0.95,
      reason: deterministic.reason,
    });
  }

  if (deterministic.tier === "tier3_no_match") {
    return NextResponse.json({
      match: false,
      confidence: deterministic.score,
      reason: deterministic.reason,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Verifier needs GEMINI_API_KEY for tiebreaker decisions." },
      { status: 500 },
    );
  }

  const verifyModelName =
    process.env.GEMINI_VERIFY_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.0-flash";

  const nicknameTableForPrompt = JSON.stringify(NICKNAME_TABLE);
  const systemPrompt = `You are a name verification system. Decide whether two names refer to the same person, accounting for real-world spelling and formatting variation.

Rules:
- Consider typos, transpositions, transliteration, phonetic similarity, optional particles, hyphenation vs spaces, compound names split or merged, and Mc/Mac-style prefixes when judging sameness.
- Treat clearly different given names, gendered name pairs, distinct names that only share a prefix, different surname roots, or reorderings that imply a different person as non-matches.
- Token order matters when it changes which part is the given name vs family name in context.
- Only match nicknames that a typical person today would immediately recognize as the same name. If a name has become independent and is commonly used on its own (like Jack, Liam, Lisa, Sally, Molly), treat it as a distinct name even if it historically derived from another name.
- Test for nickname equivalence: if someone introduced themselves as Name A, would most people assume their legal name is Name B? If not, do not match them.
- If the names are too dissimilar overall, always return match=false.
- For nickname matching, use ONLY this table. If a name is a key in this table and the other name is one of its values, they are the same person. If a nickname relationship is not in this table, do not match based on nickname. Do not use any nickname knowledge beyond this table.
- If your decision depends on nickname equivalence and that nickname pair is not explicitly present in the table, return match=false.

Nickname table (JSON):
${nicknameTableForPrompt}

Reply using only the structured JSON output: match (boolean), confidence (0–1), reason (short string). No markdown or extra text.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: verifyModelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: VERIFY_RESPONSE_SCHEMA,
      },
    });

    const signals = verifierSignalsForLlm(body.candidate, targetName);
    const prompt = JSON.stringify({
      candidate: body.candidate,
      targetName,
      deterministicTier: deterministic.tier,
      deterministicScore: deterministic.score,
      deterministicReason: deterministic.reason,
      signals,
    });

    const llmResult = await model.generateContent(prompt);
    const raw = llmResult.response.text().trim();
    const parsed = JSON.parse(raw) as {
      match?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };

    if (
      typeof parsed.match !== "boolean" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reason !== "string"
    ) {
      return NextResponse.json(
        { error: "Verifier model returned invalid structured output." },
        { status: 502 },
      );
    }

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence.toFixed(3))));
    return NextResponse.json({
      match: parsed.match,
      confidence,
      reason: parsed.reason,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verifier tiebreaker request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
