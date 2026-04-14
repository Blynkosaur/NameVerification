import unicodedata
import re
from itertools import product

# ──────────────────────────────────────────
# Nickname table
# ──────────────────────────────────────────
NICKNAMES = {
    "bob": "robert", "bobby": "robert", "rob": "robert", "robby": "robert",
    "bill": "william", "billy": "william", "will": "william", "liam": "william", "willy": "william",
    "jim": "james", "jimmy": "james", "jamie": "james",
    "mike": "michael", "mikey": "michael",
    "dick": "richard", "rick": "richard", "rich": "richard", "ricky": "richard",
    "liz": "elizabeth", "beth": "elizabeth", "lizzy": "elizabeth", "eliza": "elizabeth",
    "joe": "joseph", "joey": "joseph",
    "tom": "thomas", "tommy": "thomas",
    "dan": "daniel", "danny": "daniel",
    "dave": "david", "davy": "david",
    "steve": "steven", "stevie": "steven",
    "chris": "christopher", "kit": "christopher",
    "matt": "matthew",
    "tony": "anthony",
    "sam": "samuel", "sammy": "samuel",
    "ben": "benjamin", "benny": "benjamin",
    "alex": "alexander", "al": "albert",
    "ed": "edward", "eddie": "edward", "ted": "edward", "teddy": "edward",
    "charlie": "charles", "chuck": "charles",
    "harry": "henry", "hank": "henry",
    "jack": "john", "johnny": "john", "jon": "john",
    "kate": "katherine", "katie": "katherine", "kathy": "katherine", "cathy": "catherine",
    "meg": "margaret", "maggie": "margaret", "peggy": "margaret",
    "jen": "jennifer", "jenny": "jennifer",
    "sue": "susan", "susie": "susan",
    "pat": "patrick", "patty": "patricia",
    "nick": "nicholas", "nicky": "nicholas",
    "greg": "gregory",
    "phil": "philip",
    "larry": "lawrence",
    "jerry": "gerald",
    "jeff": "jeffrey",
    "ray": "raymond",
    "ron": "ronald", "ronny": "ronald",
    "don": "donald", "donny": "donald",
    "ken": "kenneth", "kenny": "kenneth",
    "andy": "andrew", "drew": "andrew",
    "fred": "frederick", "freddy": "frederick",
    "walt": "walter",
    "art": "arthur",
    "leo": "leonard",
}


# ──────────────────────────────────────────
# Step 1: Normalize
# ──────────────────────────────────────────
def normalize(name: str) -> str:
    """Lowercase, strip accents, remove punctuation, collapse whitespace."""
    # lowercase
    name = name.lower()
    # strip accents via NFD decomposition
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    # remove punctuation (keep letters, digits, spaces)
    name = re.sub(r"[^a-z0-9\s]", "", name)
    # collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


# ──────────────────────────────────────────
# Step 2: Exact match
# ──────────────────────────────────────────
def exact_match(name1: str, name2: str) -> float | None:
    """Returns 100 if normalized strings are identical, None otherwise."""
    if name1 == name2:
        return 100.0
    return None


# ──────────────────────────────────────────
# Step 3: Token set comparison
# ──────────────────────────────────────────
def token_set_match(name1: str, name2: str) -> float | None:
    """Returns 95 if token sets are identical (handles reordering), None otherwise."""
    tokens1 = set(name1.split())
    tokens2 = set(name2.split())
    if tokens1 == tokens2:
        return 95.0
    return None


# ──────────────────────────────────────────
# Step 4: Nickname expansion
# ──────────────────────────────────────────
def canonicalize_token(token: str) -> str:
    """Map a token to its canonical name, or return it unchanged."""
    return NICKNAMES.get(token, token)


def nickname_match(name1: str, name2: str) -> float | None:
    """Returns 90 if token sets match after nickname expansion, None otherwise."""
    tokens1 = {canonicalize_token(t) for t in name1.split()}
    tokens2 = {canonicalize_token(t) for t in name2.split()}
    if tokens1 == tokens2:
        return 90.0
    return None


# ──────────────────────────────────────────
# Step 5: Subset check
# ──────────────────────────────────────────
def subset_match(name1: str, name2: str) -> float | None:
    """
    If one name's tokens are a subset of the other's (after nickname expansion),
    return a score of 75-80 depending on how much is covered.
    """
    tokens1 = {canonicalize_token(t) for t in name1.split()}
    tokens2 = {canonicalize_token(t) for t in name2.split()}

    if tokens1 == tokens2:
        return None  # already handled by earlier steps

    if tokens1.issubset(tokens2):
        coverage = len(tokens1) / len(tokens2)
        return 70 + (coverage * 10)  # ranges from ~73 to ~80
    elif tokens2.issubset(tokens1):
        coverage = len(tokens2) / len(tokens1)
        return 70 + (coverage * 10)
    return None


# ──────────────────────────────────────────
# Step 6: Fuzzy matching (Jaro-Winkler)
# ──────────────────────────────────────────
def jaro_similarity(s1: str, s2: str) -> float:
    """Compute Jaro similarity between two strings."""
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0

    match_window = max(len(s1), len(s2)) // 2 - 1
    match_window = max(match_window, 0)

    s1_matches = [False] * len(s1)
    s2_matches = [False] * len(s2)

    matches = 0
    transpositions = 0

    for i, c1 in enumerate(s1):
        start = max(0, i - match_window)
        end = min(i + match_window + 1, len(s2))
        for j in range(start, end):
            if s2_matches[j] or c1 != s2[j]:
                continue
            s1_matches[i] = True
            s2_matches[j] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    k = 0
    for i in range(len(s1)):
        if not s1_matches[i]:
            continue
        while not s2_matches[k]:
            k += 1
        if s1[i] != s2[k]:
            transpositions += 1
        k += 1

    jaro = (
        matches / len(s1)
        + matches / len(s2)
        + (matches - transpositions / 2) / matches
    ) / 3

    return jaro


def jaro_winkler(s1: str, s2: str, prefix_weight: float = 0.1) -> float:
    """Jaro-Winkler: boosts Jaro score when prefixes match."""
    jaro_score = jaro_similarity(s1, s2)

    # find common prefix (up to 4 chars)
    prefix_len = 0
    for i in range(min(len(s1), len(s2), 4)):
        if s1[i] == s2[i]:
            prefix_len += 1
        else:
            break

    return jaro_score + prefix_len * prefix_weight * (1 - jaro_score)


def fuzzy_match(name1: str, name2: str) -> float:
    """
    Compare tokens pairwise using Jaro-Winkler.
    Find the best token-to-token alignment and average the scores.
    """
    tokens1 = [canonicalize_token(t) for t in name1.split()]
    tokens2 = [canonicalize_token(t) for t in name2.split()]

    if not tokens1 or not tokens2:
        return 0.0

    # for each token in the shorter list, find its best match in the longer list
    if len(tokens1) > len(tokens2):
        tokens1, tokens2 = tokens2, tokens1

    used = set()
    total_score = 0.0

    for t1 in tokens1:
        best_score = 0.0
        best_idx = -1
        for idx, t2 in enumerate(tokens2):
            if idx in used:
                continue
            score = jaro_winkler(t1, t2)
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx >= 0:
            used.add(best_idx)
        total_score += best_score

    # penalize for unmatched tokens in the longer name
    unmatched = len(tokens2) - len(tokens1)
    avg_score = total_score / len(tokens1)

    # scale to 0-70 range (since steps above already cover 75+)
    penalty = unmatched * 0.05
    final = max(0, avg_score - penalty) * 70

    return final


# ──────────────────────────────────────────
# Step 7: Classify
# ──────────────────────────────────────────
def classify(score: float) -> str:
    """Bucket the score into a decision."""
    if score >= 85:
        return "APPROVED"
    elif score >= 50:
        return "MANUAL_REVIEW"
    else:
        return "REJECTED"


# ──────────────────────────────────────────
# Pipeline: run all steps in order
# ──────────────────────────────────────────
def verify_name(user_input: str, id_document: str) -> dict:
    """
    Run the full verification pipeline.
    Returns score, decision, and which step produced the result.
    """
    # Step 1: normalize both
    norm1 = normalize(user_input)
    norm2 = normalize(id_document)

    # Step 2: exact match
    score = exact_match(norm1, norm2)
    if score is not None:
        return {"score": score, "decision": classify(score), "matched_at": "exact_match"}

    # Step 3: token set match
    score = token_set_match(norm1, norm2)
    if score is not None:
        return {"score": score, "decision": classify(score), "matched_at": "token_set"}

    # Step 4: nickname expansion
    score = nickname_match(norm1, norm2)
    if score is not None:
        return {"score": score, "decision": classify(score), "matched_at": "nickname"}

    # Step 5: subset check
    score = subset_match(norm1, norm2)
    if score is not None:
        return {"score": score, "decision": classify(score), "matched_at": "subset"}

    # Step 6: fuzzy matching
    score = fuzzy_match(norm1, norm2)
    return {"score": round(score, 2), "decision": classify(score), "matched_at": "fuzzy"}


# ──────────────────────────────────────────
# Test it
# ──────────────────────────────────────────
if __name__ == "__main__":
    test_cases = [
        ("Robert Smith", "Robert Smith"),           # exact
        ("María García", "Maria Garcia"),            # accent stripping
        ("Smith, John", "John Smith"),               # reordering
        ("Bobby J. Smith", "Robert James Smith"),    # nickname + subset
        ("James O'Brien", "James Obrien"),           # punctuation
        ("John Smith", "John Michael Smith"),         # subset
        ("Jon Smyth", "John Smith"),                 # fuzzy
        ("Alice Johnson", "Bob Williams"),           # no match
    ]

    for user_input, id_doc in test_cases:
        result = verify_name(user_input, id_doc)
        print(f"{user_input:30s} vs {id_doc:30s} → "
              f"score={result['score']:5.1f}  {result['decision']:15s}  ({result['matched_at']})")
