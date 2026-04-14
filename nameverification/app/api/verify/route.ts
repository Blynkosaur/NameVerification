import { NextResponse } from "next/server";

import { verifyCandidateAgainstTarget } from "@/lib/nameVerifier";

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

  const result = verifyCandidateAgainstTarget(body.candidate, targetName);
  return NextResponse.json(result);
}
