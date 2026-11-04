"""Meta Model API client (OpenAI-compatible). Env-only config:
META_API_KEY, META_API_BASE_URL (default https://api.meta.ai/v1),
META_MODEL (default muse-spark-1.3). available() is False without a key;
every caller then uses a deterministic fallback and labels source='fallback'.
This client never fabricates output: failures raise, callers fall back."""
import base64, json, urllib.request
from . import config

def available():
    return bool(config.META_API_KEY and config.META_API_BASE_URL)

def _chat(messages, max_tokens=3000):
    url = config.META_API_BASE_URL.rstrip("/") + "/chat/completions"
    body = json.dumps({"model": config.META_MODEL, "messages": messages,
                       "max_tokens": max_tokens, "temperature": 0.2}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.META_API_KEY}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    choices = data.get("choices") or []
    if not choices: raise ValueError("Meta API response had no choices")
    content = (choices[0].get("message") or {}).get("content")
    if isinstance(content, str) and content.strip(): return content
    if isinstance(content, list):
        parts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
        if parts: return "".join(parts)
    raise ValueError("Meta API returned empty content")

def _extract_json(text):
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1: raise ValueError("no JSON object in model response")
    return json.loads(text[s:e + 1])

def tutor_walkthrough(problem, image_b64=None):
    """Socratic step-by-step walkthrough. Returns list of step strings."""
    if not available(): raise RuntimeError("Meta Model API not configured")
    content = [{"type": "text", "text": (
        "You are Munki, a Socratic study tutor. Walk the student through this "
        "problem step by step: ask a guiding question per step, reveal the "
        "reasoning gradually, and NEVER lead with the final answer. Respond "
        "with ONLY JSON: {\"steps\": [str, ...]} (4-7 steps).\n\nProblem: " + problem)}]
    if image_b64:
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}})
    parsed = _extract_json(_chat([{"role": "user", "content": content}]))
    steps = parsed.get("steps")
    if not steps: raise ValueError("model response missing steps")
    return [str(s) for s in steps]

def generate_cards(text):
    """Turn pasted notes into flashcards: [{front, back, topic}]."""
    if not available(): raise RuntimeError("Meta Model API not configured")
    prompt = ("Make decision-first flashcards from these study notes. Each card: "
              "front = a question asking which method/setup/verdict applies; "
              "back = the answer plus the trap to avoid. Respond with ONLY JSON: "
              "{\"cards\": [{\"front\": str, \"back\": str, \"topic\": str}]}\n\n" + text[:6000])
    parsed = _extract_json(_chat([{"role": "user", "content": prompt}]))
    cards = parsed.get("cards")
    if not cards: raise ValueError("model response missing cards")
    return [{"front": str(c["front"]), "back": str(c["back"]), "topic": str(c.get("topic", "General"))} for c in cards]

def generate_quiz_questions(cards, count):
    """Model-written MC questions from card content: [{front, options, correct_index, topic}]."""
    if not available(): raise RuntimeError("Meta Model API not configured")
    sample = [{"front": c["front"], "back": c["back"], "topic": c.get("topic", "General")} for c in cards[:20]]
    prompt = (f"Write {count} multiple-choice questions from these flashcards. Each: a question, "
              "4 options (1 correct, 3 plausible distractors), correct_index, topic. Respond with "
              "ONLY JSON: {\"questions\": [{\"front\": str, \"options\": [str x4], \"correct_index\": int, \"topic\": str}]}\n\n"
              + json.dumps(sample))
    parsed = _extract_json(_chat([{"role": "user", "content": prompt}]))
    qs = parsed.get("questions")
    if not qs: raise ValueError("model response missing questions")
    return qs
