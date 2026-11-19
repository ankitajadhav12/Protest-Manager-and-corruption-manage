from app.services.geocode_service import generalize_coordinate, validate_coordinates
from app.services.duplicate_service import _jaccard, _tokenize


def test_coordinate_validation_india_bounds():
    assert validate_coordinates(18.5204, 73.8567) == (18.5204, 73.8567)
    assert validate_coordinates(95.0, 73.8567) is None
    assert validate_coordinates("invalid", 73.85) is None


def test_generalize_coordinate_privacy():
    assert generalize_coordinate(18.524891) == 18.52
    assert generalize_coordinate(73.856712) == 73.86


def test_duplicate_similarity_detection():
    a = _tokenize("Deep pothole cluster near Nal Stop Metro Pillar Pune")
    b = _tokenize("Pothole cluster near Nal Stop Metro in Pune")
    assert _jaccard(a, b) > 0.4
