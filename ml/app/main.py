"""Per-series demand model for Invorra.

Each product-warehouse history is trained separately. The production model is an
fixed-weight ensemble of two histogram gradient boosters: one on raw demand and
one on log demand, so spikes do not dominate weekday patterns. Features cover
lags, rolling level and spread, same-weekday lags, calendar cycles, and a
stockout flag when a day is zero after recent sales.

Accuracy is measured on the last 7 days before the ensemble is refit for the
forward forecast. Intervals use the holdout residual spread. Forward days are
damped toward the recent level so recursive error does not run away.

This is not a global model trained on other tenants, and it does not use price
or promotions.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from math import cos, pi, sin, sqrt
from statistics import mean, pstdev

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import HistGradientBoostingRegressor

MODEL_NAME = "gbm-demand-v2"
HOLDOUT_DAYS = 7
MIN_SUPERVISED = 21
FEATURE_NAMES = (
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_21",
    "roll_mean_7",
    "roll_mean_14",
    "roll_mean_28",
    "roll_std_7",
    "same_dow_lag",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    "trend",
    "zero_after_demand",
)

app = FastAPI(title="Invorra Forecast", version="1.0.0")


class HistoryPoint(BaseModel):
    date: str
    quantity: float = Field(ge=0)


class ForecastRequest(BaseModel):
    product_id: str | None = None
    warehouse_id: str | None = None
    history: list[HistoryPoint]
    horizon_days: int = Field(default=14, ge=1, le=60)


class SeriesRequest(BaseModel):
    id: str
    history: list[HistoryPoint]
    horizon_days: int = Field(default=14, ge=1, le=60)


class BatchRequest(BaseModel):
    series: list[SeriesRequest] = Field(max_length=500)


def _parse_dates(history: list[HistoryPoint]) -> tuple[list[datetime], list[float]]:
    ordered = sorted(history, key=lambda point: point.date)
    dates = [datetime.strptime(point.date, "%Y-%m-%d") for point in ordered]
    quantities = [float(point.quantity) for point in ordered]
    return dates, quantities


def _same_weekday(quantities: list[float], index: int) -> float:
    samples = [quantities[cursor] for cursor in range(index - 7, 0, -7)]
    if not samples:
        return quantities[index - 1]
    return float(mean(samples[:4]))


def _features(quantities: list[float], index: int, when: datetime) -> list[float]:
    window7 = quantities[max(0, index - 7) : index]
    window14 = quantities[max(0, index - 14) : index]
    window28 = quantities[max(0, index - 28) : index]
    recent = quantities[max(0, index - 7) : index]
    zero_after_demand = 1.0 if quantities[index - 1] == 0 and any(value > 0 for value in recent) else 0.0
    month = when.month
    return [
        quantities[index - 1],
        quantities[index - 7] if index >= 7 else quantities[0],
        quantities[index - 14] if index >= 14 else quantities[0],
        quantities[index - 21] if index >= 21 else quantities[0],
        float(mean(window7)) if window7 else 0.0,
        float(mean(window14)) if window14 else 0.0,
        float(mean(window28)) if window28 else 0.0,
        float(pstdev(window7)) if len(window7) > 1 else 0.0,
        _same_weekday(quantities, index),
        sin(2 * pi * when.weekday() / 7),
        cos(2 * pi * when.weekday() / 7),
        sin(2 * pi * month / 12),
        cos(2 * pi * month / 12),
        float(index),
        zero_after_demand,
    ]


def _supervised(dates: list[datetime], quantities: list[float]) -> tuple[np.ndarray, np.ndarray]:
    rows: list[list[float]] = []
    targets: list[float] = []
    for index in range(14, len(quantities)):
        rows.append(_features(quantities, index, dates[index]))
        targets.append(quantities[index])
    if not rows:
        return np.empty((0, len(FEATURE_NAMES))), np.empty((0,))
    return np.array(rows, dtype=float), np.array(targets, dtype=float)


def _estimator(seed: int) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="squared_error",
        learning_rate=0.06,
        max_iter=220,
        max_depth=5,
        min_samples_leaf=4,
        l2_regularization=0.15,
        random_state=seed,
    )


class DemandEnsemble:
    """Level model plus a log-demand model. Weights are fixed so scores stay reproducible."""

    def __init__(self) -> None:
        self.level = _estimator(42)
        self.log_model = _estimator(7)

    def fit(self, features: np.ndarray, targets: np.ndarray) -> None:
        self.level.fit(features, targets)
        self.log_model.fit(features, np.log1p(np.maximum(targets, 0.0)))

    def predict(self, features: np.ndarray) -> np.ndarray:
        level = np.maximum(0.0, self.level.predict(features))
        logged = np.expm1(self.log_model.predict(features))
        logged = np.maximum(0.0, logged)
        return 0.55 * level + 0.45 * logged


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float | None]:
    errors = predicted - actual
    mae = float(np.mean(np.abs(errors)))
    rmse = float(sqrt(float(np.mean(errors**2))))
    positives = actual > 0
    mape = None
    if np.any(positives):
        mape = float(np.mean(np.abs(errors[positives] / actual[positives])))
    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": None if mape is None else round(mape, 4),
        "bias": round(float(np.mean(errors)), 3),
        "holdoutDays": int(len(actual)),
    }


def _confidence(sample_size: int, mape: float | None) -> float:
    if sample_size <= 0:
        return 0.0
    coverage = min(1.0, sample_size / 28)
    accuracy = 0.0 if mape is None else max(0.0, 1.0 - min(mape, 1.5) / 1.5)
    return round(min(0.97, 0.2 * coverage + 0.8 * (0.35 * coverage + 0.65 * accuracy)), 4)


def _seasonal_naive(dates: list[datetime], quantities: list[float], horizon: int) -> dict[str, object]:
    start = dates[-1] if dates else datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    deviation = float(pstdev(quantities)) if len(quantities) > 1 else 0.0
    days = []
    for offset in range(1, horizon + 1):
        day = start + timedelta(days=offset)
        source = quantities[-7 + ((offset - 1) % 7)] if len(quantities) >= 7 else (quantities[-1] if quantities else 0.0)
        predicted = max(0.0, float(source))
        days.append(
            {
                "date": day.date().isoformat(),
                "predictedDemand": round(predicted, 2),
                "lowerBound": round(max(0.0, predicted - deviation), 2),
                "upperBound": round(predicted + deviation, 2),
            }
        )
    return {
        "forecast": days,
        "confidence": _confidence(len(quantities), None),
        "metadata": {
            "model": MODEL_NAME,
            "method": "seasonal-naive",
            "reason": "Fewer than 21 supervised days, so gradient boosting was not fit.",
            "historyPoints": len(quantities),
            "metrics": None,
        },
    }


def forecast_series(history: list[HistoryPoint], horizon: int) -> dict[str, object]:
    dates, quantities = _parse_dates(history)
    features, targets = _supervised(dates, quantities)
    if len(targets) < MIN_SUPERVISED:
        return _seasonal_naive(dates, quantities, horizon)

    holdout = min(HOLDOUT_DAYS, max(1, len(targets) // 5))
    train_x, test_x = features[:-holdout], features[-holdout:]
    train_y, test_y = targets[:-holdout], targets[-holdout:]
    probe = DemandEnsemble()
    probe.fit(train_x, train_y)
    holdout_pred = probe.predict(test_x)
    metrics = _metrics(test_y, holdout_pred)
    residual = float(pstdev((test_y - holdout_pred).tolist())) if len(test_y) > 1 else 0.0

    model = DemandEnsemble()
    model.fit(features, targets)
    history_qty = list(quantities)
    history_dates = list(dates)
    recent_level = float(mean(quantities[-7:])) if quantities else 0.0
    days = []
    for step in range(horizon):
        next_date = history_dates[-1] + timedelta(days=1)
        row = np.array([_features(history_qty, len(history_qty), next_date)], dtype=float)
        raw = float(model.predict(row)[0])
        # Pull later horizon days toward the last observed week so recursion stays bounded.
        weight = 0.85 ** step
        predicted = max(0.0, weight * raw + (1 - weight) * recent_level)
        days.append(
            {
                "date": next_date.date().isoformat(),
                "predictedDemand": round(predicted, 2),
                "lowerBound": round(max(0.0, predicted - residual), 2),
                "upperBound": round(predicted + residual, 2),
            }
        )
        history_qty.append(predicted)
        history_dates.append(next_date)

    mape = metrics["mape"]
    censored = int(sum(1 for value in quantities if value == 0))
    return {
        "forecast": days,
        "confidence": _confidence(len(quantities), float(mape) if isinstance(mape, float) else None),
        "metadata": {
            "model": MODEL_NAME,
            "method": "hist-gradient-boosting",
            "ensemble": "0.55 level + 0.45 log-demand",
            "features": list(FEATURE_NAMES),
            "historyPoints": len(quantities),
            "supervisedRows": int(len(targets)),
            "zeroDays": censored,
            "metrics": metrics,
            "interval": "Holdout residual standard deviation around each daily prediction.",
            "limitation": "Zero-sales days are flagged, not reconstructed as lost demand. No price or promotion features. Fit only on this series.",
        },
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME}


@app.get("/model")
def model_card() -> dict[str, object]:
    return {
        "name": MODEL_NAME,
        "algorithm": "Histogram gradient boosting ensemble",
        "features": list(FEATURE_NAMES),
        "holdoutDays": HOLDOUT_DAYS,
        "minimumHistoryDays": 14 + MIN_SUPERVISED,
        "deterministic": True,
        "randomState": 42,
        "limitations": [
            "Trained per product and warehouse, not across tenants.",
            "Zero days are flagged as possible stockouts but lost sales are not imputed.",
            "Does not observe price or promotions.",
            "Later horizon days are damped toward the recent weekly level.",
        ],
    }


@app.post("/forecast")
def forecast(body: ForecastRequest) -> dict[str, object]:
    return forecast_series(body.history, body.horizon_days)


@app.post("/forecast/batch")
def forecast_batch(body: BatchRequest) -> dict[str, object]:
    results = []
    for series in body.series:
        projected = forecast_series(series.history, series.horizon_days)
        results.append({"id": series.id, **projected})
    return {"model": MODEL_NAME, "results": results}
