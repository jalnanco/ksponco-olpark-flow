/* 올팍 스마트 플로우 (Olpark Smart Flow) — 클라이언트 예측·시각화·실시간 API 연동 스크립트 */
(() => {
  "use strict";

  const TOTAL_CAPACITY = 2600;

  const VENUES = {
    kspo_dome: {
      name: "KSPO DOME (체조경기장)",
      short: "KSPO DOME",
      cap: 15000,
      nearLot: "P5",
      altLot: "P1",
      gate: "동2문",
      subway: "올림픽공원역 3·4번 (5·9호선)",
      walkAlt: 9,
      walkSub: 6,
      x: 388,
      y: 220,
    },
    handball: {
      name: "핸드볼경기장",
      short: "핸드볼경기장",
      cap: 5003,
      nearLot: "P6",
      altLot: "P1",
      gate: "동2문",
      subway: "올림픽공원역 3번 (5·9호선)",
      walkAlt: 8,
      walkSub: 7,
      x: 328,
      y: 278,
    },
    olympic_hall: {
      name: "올림픽홀",
      short: "올림픽홀",
      cap: 2454,
      nearLot: "P2",
      altLot: "P1",
      gate: "동2문",
      subway: "올림픽공원역 3번 (5·9호선)",
      walkAlt: 6,
      walkSub: 5,
      x: 492,
      y: 196,
    },
    woori_art: {
      name: "우리금융아트홀",
      short: "우리금융아트홀",
      cap: 1184,
      nearLot: "P7",
      altLot: "P2",
      gate: "남2문",
      subway: "한성백제역 2번 (9호선)",
      walkAlt: 7,
      walkSub: 8,
      x: 222,
      y: 276,
    },
    grass_88: {
      name: "88잔디마당",
      short: "88잔디마당",
      cap: 10000,
      nearLot: "P2",
      altLot: "P1",
      gate: "북2문",
      subway: "몽촌토성역 1번 (8호선)",
      walkAlt: 9,
      walkSub: 9,
      x: 260,
      y: 178,
    },
  };

  const LOTS = {
    P1: { label: "P1 대형주차장", cap: 614, x: 534, y: 104, bias: 0.76 },
    P2: { label: "P2 올림픽홀", cap: 365, x: 550, y: 268, bias: 0.92 },
    P4: { label: "P4 수영장", cap: 117, x: 356, y: 92, bias: 0.82 },
    P5: { label: "P5 KSPO인접", cap: 181, x: 414, y: 146, bias: 1.22 },
    P6: { label: "P6 핸드볼인접", cap: 167, x: 426, y: 348, bias: 1.18 },
    P7: { label: "P7 아트홀인접", cap: 137, x: 220, y: 356, bias: 1.12 },
  };

  const GATES = [
    { name: "동2문 (24h 출차)", x: 598, y: 186, is24h: true },
    { name: "북2문 (~22:30)", x: 332, y: 38, is24h: false },
    { name: "남2문 (~22:30)", x: 332, y: 398, is24h: false },
  ];

  const SUBWAYS = [
    { name: "올림픽공원역 (5·9호선)", x: 576, y: 348 },
    { name: "몽촌토성역 (8호선)", x: 96, y: 190 },
    { name: "한성백제역 (9호선)", x: 100, y: 326 },
  ];

  const UPCOMING_SHOWS = [
    { date: "11.28 (토) 18:00", title: "연말 아레나 투어 서울 콘서트 + 핸드볼 단독공연", venues: "KSPO DOME · 핸드볼경기장", grade: "만차위험 94%", cls: "high" },
    { date: "11.29 (일) 17:00", title: "올림픽홀 라이브 투어 & 뮤지컬 마티네 중첩", venues: "올림픽홀 · 우리금융아트홀", grade: "혼잡 76%", cls: "mid" },
    { date: "12.05 (토) 18:00", title: "겨울 시즌 스페셜 아레나 단독 콘서트", venues: "KSPO DOME (15,000석)", grade: "만차위험 89%", cls: "high" },
  ];

  const WEATHER_MULT = { clear: 1.0, rain_snow: 1.24, extreme_temp: 1.14 };
  const DAY_BASE = { weekday: 0.42, saturday: 0.64, sunday: 0.58 };

  function calcFee(mins, discount) {
    if (mins <= 10) return { raw: 0, final: 0, saved: 0 };
    const raw = Math.min(20000, Math.ceil(mins / 10) * 600);
    const fin = discount ? Math.floor(raw / 2) : raw;
    return { raw, final: fin, saved: raw - fin };
  }

  function predictSeries(activeVenues, showHour, weather, dayType) {
    const wMult = WEATHER_MULT[weather] || 1.0;
    const baseRatio = DAY_BASE[dayType] || 0.58;
    const totalCap = activeVenues.reduce((s, k) => s + (VENUES[k] ? VENUES[k].cap : 0), 0);
    const peakEventCars = totalCap * 0.165 * wMult;
    const endHour = Math.min(23, showHour + 3);

    const rows = [];
    for (let hr = 6; hr <= 24; hr++) {
      const diurnal = Math.exp(-Math.pow(hr - 14.5, 2) / 26.0);
      const baseCars = TOTAL_CAPACITY * baseRatio * (0.35 + 0.65 * diurnal);
      let evFactor = 0.05;
      if (hr >= showHour - 4 && hr <= showHour) {
        evFactor = Math.exp(-Math.pow(showHour - hr, 2) / 3.2);
      } else if (hr > showHour && hr <= endHour) {
        evFactor = 1.0;
      } else if (hr > endHour) {
        const pen = hr >= 22 ? 1.35 : 1.0;
        evFactor = Math.exp(-Math.pow(hr - endHour, 2) / (1.1 * pen));
      }
      const cars = Math.round(Math.min(TOTAL_CAPACITY, baseCars + peakEventCars * evFactor));
      const pct = Math.round((cars / TOTAL_CAPACITY) * 1000) / 10;
      let wait = 4;
      if ((hr === endHour || hr === endHour + 1) && peakEventCars > 400) {
        wait = Math.min(65, Math.round((peakEventCars / 42) * (endHour >= 21 ? 1.42 : 1.0)));
      }
      rows.push({ hr, label: `${String(hr).padStart(2, "0")}:00`, cars, pct, wait });
    }
    return rows;
  }

  function getActiveVenues() {
    return Array.from(document.querySelectorAll("#active-venues-box input:checked")).map((el) => el.value);
  }

  function renderAll() {
    const targetKey = document.getElementById("target-venue").value;
    const active = getActiveVenues();
    const showHour = parseInt(document.getElementById("show-hour").value, 10);
    const dayType = document.getElementById("day-type").value;
    const weather = document.getElementById("weather-select").value;
    const stayMins = parseInt(document.getElementById("stay-mins").value, 10);
    const discount = document.getElementById("discount-flag").value === "1";

    // 1. Fee box
    const fee = calcFee(stayMins, discount);
    document.getElementById("fee-output").innerHTML = discount
      ? `예상 주차요금: <strong>${fee.final.toLocaleString()}원</strong> (정상가 ${fee.raw.toLocaleString()}원 대비 50% 감면)`
      : `예상 주차요금: <strong>${fee.final.toLocaleString()}원</strong> (소형 10분당 600원 · 일 상한 20,000원)`;

    // 2. Hourly forecast
    const series = predictSeries(active, showHour, weather, dayType);
    const peak = series.reduce((a, b) => (b.pct > a.pct ? b : a), series[0]);
    const maxWait = Math.max(...series.map((r) => r.wait));

    const badge = document.getElementById("peak-alert-badge");
    if (peak.pct >= 88) {
      badge.className = "alert-pill danger";
      badge.textContent = `피크 ${peak.label} · ${peak.pct}% (만차위험)`;
    } else if (peak.pct >= 70) {
      badge.className = "alert-pill warn";
      badge.textContent = `피크 ${peak.label} · ${peak.pct}% (혼잡)`;
    } else {
      badge.className = "alert-pill good";
      badge.textContent = `피크 ${peak.label} · ${peak.pct}% (원활·보통)`;
    }

    renderMap(targetKey, active, peak.pct);
    renderRouteCards(targetKey, peak.pct, maxWait, showHour);
    renderHourlyChart(series, showHour);
    renderGateWarning(showHour, maxWait);
  }

  function renderMap(targetKey, active, peakPct) {
    const tv = VENUES[targetKey];
    const altLot = LOTS[tv.altLot];
    const nearLot = LOTS[tv.nearLot];
    const subNode = SUBWAYS.find((s) => tv.subway.includes(s.name.split(" ")[0])) || SUBWAYS[0];

    const lotNodesHtml = Object.entries(LOTS)
      .map(([code, l]) => {
        let localPct = Math.min(100, Math.round(peakPct * l.bias));
        if (code === tv.nearLot && active.includes(targetKey)) localPct = Math.min(100, localPct + 9);
        const fill = localPct >= 90 ? "#e11d48" : localPct >= 72 ? "#d97706" : "#059669";
        const isRec = code === tv.altLot;
        return `
          <g>
            ${isRec ? `<circle cx="${l.x}" cy="${l.y}" r="28" fill="none" stroke="#059669" stroke-width="2.5" stroke-dasharray="4,3" />` : ""}
            <rect x="${l.x - 42}" y="${l.y - 18}" width="84" height="36" rx="8" fill="${fill}" stroke="#ffffff" stroke-width="2" />
            <text x="${l.x}" y="${l.y - 3}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800">${code} (${l.cap}면)</text>
            <text x="${l.x}" y="${l.y + 11}" text-anchor="middle" fill="#f8fafc" font-size="10" font-family="JetBrains Mono" font-weight="700">예측 ${localPct}%</text>
          </g>
        `;
      })
      .join("");

    const venueNodesHtml = Object.entries(VENUES)
      .map(([k, v]) => {
        const isTarget = k === targetKey;
        const isOn = active.includes(k);
        const bg = isTarget ? "#0284c7" : isOn ? "#334155" : "#94a3b8";
        const pillW = Math.max(66, v.short.length * 11 + 14);
        const labelY = v.y + (isTarget ? 29 : 25);
        return `
          <g>
            <circle cx="${v.x}" cy="${v.y}" r="${isTarget ? 18 : 14}" fill="${bg}" stroke="#ffffff" stroke-width="2.5" />
            <rect x="${(v.x - pillW / 2).toFixed(1)}" y="${labelY - 11}" width="${pillW}" height="16" rx="5" fill="rgba(255,255,255,0.92)" stroke="#cbd5e1" stroke-width="1" />
            <text x="${v.x}" y="${labelY + 1}" text-anchor="middle" fill="#0f172a" font-size="10.5" font-weight="800">${v.short}</text>
          </g>
        `;
      })
      .join("");

    const gatesHtml = GATES.map(
      (g) => `
      <g>
        <rect x="${g.x - 48}" y="${g.y - 12}" width="96" height="24" rx="12" fill="${g.is24h ? "#0f172a" : "#475569"}" />
        <text x="${g.x}" y="${g.y + 4}" text-anchor="middle" fill="#ffffff" font-size="10.5" font-weight="700">${g.name}</text>
      </g>`
    ).join("");

    const subwaysHtml = SUBWAYS.map(
      (s) => `
      <g>
        <rect x="${s.x - 62}" y="${s.y - 13}" width="124" height="26" rx="6" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5" />
        <text x="${s.x}" y="${s.y + 4}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700">🚇 ${s.name}</text>
      </g>`
    ).join("");

    document.getElementById("olpark-map").innerHTML = `
      <defs>
        <marker id="arrGreen" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
        </marker>
        <marker id="arrBlue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#0284c7" />
        </marker>
      </defs>

      <!-- 공원 녹지 경계 및 수변 -->
      <rect x="14" y="14" width="652" height="402" rx="22" fill="#dcefe6" stroke="#86efac" stroke-width="2" />
      <ellipse cx="192" cy="104" rx="66" ry="28" fill="#bae6fd" opacity="0.78" />
      <text x="192" y="108" text-anchor="middle" fill="#0369a1" font-size="10.5" font-weight="700">88호수 · 수변산책로</text>

      <!-- 내부 순환 도로망 -->
      <path d="M 332 50 L 534 104 L 550 268 L 426 348 L 220 356 L 160 250 Z" fill="none" stroke="#ffffff" stroke-width="9" stroke-linejoin="round" opacity="0.85" />

      <!-- 인접 만차 주의 점선 vs 우회 추천 실선 vs 지하철 도보 동선 -->
      <line x1="${nearLot.x}" y1="${nearLot.y}" x2="${tv.x}" y2="${tv.y}" stroke="#e11d48" stroke-width="2.5" stroke-dasharray="4,4" />
      <line x1="${altLot.x}" y1="${altLot.y}" x2="${tv.x}" y2="${tv.y}" stroke="#059669" stroke-width="3.5" marker-end="url(#arrGreen)" />
      <line x1="${subNode.x}" y1="${subNode.y}" x2="${tv.x}" y2="${tv.y}" stroke="#0284c7" stroke-width="3" stroke-dasharray="6,3" marker-end="url(#arrBlue)" />

      ${lotNodesHtml}
      ${venueNodesHtml}
      ${gatesHtml}
      ${subwaysHtml}
    `;
  }

  function renderRouteCards(targetKey, peakPct, maxWait, showHour) {
    const tv = VENUES[targetKey];
    const nearCap = LOTS[tv.nearLot].cap;
    const altCap = LOTS[tv.altLot].cap;
    const savedMin = Math.max(10, Math.round(maxWait * 0.48));
    const gateRec = showHour + 3 >= 21 ? "동2문 (24h 출차)" : tv.gate;

    document.getElementById("route-cards").innerHTML = `
      <div class="route-card avoid">
        <span class="route-badge">혼잡 회피 구역</span>
        <h4>${tv.nearLot} 인접 주차장 (${nearCap}면)</h4>
        <p>공연 90분 전 조기 만차 확률 매우 높음 · 종연 직후 출차 대기 약 <strong>${maxWait}분</strong> 예상</p>
      </div>
      <div class="route-card recommend-car">
        <span class="route-badge">자차 우회 추천</span>
        <h4>${gateRec} → ${tv.altLot} (${altCap}면)</h4>
        <p>대형 여유면 확보 · 공연장까지 도보 <strong>${tv.walkAlt}분</strong> · 종연 출차 대기 약 <strong>${savedMin}분 단축</strong></p>
      </div>
      <div class="route-card recommend-sub">
        <span class="route-badge">${peakPct >= 82 ? "최우선 강력 추천" : "대중교통 최적 출구"}</span>
        <h4>${tv.subway}</h4>
        <p>출구에서 ${tv.short}까지 도보 <strong>${tv.walkSub}분</strong> · 입출차 정체 0분 &amp; 탄소배출 저감</p>
      </div>
    `;
  }

  function renderHourlyChart(series, showHour) {
    const svg = document.getElementById("hourly-chart");
    const w = 420;
    const h = 185;
    const x0 = 40;
    const x1 = w - 20;
    const y0 = 26;
    const y1 = h - 28;

    const pts = series.map((r, i) => {
      const x = x0 + (i / (series.length - 1)) * (x1 - x0);
      const y = y1 - (r.pct / 100) * (y1 - y0);
      return { x, y, r };
    });

    const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${x0},${y1} ${poly} ${x1},${y1}`;
    const dangerY = y1 - 0.85 * (y1 - y0);

    const showPt = pts.find((p) => p.r.hr === showHour) || pts[10];
    const showLabelX = Math.min(x1 - 44, Math.max(x0 + 44, showPt.x));

    svg.innerHTML = `
      <line x1="${x0}" y1="${dangerY.toFixed(1)}" x2="${x1}" y2="${dangerY.toFixed(1)}" stroke="#f43f5e" stroke-dasharray="4,3" stroke-width="1.2" />
      <rect x="${x0 + 4}" y="${(dangerY - 15).toFixed(1)}" width="92" height="13" rx="3" fill="#0f172a" opacity="0.9" />
      <text x="${x0 + 8}" y="${(dangerY - 5).toFixed(1)}" text-anchor="start" fill="#fda4af" font-size="9.5" font-family="JetBrains Mono" font-weight="700">85% 만차임계선</text>

      <polygon points="${area}" fill="rgba(56, 189, 248, 0.18)" />
      <polyline points="${poly}" fill="none" stroke="#38bdf8" stroke-width="2.6" />

      <line x1="${showPt.x.toFixed(1)}" y1="${y0 - 4}" x2="${showPt.x.toFixed(1)}" y2="${y1}" stroke="#fbbf24" stroke-dasharray="3,3" />
      <rect x="${(showLabelX - 42).toFixed(1)}" y="4" width="84" height="15" rx="4" fill="#1e293b" stroke="#fbbf24" stroke-width="0.8" />
      <text x="${showLabelX.toFixed(1)}" y="14.5" text-anchor="middle" fill="#fde68a" font-size="9.2" font-weight="700">공연시작 ${showHour}:00</text>

      ${pts
        .filter((_, idx) => idx % 3 === 0 || idx === pts.length - 1)
        .map(
          (p) => `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.r.pct >= 85 ? "#fb7185" : "#38bdf8"}" />
          <text x="${p.x.toFixed(1)}" y="${h - 9}" text-anchor="middle" fill="#94a3b8" font-size="9.5" font-family="JetBrains Mono">${p.r.hr}시</text>
        `
        )
        .join("")}
      <text x="6" y="${y0 + 5}" fill="#94a3b8" font-size="9.5" font-family="JetBrains Mono">100%</text>
      <text x="12" y="${y1}" fill="#94a3b8" font-size="9.5" font-family="JetBrains Mono">0%</text>
    `;
  }

  function renderGateWarning(showHour, maxWait) {
    const box = document.getElementById("gate-warning-box");
    const endHr = showHour + 3;
    if (endHr >= 21) {
      box.innerHTML = `
        <span class="gate-title">⚠️ 심야 종연(${endHr}:00 예상) 게이트 통제 &amp; 출차 병목 주의</span>
        올림픽공원 운영 규정상 북2문·남2문은 심야(22:30 이후) 출차가 통제될 수 있어 종연 차량이 동2문으로 집중됩니다(최대 대기 약 ${maxWait}분). 자차 이용 시 사전무인정산 후 <b>동2문 직결 P1·P2 구역을 이용</b>하세요.
      `;
    } else {
      box.innerHTML = `
        <span class="gate-title">✅ 주간 종연(${endHr}:00 예상) 전 게이트 분산 출차 가능</span>
        동2문·남2문·북2문 모두 정상 운영 시간대이므로 안내된 우회 주차구역 이용 시 10분 이내 쾌적한 출차가 가능합니다.
      `;
    }
  }

  function renderScheduleList() {
    document.getElementById("schedule-list").innerHTML = UPCOMING_SHOWS.map(
      (s) => `
      <div class="sched-item">
        <div class="sched-info">
          <strong>${s.date} · ${s.title}</strong>
          <span>${s.venues}</span>
        </div>
        <span class="sched-tag ${s.cls}">${s.grade}</span>
      </div>`
    ).join("");
  }

  function downloadICS() {
    const targetKey = document.getElementById("target-venue").value;
    const tv = VENUES[targetKey];
    const showHour = parseInt(document.getElementById("show-hour").value, 10);
    const recHour = Math.max(6, showHour - 2);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Olpark Smart Flow//KSPONCO Contest//KO",
      "BEGIN:VEVENT",
      "SUMMARY:[올팍 스마트 플로우] 올림픽공원 혼잡 회피 도착 알림 (" + tv.short + ")",
      "DTSTART:20261205T" + String(recHour).padStart(2, "0") + "0000",
      "DTEND:20261205T" + String(showHour).padStart(2, "0") + "0000",
      "LOCATION:서울특별시 송파구 올림픽로 424 올림픽공원 (" + tv.altLot + " 또는 " + tv.subway + ")",
      "DESCRIPTION:인접 소규모 주차장 조기 만차 대비 " + tv.altLot + " 우회 입차 또는 " + tv.subway + " 이용 권장.",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "olpark_smart_flow_alert.ics";
    a.click();
  }

  async function tryFetchLiveParkingApi() {
    try {
      const resp = await fetch("https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=PARKING21803504");
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data) && data[0] && typeof data[0].parking_sum === "number") {
        const cnt = data[0].parking_sum;
        const pct = ((cnt / TOTAL_CAPACITY) * 100).toFixed(1);
        document.getElementById("live-api-pill").textContent = `실시간 주차 API 라이브 · ${cnt.toLocaleString()} / 2,600면 (${pct}%)`;
      }
    } catch (_) {
      // 브라우저 CORS 제한 시 검증된 최신 실측 스냅샷 유지
    }
  }

  function applyPreset(kind) {
    const checks = document.querySelectorAll("#active-venues-box input");
    if (kind === "mega") {
      document.getElementById("target-venue").value = "kspo_dome";
      checks.forEach((c) => (c.checked = c.value === "kspo_dome" || c.value === "handball"));
      document.getElementById("show-hour").value = "18";
      document.getElementById("day-type").value = "saturday";
      document.getElementById("weather-select").value = "rain_snow";
    } else if (kind === "festival") {
      document.getElementById("target-venue").value = "grass_88";
      checks.forEach((c) => (c.checked = c.value === "grass_88" || c.value === "olympic_hall"));
      document.getElementById("show-hour").value = "14";
      document.getElementById("day-type").value = "sunday";
      document.getElementById("weather-select").value = "clear";
    } else {
      document.getElementById("target-venue").value = "woori_art";
      checks.forEach((c) => (c.checked = c.value === "woori_art"));
      document.getElementById("show-hour").value = "19";
      document.getElementById("day-type").value = "weekday";
      document.getElementById("weather-select").value = "clear";
    }
    renderAll();
  }

  // Bind listeners
  ["target-venue", "show-hour", "day-type", "weather-select", "stay-mins", "discount-flag"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAll);
  });
  document.querySelectorAll("#active-venues-box input").forEach((el) => {
    el.addEventListener("change", renderAll);
  });
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.toggle("active", b === btn));
      applyPreset(btn.dataset.preset);
    });
  });
  document.getElementById("download-ics-btn").addEventListener("click", downloadICS);

  renderScheduleList();
  renderAll();
  tryFetchLiveParkingApi();
})();
