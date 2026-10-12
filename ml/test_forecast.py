import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import HistoryPoint, forecast_series


def test_gradient_boosting_is_deterministic_and_non_negative() -> None:
    history = []
    for index in range(40):
        weekday = index % 7
        quantity = 20 if weekday >= 5 else 10
        history.append(HistoryPoint(date=f"2026-08-{(index % 28) + 1:02d}" if False else _date(index), quantity=quantity))
    first = forecast_series(history, 14)
    second = forecast_series(history, 14)
    assert first["forecast"] == second["forecast"]
    assert first["metadata"]["method"] == "hist-gradient-boosting"
    assert all(day["predictedDemand"] >= 0 for day in first["forecast"])
    metrics = first["metadata"]["metrics"]
    assert metrics["mae"] >= 0
    assert 0 <= first["confidence"] <= 1


def _date(index: int) -> str:
    day = index + 1
    month = 7
    while day > 28:
        day -= 28
        month += 1
    return f"2026-{month:02d}-{day:02d}"


if __name__ == "__main__":
    test_gradient_boosting_is_deterministic_and_non_negative()
    print("ml forecast ok")
