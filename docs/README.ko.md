# Equal Earth

[![기본 구도로 렌더링한 Equal Earth 지도](../public/og-image.png)](https://smturtle2.github.io/equal-earth/)

<p align="center">
  <a href="https://smturtle2.github.io/equal-earth/"><strong>지도 열기</strong></a> ·
  <a href="../README.md">English</a> ·
  <a href="https://github.com/smturtle2/equal-earth/issues">문제 제보</a>
</p>

<p align="center">
  <a href="https://github.com/smturtle2/equal-earth/actions/workflows/pages.yml"><img src="https://github.com/smturtle2/equal-earth/actions/workflows/pages.yml/badge.svg" alt="빌드 및 배포 상태"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-EUPL--1.2-344c5c" alt="라이선스: EUPL-1.2"></a>
</p>

원하는 곳을 중심으로 볼 수 있는 인터랙티브 Equal Earth 지도입니다. 대륙의 상대적인 면적을 유지하며 세계를 자유롭게 회전할 수 있습니다.

## 주요 기능

- **자유로운 회전** — 드래그로 지도를 돌리고 기울이거나 비틀 수 있습니다.
- **동기화된 지구본** — 같은 방향을 평면 지도와 구형 화면으로 함께 봅니다.
- **세 가지 지도 스타일** — 8192 × 4096 해상도의 Natural Earth II, NASA Blue Marble, 국가별 색상의 아틀라스를 전환합니다.
- **국경과 지명** — 모든 지도 스타일에서 국경과 수평을 유지하는 국가·수도 이름을 함께 켜고 끕니다.
- **마우스·터치·키보드 지원** — 어느 화면에서든 회전하고 평면 지도만 따로 확대할 수 있습니다.

WebGPU를 사용할 수 있는 브라우저가 필요합니다.

브라우저 언어 설정에 따라 한국어 또는 영어를 자동으로 사용하며, 지원하지 않는 언어는 영어로 표시합니다.

## 조작

| 입력 | 동작 |
| --- | --- |
| 드래그 / 방향키 | 지도와 지구본 회전 |
| Shift + 드래그 / Q 또는 E 누르기 | 비틀기. Shift + Q/E는 더 빠르게 회전 |
| 휠 / 핀치 / + 또는 − | 평면 지도 확대·축소 |
| 두 손가락 제스처 | 회전·비틀기·확대 |
| 0 / Home / 더블 클릭 | 보기 초기화 |
| 지구본 레이어 버튼 | 위도·경도 격자와 현재 지구 텍스처 전환 |

왼쪽 아래에 핵심 조작법을 표시하며, 터치 기기에서는 터치 조작을 안내합니다.

위치 버튼은 클릭할 때만 브라우저 권한을 요청하며, 현재 확대 수준을 유지한 채 최단 대권 경로로 중심을 이동합니다. 지도나 지구본을 직접 조작하면 진행 중인 이동이 취소됩니다. 앱은 위치를 저장하지 않습니다.

오른쪽 위에 현재 지도 중심 좌표와 내 위치 버튼을 표시합니다. 좌표를 클릭하면 `위도, 경도` 한 필드에 입력하거나 붙여 넣을 수 있습니다. Enter 또는 이동을 누르면 현재 확대 수준을 유지한 채 같은 대권 경로로 이동하며, Escape 또는 취소를 누르면 작성 중인 값을 버립니다.

좌표 아래 프리셋 드롭다운에는 기본값과 아시아, 유럽, 아프리카, 북아메리카, 남아메리카, 오세아니아, 북극, 남극으로 이동하는 8개 지역 구도가 있습니다. 기본값은 현재 확대 수준을 유지하면서 시작할 때의 중심 좌표와 회전 방향을 복원합니다. 각 지역 항목도 현재 확대 수준을 유지하면서 대표 중심 좌표와 회전 방향을 함께 복원합니다. 북반구 대륙 프리셋은 북극이, 남반구 대륙 프리셋은 남극이 중심의 수직 위쪽에 놓입니다. 북극·남극 프리셋은 모두 경도 0° 경선을 12시 방향, 180° 경선을 6시 방향에 놓습니다. 중심은 최단 대권 경로를 따라 애니메이션으로 이동하며, 모션 감소 설정에서는 즉시 전환합니다. 지도나 지구본을 직접 조작하면 애니메이션이 중단됩니다.

프리셋 중심이 서로 정반대이면 목표 구도를 고려해 불필요한 비틀기가 없는 최단 경로를 선택합니다. 특정 경유지나 연속 회전 방향을 강제하지 않습니다. 버튼을 사용한 뒤에도 지도 단축키가 작동하며, 좌표 입력 중이거나 메뉴가 열려 있을 때는 해당 UI의 키 조작을 유지합니다.

지도 아래 드롭다운에서 텍스처를 선택합니다. 전환해도 현재 지도 방향은 유지됩니다.

텍스처 선택과 다운로드 사이의 레이어 버튼으로 국경·지명을 함께 켜고 끕니다. 모든 텍스처에 적용되며, 표시 설정을 직접 바꾸기 전에는 아틀라스 선택 시 켜집니다. 버튼으로 바꾼 설정은 텍스처를 전환해도 유지됩니다. 지명은 회전해도 수평을 유지하며, 서로 겹치지 않도록 작은 화면에서는 일부만 표시합니다. 지도가 충분히 커지면 수도도 나타납니다. 국경은 텍스처 지구본에도 표시하고, 지명은 큰 지도에만 표시합니다.

정치지도 색상, 육상 국경, 한국어·영어 지명은 Natural Earth 1:50m v5.1.2 자료를 사용합니다. 국가 색상은 MAPCOLOR9 속성을 따릅니다. 국경은 원본의 실효 지배 기준을 따르며, 분쟁·통제선·미확정 경계는 점선으로 구분합니다. 실시간 경계 자료가 아닌 일반화된 지도 자료입니다.

옆의 다운로드 버튼으로 긴 변이 4,096픽셀인 PNG를 저장합니다. 누른 순간의 회전·확대·텍스처·국경·지명·화면 비율을 유지하며, 투명 배경의 큰 지도만 담고 조작 UI와 작은 지구본은 제외합니다. 이미지는 브라우저에서 생성합니다.

정치지도 자료를 다시 만들려면 `uv run --script tools/build_political_assets.py`를 실행합니다. 의존성은 격리되며, 원본 주소와 원본·결과물 해시는 [표시 자료 출처](../public/layers/sources.json)에 기록합니다.

## 개발

Node.js 24 이상을 사용합니다.

```sh
npm ci
npm run dev
```

TypeScript, Vite, WebGPU, gl-matrix로 만들었습니다.

<details>
<summary>빌드와 테스트</summary>

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

빌드 결과는 `dist/`에 생성됩니다. `main`에 push하면 테스트 통과 후 GitHub Pages에 배포하고, PR에서는 검사만 실행합니다. [배포 워크플로](../.github/workflows/pages.yml)를 참고하세요.

</details>

## 출처와 라이선스

지구 이미지: [Natural Earth](https://www.naturalearthdata.com/), [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/). Blue Marble은 2004년 7월 합성 영상입니다.

코드와 문서: [EUPL-1.2](../LICENSE). 외부 자료에는 각각의 원래 이용 조건이 적용됩니다. [외부 자료 고지](THIRD_PARTY_NOTICES.md)와 [텍스처 출처](../public/textures/sources.json)를 참고하세요.
