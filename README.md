# Equal Earth

[Open map](https://smturtle2.github.io/equal-earth/) · [한국어](docs/README.ko.md)

![Equal Earth map](public/og-image.png)

Rotate the world to choose your own center. The map and globe move together. Requires WebGPU.

- **Navigate:** drag to rotate, scroll to zoom, Q/E to roll, double-click to reset.
- **Center:** choose a preset, enter coordinates, or use your location.
- **Style:** switch textures, toggle borders and names, and save a transparent 4K PNG.

## Development

Node.js 24+.

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

Push to `main` to deploy to GitHub Pages after checks pass.

## License

[EUPL-1.2](LICENSE). Imagery and map data: Natural Earth and NASA. See [third-party notices](docs/THIRD_PARTY_NOTICES.md).
