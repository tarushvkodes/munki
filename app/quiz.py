"""Quiz generator: MC questions built from cards. Correct answer = the
card's back; distractors = backs of other cards (same topic preferred).
Deterministic given `seed`. Grading checks the chosen text against the
card's real back — distractor integrity by construction."""
import random

def build_questions(cards, count=5, topic=None, seed=0):
    pool = [c for c in cards if topic is None or c.get("topic") == topic]
    if not pool: pool = list(cards)
    rng = random.Random(seed)
    chosen = rng.sample(pool, min(count, len(pool)))
    questions = []
    for card in chosen:
        same_topic = [c for c in cards if c["id"] != card["id"] and c.get("topic") == card.get("topic")]
        others = [c for c in cards if c["id"] != card["id"] and c.get("topic") != card.get("topic")]
        rng.shuffle(same_topic); rng.shuffle(others)
        distractors = []
        for c in (same_topic + others):
            if c["back"] != card["back"] and c["back"] not in distractors:
                distractors.append(c["back"])
            if len(distractors) == 3: break
        options = distractors + [card["back"]]
        rng.shuffle(options)
        questions.append({"card_id": card["id"], "front": card["front"],
                          "topic": card.get("topic", "General"), "options": options,
                          "explanation": card["back"]})
    return questions

def grade(card, chosen_text):
    correct = (chosen_text or "").strip() == (card["back"] or "").strip()
    return {"correct": correct, "correct_answer": card["back"], "explanation": card["back"]}
