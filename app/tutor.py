"""Whiteboard tutor: Meta path when configured, else labeled template
walkthroughs for known problem types + a generic Socratic scaffold."""
from . import meta_client

TEMPLATES = [
    (["series", "converge", "diverge", "test", "σ", "sum"], "Series-test selection", [
        "Step 1 — Look at the SHAPE first, not the numbers: factorials? (…)^n form? n in a rational expression? Alternating signs? Name the signature out loud.",
        "Step 2 — Run the cheap check: does a_n → 0? If not, stop — the divergence (term) test already answers it.",
        "Step 3 — Match signature to test: factorials → Ratio; (…)^n → Root; rational in n → Limit Comparison with a p-series; sin/cos bounds → Comparison; alternating → AST, then check absolute convergence separately.",
        "Step 4 — Compute the limit L for your chosen test and state the verdict rule BEFORE plugging in: L<1 converges, L>1 diverges, L=1 says nothing (pick another test).",
        "Step 5 — If it's alternating, finish the job: convergent via AST + divergent absolute value = CONDITIONALLY convergent. Which is it here?"]),
    (["taylor", "maclaurin", "radius", "interval of convergence", "power series"], "Taylor / power-series setup", [
        "Step 1 — Identify the center a and the function. Is this a known Maclaurin series you can adapt (e^x, sin, cos, 1/(1−x), ln(1+x)) instead of differentiating from scratch?",
        "Step 2 — If building it: coefficients are f^(k)(a)/k!. Compute derivatives at a in a table — look for the pattern before writing terms.",
        "Step 3 — For radius/interval: ratio test on |a_{n+1}/a_n| gives R. Remember: differentiation/integration never change R, but endpoints must be rechecked.",
        "Step 4 — Check each endpoint separately by substituting it in and testing the resulting numeric series. Open or closed — decide per endpoint.",
        "Step 5 — Estimating? Use the remainder: |R_n| ≤ next-term size for alternating series, or the Lagrange bound M|x−a|^{n+1}/(n+1)!. How accurate do you need to be?"]),
    (["momentum", "velocity", "collision", "impulse", "rocket", "tossed", "thrown"], "Momentum-principle setup", [
        "Step 1 — Choose the system and say it out loud. What's inside, what's outside? Only EXTERNAL forces change the system's momentum.",
        "Step 2 — What does the problem hand you: a TIME interval (→ momentum principle Δp = F_net·Δt) or a DISTANCE/height (→ energy principle)? The given decides the tool.",
        "Step 3 — Write p = mv (a VECTOR — components separately) and list F_net with signs. Gravity is <0, −mg, 0> if +y is up.",
        "Step 4 — Update in order: p_new = p + F_net·Δt, then v = p/m, then position if asked. Never update position with the old velocity after a momentum update.",
        "Step 5 — Sanity check direction and size: does the sign of Δp match the direction of F_net?"]),
    (["polar", "cardioid", "rose", "area enclosed"], "Polar area setup", [
        "Step 1 — Sketch or name the curve first: r = a cos θ is a circle, r = a(1−cos θ) a cardioid, r = a cos(nθ) a rose (n petals if n odd, 2n if even).",
        "Step 2 — Area is A = ∫ (1/2) r² dθ — the 1/2 is the #1 forgotten factor. Write it before anything else.",
        "Step 3 — Find the θ-limits from the picture/symmetry, not from x. Can you integrate half and double it?",
        "Step 4 — Square r carefully ((1−cos θ)² expands to 1 − 2cos θ + cos²θ) and power-reduce cos² with (1+cos 2θ)/2.",
        "Step 5 — Arc length instead? ds = √(r² + (dr/dθ)²) dθ. Which one is this problem actually asking for?"]),
    (["join", "sql", "select", "query", "database"], "SQL / join setup", [
        "Step 1 — Name the tables and the key that connects them (foreign key → primary key). No key, no join.",
        "Step 2 — Must rows with NO match survive? Yes → LEFT JOIN from the must-keep table. No → INNER JOIN.",
        "Step 3 — Aggregating? GROUP BY the category; row conditions go in WHERE (before grouping), group conditions in HAVING (after).",
        "Step 4 — Getting duplicates? A one-to-many join fans rows out — expected, or a sign the join key is wrong. Check before reaching for DISTINCT.",
        "Step 5 — Read your query back in plain English, clause by clause. Does it say what the question asked?"]),
]

GENERIC = [
    "Step 1 — Restate the problem in your own words: what's given, what's asked, what topic is this really from?",
    "Step 2 — Which principle, test, or setup fits — and what's the signal in the problem that tells you so?",
    "Step 3 — Write the governing formula/setup symbolically BEFORE substituting any numbers.",
    "Step 4 — Work one step, then pause: does the intermediate result make sense (sign, size, units)?",
    "Step 5 — Finish, then name the trap this problem was testing — that's the part worth a flashcard."]

def fallback_walkthrough(problem):
    text = (problem or "").lower()
    for keywords, kind, steps in TEMPLATES:
        if any(k in text for k in keywords):
            return {"source": "fallback", "kind": kind, "steps": steps}
    return {"source": "fallback", "kind": "Socratic scaffold", "steps": GENERIC}

def walkthrough(problem, image_b64=None):
    if meta_client.available():
        try:
            steps = meta_client.tutor_walkthrough(problem, image_b64)
            return {"source": "meta-api", "kind": "Meta tutor", "steps": steps}
        except Exception:
            pass
    return fallback_walkthrough(problem)
