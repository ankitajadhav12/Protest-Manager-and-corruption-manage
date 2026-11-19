import time
import requests
from flask import current_app

_last_request_ts = 0.0
_cache: dict[str, list[dict]] = {}


def validate_coordinates(lat, lng) -> tuple[float, float] | None:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if not (6.0 <= lat_f <= 38.0 and 67.0 <= lng_f <= 98.0):
        return None
    return round(lat_f, 6), round(lng_f, 6)


def generalize_coordinate(coord: float) -> float:
    """Round sensitive report coordinates to ~1.1km grid to protect whistleblower locations."""
    return round(float(coord), 2)


def geocode_india(query: str) -> list[dict]:
    global _last_request_ts
    key = query.strip().lower()
    if key in _cache:
        return _cache[key]

    elapsed = time.time() - _last_request_ts
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    _last_request_ts = time.time()

    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "jsonv2", "addressdetails": 1, "countrycodes": "in", "limit": 5},
        headers={"User-Agent": current_app.config["NOMINATIM_USER_AGENT"]},
        timeout=5,
    )
    resp.raise_for_status()
    results = [
        {
            "display_name": item["display_name"],
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
        }
        for item in resp.json()
    ]
    _cache[key] = results
    return results
