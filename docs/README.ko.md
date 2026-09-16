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
- **세 가지 지도 스타일** — 8192 × 4096 해상도의 Natural Earth II, NASA Blue Marble, 국가별 색상의 Atlas를 전환합니다.
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

마우스·터치·키보드로 조작할 수 있습니다.

- **위치·좌표:** 내 위치를 사용하거나 `위도, 경도`를 입력합니다. 위치 권한은 버튼을 누를 때만 요청하며, 위치를 저장하지 않습니다.
- **프리셋:** 기본값·대륙·극지방으로 이동합니다. 남반구 프리셋은 남극을 위쪽에 놓으며, 전환 시 확대 수준은 유지합니다.
- **국경·지명:** 국경과 국가·수도 이름을 함께 켜고 끕니다. 지명은 수평을 유지하며, 확대하면 수도도 표시됩니다.
- **PNG 저장:** 현재 지도를 국경·지명과 함께 투명 배경 4K로 저장합니다. 조작 버튼과 작은 지구본은 제외합니다.

지도 자료 재생성: `uv run --script tools/build_political_assets.py`. [자료 출처](../public/layers/sources.json)를 참고하세요.

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
