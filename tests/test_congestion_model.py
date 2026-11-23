"""Unit tests for Olpark Smart Flow public-data congestion & fee engine."""

from __future__ import annotations

import unittest

from engine.congestion_model import (
    TOTAL_PARK_CAPACITY,
    calculate_parking_fee,
    predict_hourly_occupancy,
    recommend_dispersion_strategy,
)


class TestOlparkSmartFlow(unittest.TestCase):
    def test_parking_fee_official_rules(self) -> None:
        # 10분 이내 출차 무료
        self.assertEqual(calculate_parking_fee(8)["final_fee"], 0)
        # 소형 180분(3시간) = 18 * 600 = 10,800원
        self.assertEqual(calculate_parking_fee(180, "small", False)["final_fee"], 10800)
        # 경차·저공해·다자녀 50% 감면 = 5,400원
        self.assertEqual(calculate_parking_fee(180, "small", True)["final_fee"], 5400)
        # 일일 최대 요금 상한 20,000원 검증 (8시간 = 480분 -> 28,800원이나 상한 20,000원 적용)
        self.assertEqual(calculate_parking_fee(480, "small", False)["final_fee"], 20000)

    def test_weather_and_multi_venue_surge(self) -> None:
        calm = predict_hourly_occupancy(["woori_art"], show_start_hour=18, weather="clear", day_type="weekday")
        storm_mega = predict_hourly_occupancy(
            ["kspo_dome", "handball", "olympic_hall"], show_start_hour=18, weather="rain_snow", day_type="saturday"
        )
        peak_calm = max(r["cars"] for r in calm)
        peak_storm = max(r["cars"] for r in storm_mega)
        self.assertGreater(peak_storm, peak_calm)
        self.assertLessEqual(peak_storm, TOTAL_PARK_CAPACITY)

    def test_late_night_gate_dispersion_advice(self) -> None:
        rec = recommend_dispersion_strategy(
            "kspo_dome", ["kspo_dome", "handball"], show_start_hour=19, weather="rain_snow", day_type="saturday"
        )
        self.assertGreaterEqual(rec["peak_occupancy_pct"], 80.0)
        self.assertIn("동2문", str(rec["recommended_gate"]))
        self.assertIn("22:30", str(rec["late_gate_notice"]))


if __name__ == "__main__":
    unittest.main()
