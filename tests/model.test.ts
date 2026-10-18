import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseDataset,
  parseLayout,
  parseManifest,
  emptyLayout,
  assetPath,
  validateBindings,
} from '../src/model/schema.ts';
import { atTime, durationOf, recordStart, scoresAt } from '../src/model/timeline.ts';
import { COMPONENTS } from '../src/model/registry.ts';
import type { Dataset } from '../src/model/types.ts';

const dataJSON = JSON.parse(
  fs.readFileSync(new URL('../public/works/example/data.json', import.meta.url), 'utf8'),
);
const layoutJSON = JSON.parse(
  fs.readFileSync(new URL('../public/works/example/layout.json', import.meta.url), 'utf8'),
);
const data = parseDataset(dataJSON),
  layout = parseLayout(layoutJSON);

test('example fields, dimensions and every component binding validate', () => {
  assert.equal(data.records.length, 43);
  validateBindings(layout, data);
  const all = structuredClone(layout);
  for (const type of Object.keys(COMPONENTS))
    assert.ok(COMPONENTS[type as keyof typeof COMPONENTS].width > 0);
  assert.deepEqual(parseLayout(JSON.parse(JSON.stringify(all))), all);
  assert.equal(emptyLayout().components.length, 0);
});
test('timeline handles exact boundaries, end frame and non-uniform durations', () => {
  const custom: Dataset = {
    ...data,
    records: [{ id: 'a', duration: 1000 }, { id: 'b', duration: 2000 }, { id: 'c' }],
  };
  assert.equal(durationOf(custom), 8000);
  assert.equal(atTime(custom, 999).index, 0);
  assert.equal(atTime(custom, 1000).index, 1);
  assert.equal(atTime(custom, 1000).localMs, 0);
  assert.equal(atTime(custom, 3000).index, 2);
  assert.equal(atTime(custom, 99999).globalProgress, 1);
  assert.equal(atTime(custom, -1).timeMs, 0);
  assert.equal(recordStart(custom, 2), 3000);
});
test('radar morph is absolute, entrance starts at minima, swap starts at prior values', () => {
  const first = atTime(data, 0);
  assert.deepEqual(
    scoresAt(first, data, 'points', 1200),
    data.dimensions.map((d) => d.min),
  );
  const secondTime = recordStart(data, 1);
  assert.deepEqual(
    scoresAt(atTime(data, secondTime), data, 'points', 1200),
    data.records[0].points,
  );
  assert.deepEqual(
    scoresAt(atTime(data, secondTime + 1200), data, 'points', 1200),
    data.records[1].points,
  );
  const a = scoresAt(atTime(data, 500), data, 'points', 1200);
  scoresAt(atTime(data, 9000), data, 'points', 1200);
  assert.deepEqual(scoresAt(atTime(data, 500), data, 'points', 1200), a);
});
test('reject invalid shapes, duplicate IDs, non-finite values and incompatible bindings', () => {
  const d = structuredClone(dataJSON);
  d.records[1].id = d.records[0].id;
  assert.throws(() => parseDataset(d), /重复/);
  d.records[1].id = 'unique';
  d.dimensions[0].max = d.dimensions[0].min;
  assert.throws(() => parseDataset(d), /最大值/);
  const l = structuredClone(layoutJSON);
  l.components[1].id = l.components[0].id;
  assert.throws(() => parseLayout(l), /重复组件/);
  l.components[1].id = 'different';
  l.components[0].x = 9000;
  assert.throws(() => parseLayout(l), /有限数字/);
  const b = structuredClone(layout);
  b.components[0].binding = { source: 'field', field: 'name' };
  assert.throws(() => validateBindings(b, data), /不匹配/);
  const badValues = structuredClone(data);
  badValues.records[0].points = [1, 2];
  assert.throws(() => validateBindings(layout, badValues), /需要 8 项/);
  assert.throws(() => parseLayout({ radarContainer: { width: '500px' } }));
});
test('asset paths are relative and preserve Unicode, spaces and file extensions', () => {
  assert.equal(assetPath('images/选手 姓名.png'), 'images/选手 姓名.png');
  for (const path of [
    '../outside.png',
    'https://host/a.png',
    '/root.png',
    'a/../b',
    'a\\b',
    'a%2fb',
    'a?b',
    './a',
    'a//b',
  ])
    assert.throws(() => assetPath(path));
  assert.throws(() =>
    parseManifest({ version: 1, name: 'bad', theme: 'classic', data: '../data.json' }),
  );
});
