import re
from app.models.db import fetch_all


def _tokenize(text: str) -> set[str]:
    return {w for w in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(w) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def find_duplicate_reports(title: str, description: str, category: str, location: str) -> list[dict]:
    rows = fetch_all(
        "SELECT tracking_id, title, description, category, general_location, status FROM corruption_reports ORDER BY id DESC LIMIT 100"
    )
    tokens = _tokenize(f"{title} {description} {location}")
    matches = []
    for r in rows:
        score = _jaccard(tokens, _tokenize(f"{r['title']} {r['description']} {r['general_location']}"))
        if r["category"] == category:
            score += 0.15
        if score >= 0.42:
            matches.append(
                {
                    "reference_code": r["tracking_id"],
                    "title": r["title"],
                    "similarity_score": round(min(score, 0.99), 2),
                }
            )
    return sorted(matches, key=lambda x: x["similarity_score"], reverse=True)[:3]


def find_duplicate_complaints(title: str, description: str, category: str, location: str) -> list[dict]:
    rows = fetch_all(
        "SELECT complaint_code, title, description, category, location_text, status FROM complaints ORDER BY id DESC LIMIT 100"
    )
    tokens = _tokenize(f"{title} {description} {location}")
    matches = []
    for r in rows:
        score = _jaccard(tokens, _tokenize(f"{r['title']} {r['description']} {r['location_text']}"))
        if r["category"] == category:
            score += 0.15
        if score >= 0.42:
            matches.append(
                {
                    "reference_code": r["complaint_code"],
                    "title": r["title"],
                    "similarity_score": round(min(score, 0.99), 2),
                }
            )
    return sorted(matches, key=lambda x: x["similarity_score"], reverse=True)[:3]
