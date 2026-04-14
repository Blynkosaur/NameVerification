import nicknameTableJson from "@/lib/nicknameTable.json";

export type DeterministicTier =
  | "tier1_match"
  | "tier2_nickname_match"
  | "tier3_no_match"
  | "tier4_llm";

export type DeterministicAssessment = {
  tier: DeterministicTier;
  /** Jaro–Winkler similarity of full normalized strings (with spaces). */
  score: number;
  reason: string;
};

const PARTICLES = new Set(["al", "ibn", "bin", "el", "von", "de", "van", "del", "la", "le"]);
export const NICKNAME_TABLE = nicknameTableJson as Record<string, string[]>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

/** Tier 1: lowercase, strip accents (NFD), remove punctuation/hyphens/apostrophes, collapse whitespace. */
export function normalizeForVerify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitJoinedParticles(token: string): string[] {
  if (token.length < 3) return [token];
  for (const particle of PARTICLES) {
    if (token.startsWith(particle) && token !== particle) {
      const rest = token.slice(particle.length);
      if (rest.length >= 2) return [particle, rest];
    }
  }
  return [token];
}

/** Parsed tokens after normalization and particle-aware splitting (for overlap checks). */
export function parseNameTokens(name: string): string[] {
  const tokens = normalizeForVerify(name).split(" ").filter(Boolean);
  const expanded: string[] = [];
  for (const token of tokens) {
    expanded.push(...splitJoinedParticles(token));
  }
  return expanded;
}

function tokenSetsShareAny(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((t) => setB.has(t));
}

/** Same multiset of tokens but different left-to-right order (e.g. "Bryan Lin" vs "Lin Bryan"). */
function isStrictTokenOrderSwap(candTokens: string[], targTokens: string[]): boolean {
  if (candTokens.length !== targTokens.length || candTokens.length < 2) return false;
  const sortedCand = [...candTokens].sort();
  const sortedTarg = [...targTokens].sort();
  if (!sortedCand.every((t, i) => t === sortedTarg[i])) return false;
  return !candTokens.every((t, i) => t === targTokens[i]);
}

function tier1FormattingMatch(candidateNorm: string, targetNorm: string): boolean {
  if (candidateNorm === targetNorm) return true;
  const cCompact = candidateNorm.replace(/\s/g, "");
  const tCompact = targetNorm.replace(/\s/g, "");
  return cCompact.length > 0 && cCompact === tCompact;
}

function isNicknameTokenPair(aToken: string, bToken: string): boolean {
  if (aToken === bToken) return true;
  const aMatches = NICKNAME_TABLE[aToken]?.includes(bToken) ?? false;
  const bMatches = NICKNAME_TABLE[bToken]?.includes(aToken) ?? false;
  return aMatches || bMatches;
}

function allTokenPairsResolveWithNicknameTable(
  candTokens: string[],
  targTokens: string[],
): boolean {
  if (candTokens.length === 0 || targTokens.length === 0) return false;
  if (candTokens.length !== targTokens.length) return false;
  for (let i = 0; i < candTokens.length; i += 1) {
    if (!isNicknameTokenPair(candTokens[i] ?? "", targTokens[i] ?? "")) {
      return false;
    }
  }
  return true;
}

export function assessDeterministicTier(candidate: string, target: string): DeterministicAssessment {
  const normalizedCandidate = normalizeForVerify(candidate);
  const normalizedTarget = normalizeForVerify(target);

  if (!normalizedTarget) {
    return {
      tier: "tier3_no_match",
      score: 0,
      reason: "No target name has been generated yet.",
    };
  }
  if (!normalizedCandidate) {
    return {
      tier: "tier3_no_match",
      score: 0,
      reason: "Candidate name is empty after normalization.",
    };
  }

  const candTokens = parseNameTokens(candidate);
  const targTokens = parseNameTokens(target);
  if (tier1FormattingMatch(normalizedCandidate, normalizedTarget)) {
    return {
      tier: "tier1_match",
      score: 1,
      reason: "Names are identical after normalization.",
    };
  }

  if (allTokenPairsResolveWithNicknameTable(candTokens, targTokens)) {
    return {
      tier: "tier2_nickname_match",
      score: 0.95,
      reason: "Names match via nickname table token mapping.",
    };
  }

  const fullJw = jaroWinkler(normalizedCandidate, normalizedTarget);

  if (isStrictTokenOrderSwap(candTokens, targTokens)) {
    return {
      tier: "tier3_no_match",
      score: clamp01(fullJw),
      reason:
        "Name tokens match but order differs; not treated as the same identity.",
    };
  }

  const shareToken = tokenSetsShareAny(candTokens, targTokens);

  if (fullJw < 0.5 && !shareToken) {
    return {
      tier: "tier3_no_match",
      score: clamp01(fullJw),
      reason: "Names are too dissimilar.",
    };
  }

  return {
    tier: "tier4_llm",
    score: clamp01(fullJw),
    reason: "Requires model judgment.",
  };
}

/** Optional context for Tier 3 (deterministic signals only, no nickname table). */
export function verifierSignalsForLlm(candidate: string, target: string) {
  const nCand = normalizeForVerify(candidate);
  const nTarg = normalizeForVerify(target);
  const tokensCandidate = parseNameTokens(candidate);
  const tokensTarget = parseNameTokens(target);
  return {
    normalizedCandidate: nCand,
    normalizedTarget: nTarg,
    compactCandidate: nCand.replace(/\s/g, ""),
    compactTarget: nTarg.replace(/\s/g, ""),
    jaroWinklerFullString: clamp01(jaroWinkler(nCand, nTarg)),
    tokensCandidate,
    tokensTarget,
    doubleMetaphoneCandidate: tokensCandidate.map((t) => ({
      token: t,
      ...doubleMetaphone(t),
    })),
    doubleMetaphoneTarget: tokensTarget.map((t) => ({
      token: t,
      ...doubleMetaphone(t),
    })),
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
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  transpositions /= 2;
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i += 1) {
    if (a[i] !== b[i]) break;
    prefix += 1;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function isVowel(ch: string): boolean {
  return ["a", "e", "i", "o", "u", "y"].includes(ch);
}

/** Double Metaphone primary + alternate codes for a single token (ASCII). */
export function doubleMetaphone(input: string): { primary: string; alternate: string } {
  const value = normalizeForVerify(input).replace(/\s+/g, "");
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
