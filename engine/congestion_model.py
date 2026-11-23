"""올팍 스마트 플로우 (Olpark Smart Flow) — 공공데이터 융합 혼잡도 예측·주차 분산·요금 산출 코어 엔진.

한국체육산업개발(주) 개방 공공데이터 4종(실시간 주차현황, 2025 입출차·공연·날씨 연계데이터,
올림픽공원 대관정보, 올림픽공원 운영현황) 및 기상청 단기예보·도시철도 환승 지표를 결합한다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Sequence


@dataclass(frozen=True)
class VenueSpec:
    code: str
    name: str
    capacity: int
    nearest_lot: str
    alt_lot: str
    best_gate: str
    best_subway: str
    walk_min_from_alt: int
    walk_min_from_subway: int


VENUES: Dict[str, VenueSpec] = {
    "kspo_dome": VenueSpec(
        "kspo_dome", "KSPO DOME (체조경기장)", 15000, "P5", "P1", "동2문", "올림픽공원역 3·4번 출구 (5·9호선)", 9, 6
    ),
    "handball": VenueSpec(
        "handball", "핸드볼경기장 (티켓링크 라이브 아레나)", 5003, "P6", "P1", "동2문", "올림픽공원역 3번 출구 (5·9호선)", 8, 7
    ),
    "olympic_hall": VenueSpec(
        "olympic_hall", "올림픽홀", 2454, "P2", "P1", "동2문", "올림픽공원역 3번 출구 (5·9호선)", 6, 5
    ),
    "woori_art": VenueSpec(
        "woori_art", "우리금융아트홀", 1184, "P7", "P2", "남2문", "한성백제역 2번 출구 (9호선)", 7, 8
    ),
    "grass_88": VenueSpec(
        "grass_88", "88잔디마당 (야외 페스티벌)", 10000, "P2", "P1", "북2문", "몽촌토성역 1번 출구 (8호선)", 9, 9
    ),
}

PARKING_LOTS: Dict[str, Dict[str, object]] = {
    "P1": {"name": "P1 (K-아트홀·대형 여유구역)", "capacity": 614, "gate": "동2문", "24h_exit": True},
    "P2": {"name": "P2 (올림픽홀 지하·지상)", "capacity": 365, "gate": "동2문", "24h_exit": True},
    "P4": {"name": "P4 (올림픽수영장)", "capacity": 117, "gate": "북2문", "24h_exit": False},
    "P5": {"name": "P5 (KSPO DOME 인접)", "capacity": 181, "gate": "동2문", "24h_exit": True},
    "P6": {"name": "P6 (핸드볼경기장 인접)", "capacity": 167, "gate": "남2문", "24h_exit": False},
    "P7": {"name": "P7 (우리금융아트홀 인접)", "capacity": 137, "gate": "남2문", "24h_exit": False},
}

TOTAL_PARK_CAPACITY = 2600  # 한국체육산업개발 실시간 주차현황 API(동2·남2·북2 통합 관리 기준치)

WEATHER_FACTORS: Dict[str, float] = {
    "clear": 1.00,      # 맑음/쾌청
    "rain_snow": 1.24,  # 우천·강설 시 자가용 전환 탄력계수 (+24%)
    "extreme_temp": 1.14,  # 한파(영하 5도 이하)·폭염(33도 이상) (+14%)
}

DAY_BASE_LOAD: Dict[str, float] = {
    "weekday": 0.42,
    "saturday": 0.64,
    "sunday": 0.58,
}


def calculate_parking_fee(
    duration_minutes: int,
    vehicle_type: str = "small",
    discount_eligible: bool = False,
) -> Dict[str, int]:
    """한국체육산업개발(주) 올림픽공원 공식 요금표 기반 주차요금 계산.

    - 10분 이내 출차: 무료 (0원)
    - 소형: 10분당 600원, 일일 최대 20,000원
    - 대형(24인승/2.5톤 이상): 10분당 1,200원, 일일 최대 24,000원
    - 경차·저공해·장애인·국가유공자·다자녀(2자녀 이상): 최종 요금 50% 감면
    """
    if duration_minutes <= 10:
        return {"raw_fee": 0, "final_fee": 0, "saved": 0}

    units = math.ceil(duration_minutes / 10.0)
    if vehicle_type == "large":
        unit_price, daily_cap = 1200, 24000
    else:
        unit_price, daily_cap = 600, 20000

    raw_fee = min(daily_cap, units * unit_price)
    final_fee = raw_fee // 2 if discount_eligible else raw_fee
    return {"raw_fee": raw_fee, "final_fee": final_fee, "saved": raw_fee - final_fee}


def predict_hourly_occupancy(
    active_venues: Sequence[str],
    show_start_hour: int = 18,
    weather: str = "clear",
    day_type: str = "saturday",
    car_modal_share: float = 0.165,
) -> List[Dict[str, object]]:
    """06:00~24:00 시간대별 올림픽공원 전체 주차 점유율 및 출차 병목 지수 예측."""
    w_mult = WEATHER_FACTORS.get(weather, 1.0)
    base_ratio = DAY_BASE_LOAD.get(day_type, 0.55)
    total_visitors = sum(VENUES[v].capacity for v in active_venues if v in VENUES)
    event_cars_peak = total_visitors * car_modal_share * w_mult

    hourly: List[Dict[str, object]] = []
    show_end_hour = min(23, show_start_hour + 3)

    for hr in range(6, 25):
        # 공원 상시 생활체육·산책 기저 수요 곡선
        diurnal = math.exp(-((hr - 14.5) ** 2) / 26.0)
        base_cars = TOTAL_PARK_CAPACITY * base_ratio * (0.35 + 0.65 * diurnal)

        # 공연 관람객 입차 누적 및 종연 후 출차 파형
        if hr < show_start_hour - 4:
            ev_factor = 0.05
        elif hr <= show_start_hour:
            # 공연 3시간 전~시작 시각 가파른 입차 유입 (굿즈/MD 수령 + 본입장)
            ev_factor = math.exp(-((show_start_hour - hr) ** 2) / 3.2)
        elif hr <= show_end_hour:
            ev_factor = 1.0
        else:
            # 종연 직후 출차 (북2·남2문 22:30 이후 통제 시 심야 체류 지연 반영)
            late_gate_penalty = 1.35 if hr >= 22 else 1.0
            ev_factor = math.exp(-((hr - show_end_hour) ** 2) / (1.1 * late_gate_penalty))

        est_cars = int(round(min(TOTAL_PARK_CAPACITY, base_cars + event_cars_peak * ev_factor)))
        occ_pct = round(est_cars / TOTAL_PARK_CAPACITY * 100.0, 1)

        # 종연 직후 출차 대기 시간(분) 추정 (북2·남2문 야간 통제 반영)
        exit_wait_min = 4
        if hr in (show_end_hour, show_end_hour + 1) and event_cars_peak > 400:
            gate_bottleneck = 1.42 if show_end_hour >= 21 else 1.0
            exit_wait_min = int(min(65, round((event_cars_peak / 42.0) * gate_bottleneck)))

        level = "원활"
        if occ_pct >= 88:
            level = "만차위험"
        elif occ_pct >= 70:
            level = "혼잡"
        elif occ_pct >= 48:
            level = "보통"

        hourly.append(
            {
                "hour": hr,
                "label": f"{hr:02d}:00",
                "cars": est_cars,
                "occupancy_pct": occ_pct,
                "level": level,
                "exit_wait_min": exit_wait_min,
            }
        )
    return hourly


def recommend_dispersion_strategy(
    target_venue: str,
    active_venues: Sequence[str],
    show_start_hour: int = 18,
    weather: str = "clear",
    day_type: str = "saturday",
) -> Dict[str, object]:
    """목적지 공연장 기준 구역별 만차 위험 진단 및 최적 우회 주차/대중교통 환승 전략 도출."""
    v = VENUES.get(target_venue, VENUES["kspo_dome"])
    series = predict_hourly_occupancy(active_venues, show_start_hour, weather, day_type)
    peak_row = max(series, key=lambda r: float(r["occupancy_pct"]))  # type: ignore[arg-type]
    peak_pct = float(peak_row["occupancy_pct"])  # type: ignore[arg-type]
    max_exit_wait = max(int(r["exit_wait_min"]) for r in series)  # type: ignore[arg-type]

    late_night_warning = (show_start_hour + 3) >= 21
    recommend_transit = peak_pct >= 82.0

    return {
        "target_venue": v.name,
        "peak_occupancy_pct": peak_pct,
        "peak_hour": peak_row["label"],
        "nearest_lot": v.nearest_lot,
        "recommended_alt_lot": v.alt_lot,
        "recommended_gate": "동2문 (24시간 출차 전용)" if late_night_warning else v.best_gate,
        "recommended_subway": v.best_subway,
        "walk_min_from_alt": v.walk_min_from_alt,
        "walk_min_from_subway": v.walk_min_from_subway,
        "estimated_exit_wait_saved_min": max(8, int(round(max_exit_wait * 0.48))),
        "mode_recommendation": "대중교통(지하철 5·8·9호선) 강력 권장" if recommend_transit else f"{v.alt_lot} 여유구역 우회 주차 권장",
        "late_gate_notice": (
            "심야 종연(21시 이후) 시 북2문·남2문은 22:30 이후 통제될 수 있으므로 자차 이용 시 반드시 24시간 출차 가능한 동2문·P1/P2 구역을 이용하세요."
            if late_night_warning
            else "주간 종연 일정으로 동2문·남2문·북2문 전 게이트 정상 분산 출차가 가능합니다."
        ),
    }
