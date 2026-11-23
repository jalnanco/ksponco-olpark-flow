# 올팍 스마트 플로우 (Olpark Smart Flow)

**한국체육산업개발(주) 「2026년도 공공데이터 활용 경진대회」 출품작**  
공연 대관 · 기상청 방이동 단기예보 · 실시간 입출차 공공데이터를 융합한 **올림픽공원 방문객 혼잡도 예측 및 우회 주차·대중교통 환승 분산 안내 웹 서비스**

- **실작동 서비스 URL (2028년 이후까지 무중단 무료 정적 호스팅):** `https://jalnanco.github.io/ksponco-olpark-flow/`
- **라이선스:** MIT Open Source License

## 1. 활용 공공데이터 목록
1. `한국체육산업개발주식회사_올림픽공원 실시간 주차현황` (`ksponco.or.kr/pubData/64`, 실시간 오픈API `parkingorsApi.do`)
2. `한국체육산업개발(주)_올림픽공원 2025 차량입출차, 공연, 날씨정보 등 연계 데이터` (`data.go.kr/data/276130/linkedData.do` · `API_CPM_009`)
3. `한국체육산업개발주식회사_올림픽공원 대관정보` (`data.go.kr/data/15015212/openapi.do`)
4. `한국체육산업개발주식회사_올림픽공원 운영현황` (`data.go.kr/data/3074924/openapi.do`)
5. **[타 기관 공동활용]** `기상청_단기예보 조회서비스` (`data.go.kr/data/15084084`) · `서울교통공사 5·8·9호선 환승 출구 정보`

## 2. 로컬 실행 및 단위 테스트 검증
```bash
python3 -m unittest discover -s tests -v
python3 -m http.server 8080 --directory docs
```
