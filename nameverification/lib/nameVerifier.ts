export type VerifyResult = {
  match: boolean;
  confidence: number;
  reason: string;
};

const PARTICLES = new Set([
  "al",
  "ibn",
  "bin",
  "el",
  "von",
  "de",
  "van",
  "del",
  "la",
  "le",
]);

const NICKNAME_PAIRS: Array<[string, string]> = [
  ["bob", "robert"],
  ["liz", "elizabeth"],
  ["bill", "william"],
  ["jim", "james"],
  ["mike", "michael"],
  ["dick", "richard"],
  ["rick", "richard"],
  ["joe", "joseph"],
  ["tom", "thomas"],
  ["dan", "daniel"],
  ["dave", "david"],
  ["steve", "steven"],
  ["chris", "christopher"],
  ["matt", "matthew"],
  ["tony", "anthony"],
  ["sam", "samuel"],
  ["ben", "benjamin"],
  ["ed", "edward"],
  ["ted", "edward"],
  ["charlie", "charles"],
  ["kate", "katherine"],
  ["jen", "jennifer"],
  ["sue", "susan"],
  ["nick", "nicholas"],
  ["greg", "gregory"],
  ["phil", "philip"],
  ["ron", "ronald"],
  ["don", "donald"],
  ["ken", "kenneth"],
  ["andy", "andrew"],
  ["fred", "frederick"],
  ["johnny", "john"],
  ["bobby", "robert"],
  ["sarah", "sara"],
  ["jon", "jonathan"],
  ["sean", "shawn"],
];

const NICKNAME_MAP = new Map<string, Set<string>>();
for (const [a, b] of NICKNAME_PAIRS) {
  if (!NICKNAME_MAP.has(a)) NICKNAME_MAP.set(a, new Set());
  if (!NICKNAME_MAP.has(b)) NICKNAME_MAP.set(b, new Set());
  NICKNAME_MAP.get(a)?.add(b);
  NICKNAME_MAP.get(b)?.add(a);
}

type ParsedName = {
  normalizedFull: string;
  nameTokens: string[];
  namePositions: number[];
  particles: string[];
};

export function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitJoinedParticles(token: string): string[] {
  if (token.length < 3) {
    return [token];
  }
  for (const particle of PARTICLES) {
    if (token.startsWith(particle) && token !== particle) {
      const rest = token.slice(particle.length);
      if (rest.length >= 2) {
        return [particle, rest];
      }
    }
  }
  return [token];
}

function parseName(input: string): ParsedName {
  const normalizedFull = normalizeInput(input);
  const rawTokens = normalizedFull.split(" ").filter(Boolean);

  const expandedTokens: string[] = [];
  for (const token of rawTokens) {
    expandedTokens.push(...splitJoinedParticles(token));
  }

  const nameTokens: string[] = [];
  const namePositions: number[] = [];
  const particles: string[] = [];

  for (const token of expandedTokens) {
    if (PARTICLES.has(token)) {
      particles.push(token);
      continue;
    }
    namePositions.push(nameTokens.length);
    nameTokens.push(token);
  }

  return { normalizedFull, nameTokens, namePositions, particles };
}

function isNicknameMatch(a: string, b: string): boolean {
  return NICKNAME_MAP.get(a)?.has(b) ?? false;
}

function normalizeMcMac(token: string): string {
  if (token.startsWith("mac") && token.length > 3) {
    return `mc${token.slice(3)}`;
  }
  return token;
}

type TokenCompare = {
  score: number;
  reason: string;
};

function compareTokenPair(aRaw: string, bRaw: string): TokenCompare {
  const a = normalizeMcMac(aRaw);
  const b = normalizeMcMac(bRaw);

  if (a === b) {
    return { score: 1, reason: "exact token match" };
  }

  if (isNicknameMatch(a, b)) {
    return { score: 0.93, reason: "conservative nickname mapping match" };
  }

  const aMeta = doubleMetaphone(a);
  const bMeta = doubleMetaphone(b);
  const phoneticMatched =
    (aMeta.primary && (aMeta.primary === bMeta.primary || aMeta.primary === bMeta.alternate)) ||
    (aMeta.alternate && (aMeta.alternate === bMeta.primary || aMeta.alternate === bMeta.alternate));

  if (phoneticMatched) {
    return { score: 0.85, reason: "double metaphone phonetic match" };
  }

  let jw = jaroWinkler(a, b);
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (longer.startsWith(shorter) && longer.length - shorter.length > 1) {
    jw = Math.max(0, jw - 0.18);
  }

  if (jw >= 0.88) {
    return { score: jw, reason: `jaro-winkler match (${jw.toFixed(2)})` };
  }

  return { score: jw, reason: `low similarity (${jw.toFixed(2)})` };
}

function generateMergedVariants(tokens: string[], maxMerges: number): string[][] {
  const key = (arr: string[]) => arr.join("|");
  const seen = new Set<string>();
  const queue: Array<{ tokens: string[]; merges: number }> = [{ tokens, merges: 0 }];
  const variants: string[][] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const currentKey = key(current.tokens);
    if (seen.has(currentKey)) continue;
    seen.add(currentKey);
    variants.push(current.tokens);

    if (current.merges >= maxMerges || current.tokens.length < 2) continue;
    for (let i = 0; i < current.tokens.length - 1; i += 1) {
      const merged = [...current.tokens];
      merged.splice(i, 2, `${merged[i]}${merged[i + 1]}`);
      queue.push({ tokens: merged, merges: current.merges + 1 });
    }
  }

  return variants;
}

type PositionalComparison = {
  confidence: number;
  allCoreAboveThreshold: boolean;
  reasons: string[];
};

function comparePositionalTokens(aTokens: string[], bTokens: string[]): PositionalComparison {
  const count = Math.min(aTokens.length, bTokens.length);
  if (count === 0) {
    return {
      confidence: 0,
      allCoreAboveThreshold: false,
      reasons: ["no comparable name tokens"],
    };
  }

  const scores: number[] = [];
  const reasons: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = compareTokenPair(aTokens[i], bTokens[i]);
    scores.push(result.score);
    reasons.push(`token ${i + 1}: ${result.reason}`);
  }

  const weights: number[] = [];
  if (count === 1) {
    weights.push(1);
  } else if (count === 2) {
    weights.push(0.55, 0.45);
  } else {
    const middleWeight = 0.2 / (count - 2);
    for (let i = 0; i < count; i += 1) {
      if (i === 0) weights.push(0.4);
      else if (i === count - 1) weights.push(0.4);
      else weights.push(middleWeight);
    }
  }

  const weightedAverage = scores.reduce(
    (acc, score, index) => acc + score * (weights[index] ?? 0),
    0,
  );

  const allCoreAboveThreshold = scores.every((score) => score > 0.7);
  return {
    confidence: weightedAverage,
    allCoreAboveThreshold,
    reasons,
  };
}

function particlePenalty(aParticles: string[], bParticles: string[]): { penalty: number; reason: string } {
  const normalizeParticleKey = (parts: string[]) =>
    [...parts].sort().join("|").replace(/[-\s]/g, "");

  const aKey = normalizeParticleKey(aParticles);
  const bKey = normalizeParticleKey(bParticles);
  if (aKey === bKey) {
    return { penalty: 0, reason: "particles aligned" };
  }

  const aSet = new Set(aParticles);
  const bSet = new Set(bParticles);
  let missing = 0;
  for (const p of aSet) {
    if (!bSet.has(p)) missing += 1;
  }
  for (const p of bSet) {
    if (!aSet.has(p)) missing += 1;
  }
  const penalty = Math.min(0.2, missing * 0.06);
  return { penalty, reason: "particle mismatch reduced confidence" };
}

function chooseBestVariantComparison(aTokens: string[], bTokens: string[]): PositionalComparison {
  const aVariants = generateMergedVariants(aTokens, 2);
  const bVariants = generateMergedVariants(bTokens, 2);

  let best: PositionalComparison | null = null;
  for (const aVariant of aVariants) {
    for (const bVariant of bVariants) {
      if (aVariant.length !== bVariant.length) continue;
      const compared = comparePositionalTokens(aVariant, bVariant);
      if (!best || compared.confidence > best.confidence) {
        best = compared;
      }
    }
  }

  if (best) {
    return best;
  }

  const fallback = comparePositionalTokens(aTokens, bTokens);
  const lengthPenalty = Math.min(0.3, Math.abs(aTokens.length - bTokens.length) * 0.08);
  return {
    confidence: Math.max(0, fallback.confidence - lengthPenalty),
    allCoreAboveThreshold: false,
    reasons: [...fallback.reasons, "token count mismatch lowered confidence"],
  };
}

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

export function verifyCandidateAgainstTarget(candidate: string, target: string): VerifyResult {
  const parsedCandidate = parseName(candidate);
  const parsedTarget = parseName(target);

  if (!parsedTarget.normalizedFull) {
    return {
      match: false,
      confidence: 0,
      reason: "no target name available for verification",
    };
  }

  if (!parsedCandidate.normalizedFull) {
    return {
      match: false,
      confidence: 0,
      reason: "candidate name is empty after normalization",
    };
  }

  if (parsedCandidate.normalizedFull === parsedTarget.normalizedFull) {
    return {
      match: true,
      confidence: 1,
      reason: "normalized full strings are identical",
    };
  }

  if (Math.abs(parsedCandidate.nameTokens.length - parsedTarget.nameTokens.length) > 2) {
    return {
      match: false,
      confidence: 0.25,
      reason: "name token counts differ by more than 2",
    };
  }

  const positional = chooseBestVariantComparison(
    parsedCandidate.nameTokens,
    parsedTarget.nameTokens,
  );
  const particles = particlePenalty(parsedCandidate.particles, parsedTarget.particles);

  const finalConfidence = roundConfidence(positional.confidence - particles.penalty);
  const passesCore = positional.allCoreAboveThreshold;
  const match = passesCore && finalConfidence >= 0.75;

  const reasonBase = match
    ? "core token positions align with strong similarity"
    : passesCore
      ? "overall confidence below match threshold"
      : "one or more core name tokens scored <= 0.7";

  return {
    match,
    confidence: finalConfidence,
    reason: `${reasonBase}; ${particles.reason}.`,
  };
}

function isVowel(ch: string): boolean {
  return ["a", "e", "i", "o", "u", "y"].includes(ch);
}

// Lightweight Double Metaphone-style implementation (primary + alternate codes).
export function doubleMetaphone(input: string): { primary: string; alternate: string } {
  const value = normalizeInput(input).replace(/\s+/g, "");
  if (!value) return { primary: "", alternate: "" };

  let primary = "";
  let alternate = "";
  let i = 0;

  const push = (p: string, a = p) => {
    if (primary.length < 8) primary += p;
    if (alternate.length < 8) alternate += a;
  };

  while (i < value.length && (primary.length < 6 || alternate.length < 6)) {
    const c = value[i];
    const next = value[i + 1] ?? "";
    const prev = value[i - 1] ?? "";
    const next2 = value.slice(i, i + 2);
    const next3 = value.slice(i, i + 3);

    if (i === 0 && isVowel(c)) {
      push("A");
      i += 1;
      continue;
    }

    switch (c) {
      case "b":
        push("P");
        i += next === "b" ? 2 : 1;
        break;
      case "c":
        if (next2 === "ch") {
          push("X", "K");
          i += 2;
        } else if (["i", "e", "y"].includes(next)) {
          push("S");
          i += 2;
        } else {
          push("K");
          i += next === "c" ? 2 : 1;
        }
        break;
      case "d":
        if (next2 === "dg" && ["e", "i", "y"].includes(value[i + 2] ?? "")) {
          push("J");
          i += 3;
        } else {
          push("T");
          i += next === "d" ? 2 : 1;
        }
        break;
      case "f":
        push("F");
        i += next === "f" ? 2 : 1;
        break;
      case "g":
        if (next2 === "gh") {
          push("F");
          i += 2;
        } else if (next2 === "gn" || next3 === "gny") {
          push("N");
          i += 2;
        } else if (["e", "i", "y"].includes(next)) {
          push("J", "K");
          i += 2;
        } else {
          push("K");
          i += next === "g" ? 2 : 1;
        }
        break;
      case "h":
        if (isVowel(next) && !isVowel(prev)) {
          push("H");
        }
        i += 1;
        break;
      case "j":
        push("J");
        i += next === "j" ? 2 : 1;
        break;
      case "k":
        if (prev !== "c") push("K");
        i += next === "k" ? 2 : 1;
        break;
      case "l":
        push("L");
        i += next === "l" ? 2 : 1;
        break;
      case "m":
        push("M");
        i += next === "m" ? 2 : 1;
        break;
      case "n":
        push("N");
        i += next === "n" ? 2 : 1;
        break;
      case "p":
        if (next === "h") {
          push("F");
          i += 2;
        } else {
          push("P");
          i += next === "p" ? 2 : 1;
        }
        break;
      case "q":
        push("K");
        i += next === "q" ? 2 : 1;
        break;
      case "r":
        push("R");
        i += next === "r" ? 2 : 1;
        break;
      case "s":
        if (next2 === "sh") {
          push("X");
          i += 2;
        } else if (next3 === "sch") {
          push("SK");
          i += 3;
        } else if (next2 === "si" || next2 === "sy") {
          push("S", "X");
          i += 2;
        } else {
          push("S");
          i += next === "s" ? 2 : 1;
        }
        break;
      case "t":
        if (next2 === "th") {
          push("0", "T");
          i += 2;
        } else if (next3 === "tch") {
          i += 1;
        } else {
          push("T");
          i += next === "t" ? 2 : 1;
        }
        break;
      case "v":
        push("F");
        i += next === "v" ? 2 : 1;
        break;
      case "w":
      case "y":
        if (isVowel(next)) {
          push(c.toUpperCase());
        }
        i += 1;
        break;
      case "x":
        push("KS");
        i += 1;
        break;
      case "z":
        push("S");
        i += next === "z" ? 2 : 1;
        break;
      default:
        i += 1;
        break;
    }
  }

  return {
    primary: primary.slice(0, 6),
    alternate: alternate.slice(0, 6),
  };
}

export function jaroWinkler(aInput: string, bInput: string): number {
  const a = aInput;
  const b = bInput;
  if (a === b) return 1;
  if (!a || !b) return 0;

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) {
      k += 1;
    }
    if (a[i] !== b[k]) {
      transpositions += 1;
    }
    k += 1;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i += 1) {
    if (a[i] === b[i]) prefix += 1;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}
