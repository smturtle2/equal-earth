# Equal Earth

[지도 열기](https://smturtle2.github.io/equal-earth/) · [English](../README.md)

![Equal Earth 지도](../public/og-image.png)

세계를 돌려 원하는 곳을 중심으로 보는 지도입니다. 지도와 지구본이 함께 움직이며, WebGPU 지원 브라우저가 필요합니다.

- **조작:** 드래그로 회전, 휠로 확대, Q/E로 비틀기, 더블 클릭으로 초기화.
- **중심 이동:** 프리셋 선택, 좌표 입력, 내 위치로 이동.
- **표시·저장:** 텍스처 전환, 국경·지명 표시, 투명 배경 4K PNG 저장.

## 개발

Node.js 24 이상.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`main`에 푸시하면 검사 통과 후 GitHub Pages에 배포됩니다.

## 라이선스

[EUPL-1.2](../LICENSE). 지도 이미지·자료: Natural Earth, NASA. [외부 자료 고지](THIRD_PARTY_NOTICES.md)를 참고하세요.
