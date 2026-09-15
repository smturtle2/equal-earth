# Equal Earth

흰 페이지에 자유롭게 회전할 수 있는 Equal Earth 지도를 표시합니다. 렌더러는 WebGPU만 사용합니다.

**[지도 열기](https://smturtle2.github.io/equal-earth/)**

화면 아래 드롭다운에서 **Natural Earth II**와 **NASA Blue Marble**을 전환합니다. 기본값은 Natural Earth II입니다. 텍스처를 바꿔도 자세와 확대율을 유지하고, 새 이미지가 준비될 때까지 이전 지도를 표시합니다. 빠르게 선택을 바꾸면 이전 요청을 취소하며, 로딩 실패 시 이전 선택으로 돌아갑니다.

우측 하단 지구본은 지도와 회전·기울기·롤을 공유합니다. 어느 쪽을 드래그해도 두 화면에 함께 반영됩니다. 지구본 우측 상단 레이어 버튼을 한 번 누를 때마다 기본 **위도·경도** 표시와 **지도와 동일** 모드를 전환합니다. 후자는 현재 지도 텍스처를 계속 따라갑니다. 지구본의 표시 크기는 고정이고 확대·축소는 평면 지도에서만 적용됩니다.

## 로컬 실행

Node.js 22.12 이상 또는 24 이상을 사용합니다.

```sh
npm ci
npm run dev
```

터미널에 표시되는 로컬 주소를 WebGPU 지원 브라우저에서 엽니다. WebGPU 장치를 사용할 수 없는 환경에는 안내만 표시하며, 대체 렌더러는 없습니다.

## 조작

| 입력 | 동작 |
|---|---|
| 화면 아래 텍스처 드롭다운 | Natural Earth II / NASA Blue Marble 전환 |
| 지구본 우측 상단 레이어 버튼 | 한 번 클릭으로 위도·경도 / 지도와 동일 전환 |
| 드래그 | 자유 회전. 놓으면 남은 목표 차이만 짧게 정착 |
| Q / E (누르고 있기) | 초당 60° 연속 롤 |
| Shift + Q / E | 롤 속도 2.5배 |
| 지도 위 휠 / 핀치 / +·− | 평면 지도 확대·축소 |
| 두 손가락 | 이동·비틀기·확대 |
| 방향키 | 회전 |
| 0 / Home / 더블 클릭 | 자세·확대 초기화. 텍스처 선택 유지 |

Q/E 롤은 약 100ms의 가속·방향 전환과 약 80ms의 감속을 거칩니다. 드래그는 약 25ms 시간 상수로 목표 자세를 따라가며, 놓은 뒤 남은 차이가 최대 약 75ms 안에 정착합니다. 창이나 캔버스가 포커스를 잃으면 모션과 눌린 키를 정리하고, 입력과 목표 차이가 없는 동안에는 그리기를 계속 예약하지 않습니다.

## 렌더링과 검증

렌더러는 픽셀마다 동일한 4×4 표본을 계산합니다. 평면 지도는 Equal Earth 역투영, 지구본은 직교 투영한 구의 표면에서 표본을 얻고, 같은 회전 역변환을 적용합니다. 원본 색은 위도·경도로 읽습니다. 경도 경계는 반복하고 위도는 이미지 끝에서 멈춥니다. sRGB 원본을 선형 색 공간에서 보간·평균한 후 화면 색으로 변환합니다. 지리적 극 전용 보정은 없습니다. 고정 표본 방식이므로 모든 해상도에서의 완전한 앨리어싱 제거를 보장하지 않습니다.

하나의 모션 컨트롤러와 WebGPU 장치·텍스처를 공유하고, 한 프레임에서 두 화면을 함께 그립니다. 지구본의 레이어 선택은 지도 선택과 별개로 관리합니다. 위도·경도 모드는 30° 간격 격자를 직접 계산하며 외부 이미지를 로드하지 않습니다. 평면 지도는 약간 축소해 화면 중앙에 배치합니다. 기본 배율에서는 지구본이 외곽 여백에 놓이고, 지도를 확대하면 일부가 지구본 뒤로 지나갈 수 있습니다.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

브라우저 검사는 알려진 위도·경도 색상 래스터로 평면 지도와 지구본의 기본·회전 자세 GPU 출력을 CPU 기준 계산과 대조합니다. 실제 두 JPEG의 로딩·전환, 자세 유지, 실패 복구, 빠른 재선택, 지구본의 독립 레이어와 고정 크기, 작은 화면의 텍스처 드롭다운과 지구본 레이어 버튼 배치, 로딩 중 위치 유지도 검사합니다. 헤드리스 환경의 화면 합성 제한 때문에 테스트에서 출력 대상을 각 캔버스의 GPU 텍스처로 바꾸며, 실제 Chrome 화면은 별도로 확인합니다. 마우스·터치·키보드 입력, 초기화, 크기 변경, 유휴 상태의 프레임 제출 중단도 검사합니다.

## 텍스처와 출처

두 자산 모두 공식 21600×10800 원본을 8192×4096 RGB JPEG로 축소했습니다. 확대 생성이나 지역별 내용 수정은 하지 않았습니다.

| 텍스처 | 파일 크기 | 출처 |
|---|---|---|
| Natural Earth II with Shaded Relief and Water | 6.83 MB | [Made with Natural Earth — Public domain](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-2/) |
| Blue Marble Next Generation, July 2004 | 3.93 MB | [NASA Earth Observatory / Reto Stöckli, NASA Goddard Space Flight Center](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/) |

NASA 자산은 2004년 7월 합성 영상이며 현재 관측이나 해빙 분포 지도가 아닙니다. 원본 링크·이용 조건·체크섬은 [sources.json](public/textures/sources.json)에 기록했습니다. 현재 선택된 GPU 텍스처만 유지하며, 전환 준비 중에는 새 자산과 이전 자산이 잠시 함께 존재합니다.

원본에서 다시 생성하려면 다음을 실행합니다. 다운로드 캐시는 기본적으로 시스템 임시 디렉터리에 둡니다.

```sh
uv run tools/build_textures.py
```

## 빌드와 범위

`npm run build`는 정적 파일을 `dist/`에 생성합니다. 상대 자산 경로를 사용하므로 GitHub Pages의 저장소 하위 경로에서도 사용할 수 있습니다.

### GitHub Pages 배포

[Pages 워크플로](.github/workflows/pages.yml)는 `main`에 push하면 의존성 설치, 단위 테스트, 빌드, Chromium WebGPU 브라우저 검사를 실행한 뒤 성공한 `dist/`를 배포합니다. PR에서는 검사만 실행합니다. Actions의 **Deploy GitHub Pages → Run workflow**에서도 `main`을 수동 배포할 수 있습니다.

저장소 Settings → Pages의 배포 소스는 **GitHub Actions**입니다. 배포 권한은 `deploy` 작업에만 부여하고 `github-pages` 환경을 사용합니다. 공개 주소는 `https://smturtle2.github.io/equal-earth/`이며, 공유 미리보기 메타데이터도 이 주소를 사용합니다.

브라우저 검사는 CI에서 소프트웨어 WebGPU로 실행하며, CI의 느린 렌더링을 고려해 테스트 제한 시간은 120초입니다. 배포 후 실제 브라우저에서 화면 합성과 텍스처 로딩을 확인합니다.

공유 미리보기는 [편집 가능한 SVG](public/og-image.svg)와 1200×630 PNG로 제공됩니다. 육지 윤곽은 Natural Earth의 공개 자료를 사용합니다.

## 라이선스

프로젝트 코드와 문서는 [EUPL-1.2](LICENSE)로 배포합니다. 라이선스 원문은 [유럽연합 공식 배포본](https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12)을 사용합니다.

외부 지구 텍스처와 의존 라이브러리는 각각의 원래 이용 조건을 따릅니다. 자세한 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 [텍스처 출처](public/textures/sources.json)에 기록되어 있습니다. 빌드 결과에도 라이선스와 외부 자료 고지가 포함됩니다.
