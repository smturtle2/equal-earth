# Equal Earth

[![Equal Earth map centered on the Pacific](public/og-image.png)](https://smturtle2.github.io/equal-earth/)

<p align="center">
  <a href="https://smturtle2.github.io/equal-earth/"><strong>Open map</strong></a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="https://github.com/smturtle2/equal-earth/issues">Report an issue</a>
</p>

<p align="center">
  <a href="https://github.com/smturtle2/equal-earth/actions/workflows/pages.yml"><img src="https://github.com/smturtle2/equal-earth/actions/workflows/pages.yml/badge.svg" alt="Build and deployment status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-EUPL--1.2-344c5c" alt="License: EUPL-1.2"></a>
</p>

An interactive Equal Earth map that lets you choose the center. Rotate the world in any direction while preserving the relative areas of continents.

## Features

- **Free rotation** — drag, tilt, and roll the map around any point.
- **Synchronized globe** — explore the same orientation in flat and spherical views.
- **Two Earth textures** — switch between Natural Earth II and NASA Blue Marble at 8192 × 4096 resolution.
- **Mouse, touch, and keyboard** — rotate either view; zoom the flat map independently.

Requires a browser with WebGPU enabled.

## Controls

| Input | Action |
| --- | --- |
| Drag / arrow keys | Rotate the map and globe |
| Shift + drag / hold Q or E | Roll; Shift + Q/E increases speed |
| Scroll / pinch / + or − | Zoom the flat map |
| Two-finger gesture | Rotate, twist, and zoom |
| 0 / Home / double-click | Reset the view |
| Globe layer button | Toggle the graticule or current Earth texture |

Choose a texture from the dropdown below the map. Switching textures preserves the view.

## Development

Use Node.js 24 or later.

```sh
npm ci
npm run dev
```

Built with TypeScript, Vite, WebGPU, and gl-matrix.

<details>
<summary>Build and test</summary>

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Build output goes to `dist/`. Pushes to `main` deploy to GitHub Pages after tests pass; pull requests run checks only. See the [deployment workflow](.github/workflows/pages.yml).

</details>

## Credits & license

Earth imagery: [Natural Earth](https://www.naturalearthdata.com/) and [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/). Blue Marble uses the July 2004 composite.

Code and documentation: [EUPL-1.2](LICENSE). External assets retain their original terms; see [third-party notices](THIRD_PARTY_NOTICES.md) and [texture sources](public/textures/sources.json).
