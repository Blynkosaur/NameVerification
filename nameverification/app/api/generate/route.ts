import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const SYSTEM_INSTRUCTION = `You are a name generator. Follow the user's instructions exactly.
Reply with exactly one target name: a single string on one line.
Use only the Latin alphabet characters (A-Z), plus spaces between words.
No quotes, labels, markdown, or explanation—only the name text.`;

function enforceLatinAlphabetName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is not configured with GEMINI_API_KEY." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("prompt" in body) ||
    typeof (body as { prompt: unknown }).prompt !== "string"
  ) {
    return NextResponse.json(
      { error: 'Body must be a JSON object with a string "prompt" field.' },
      { status: 400 },
    );
  }

  const prompt = (body as { prompt: string }).prompt.trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt must be a non-empty string." },
      { status: 400 },
    );
  }

  const modelName =
    process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const modelOutput = text
      .trim()
      .split(/\r?\n/)[0]
      ?.trim() ?? "";
    const targetName = enforceLatinAlphabetName(modelOutput);

    if (!targetName) {
      return NextResponse.json(
        { error: "Model returned no valid Latin-alphabet name." },
        { status: 502 },
      );
    }

    return NextResponse.json({ targetName });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gemini request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
