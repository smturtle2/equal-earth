import { describe, expect, it } from 'vitest';
import { quat } from 'gl-matrix';
import { readFileSync } from 'node:fs';
import { placeLabels, type MapLabel } from '../src/map-labels';
import { frameLayout } from '../src/map-frame';
import { viewPresets } from '../src/view-presets';
import { invert } from '../src/projection';

const labels = JSON.parse(readFileSync('public/layers/labels.json', 'utf8')).labels as MapLabel[];
const measure = (name: string, size: number) => name.length * size * .7;

describe('geographic label layout', () => {
  it('keeps whole labels within the map without overlap across poles, roll, and mobile views', () => {
    for (const [width, height, zoom] of [[1200, 760, 1], [320, 740, 1], [640, 480, 4]]) {
      for (const preset of viewPresets) {
        const rotation = quat.rotateZ(quat.create(), preset.rotation, .73);
        const layout = frameLayout(width, height, 1, zoom);
        const placed = placeLabels(labels, rotation, layout, 'ko', measure);
        expect(placed.length).toBeGreaterThan(0);
        for (const a of placed) {
          expect(a.x - a.width / 2).toBeGreaterThanOrEqual(0);
          expect(a.x + a.width / 2).toBeLessThanOrEqual(width);
          expect(a.y - a.size / 2).toBeGreaterThanOrEqual(0);
          expect(a.y + a.size / 2).toBeLessThanOrEqual(height);
          for (const x of [a.x - a.width / 2, a.x + a.width / 2]) {
            for (const y of [a.y - a.size / 2, a.y + a.size / 2]) {
              expect(invert((x - layout.x) / layout.scale, (layout.y - y) / layout.scale)).not.toBeNull();
            }
          }
          for (const b of placed) if (a !== b) {
            expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2
              || Math.abs(a.y - b.y) >= (a.size + b.size) / 2).toBe(true);
          }
        }
      }
    }
  });

  it('centers a geographic label after rotation and chooses the requested language', () => {
    const seoul: MapLabel = { id: 'seoul', kind: 'country', longitude: 0, latitude: 0, name_en: 'Seoul', name_ko: '서울', rank: 1 };
    const layout = frameLayout(1200, 760, 1, 1);
    for (const [locale, name] of [['en', 'Seoul'], ['ko', '서울']] as const) {
      const [label] = placeLabels([seoul], quat.create(), layout, locale, measure);
      expect(label.name).toBe(name);
      expect(label.x).toBe(layout.x);
      expect(label.y).toBe(layout.y);
    }
    const edge = { ...seoul, longitude: 180 };
    expect(placeLabels([edge], quat.create(), layout, 'en', measure)).toEqual([]);
  });
});
