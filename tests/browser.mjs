import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import ts from 'typescript';

// Serve the production build under a repository subpath, exactly as Pages does.
const root = path.resolve('dist'),
  prefix = '/RadarStandard/';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    // Test-only module route exercises extension hooks without shipping fixtures.
    if (relative.startsWith('__test_modules__/')) {
      const modulePath = relative.slice('__test_modules__/'.length);
      if (
        !/^(src\/.*\.ts|tests\/fixtures\/background\.webm)$/.test(modulePath) ||
        modulePath.includes('..')
      )
        throw new Error('invalid test module');
      const source = await fs.readFile(path.resolve(modulePath));
      if (modulePath.endsWith('.webm')) {
        res.writeHead(200, { 'Content-Type': 'video/webm' });
        res.end(source);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(
        ts.transpileModule(source.toString(), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      );
      return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox'],
});
const errors = [];
await fs.mkdir('test-results', { recursive: true });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const frame = (index) => ({ index, timeMs: (index * 1000) / 60, deltaMs: index ? 1000 / 60 : 0 });
async function downloadLayout(page) {
  const pending = page.waitForEvent('download');
  await page.click('#layout-export-btn');
  return JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
}
async function waitCount(page, count) {
  await page.waitForFunction((n) => document.querySelectorAll('.component').length === n, count);
}
async function checkpoint(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__VIDEO_EXPORT__);
  await checkpoint('empty startup, fixed text and clear', async () => {
    await waitCount(page, 0);
    await page.selectOption('#component-type', 'text');
    await page.locator('#add-binding textarea').fill('固定标题/第二行');
    await page.click('#add-btn');
    await waitCount(page, 1);
    assert.equal(await page.locator('.component-text').textContent(), '固定标题\n第二行');
    await page.click('#clear-btn');
    await waitCount(page, 0);
  });
  await checkpoint('URL-compatible example and automatic playback with pause', async () => {
    await page.click('#example-btn');
    await waitCount(page, 11);
    await page.click('#play-btn');
    const first = await page.locator('#timeline').inputValue();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#timeline').inputValue(), first);
    await page.screenshot({ path: 'test-results/editor.png' });
  });
  await checkpoint('all component types, multiple instances and rebinding', async () => {
    for (const type of [
      'radar',
      'info',
      'ranks',
      'rankImages',
      'image',
      'icon',
      'text',
      'verticalText',
      'progress',
      'verticalProgress',
    ]) {
      await page.selectOption('#component-type', type);
      await page.click('#add-btn');
    }
    await waitCount(page, 21);
    assert.equal(await page.locator('[data-type="radar"]').count(), 2);
    await page.selectOption('#inspector select', 'timeline:global');
    const layout = await downloadLayout(page);
    assert.equal(layout.components.at(-1).binding.scope, 'global');
    await page.getByRole('button', { name: '删除组件', exact: true }).click();
    await waitCount(page, 20);
  });
  await checkpoint(
    'scaled drag/resize, persisted layer order and splitter invariance',
    async () => {
      await page
        .locator('#component-list button')
        .filter({ hasText: '雷达图 · points' })
        .last()
        .click();
      const radar = page.locator('.component[data-id="radar"]');
      const box = await radar.boundingBox();
      const initial = Number(await page.getByLabel('组件X', { exact: true }).inputValue());
      const stage = await page.locator('.stage').boundingBox();
      const scale = stage.width / 1920;
      // Start inside the radar near its upper-left corner, away from overlapping panels.
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.1 + 40 * scale,
        box.y + box.height * 0.1 + 30 * scale,
        { steps: 4 },
      );
      await page.mouse.up();
      assert.equal(
        Number(await page.getByLabel('组件X', { exact: true }).inputValue()),
        initial + 40,
      );
      const handle = await radar.locator('.resize-handle').boundingBox();
      const beforeWidth = Number(await page.getByLabel('组件宽度', { exact: true }).inputValue());
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        handle.x + handle.width / 2 + 30 * scale,
        handle.y + handle.height / 2 + 20 * scale,
        { steps: 3 },
      );
      await page.mouse.up();
      assert.equal(
        Number(await page.getByLabel('组件宽度', { exact: true }).inputValue()),
        beforeWidth + 30,
      );
      const before = await downloadLayout(page);
      const split = await page.locator('.splitter').boundingBox();
      await page.mouse.move(split.x + 3, split.y + 300);
      await page.mouse.down();
      await page.mouse.move(split.x - 150, split.y + 300, { steps: 6 });
      await page.mouse.up();
      const after = await downloadLayout(page);
      assert.deepEqual(after, before);
      await page.selectOption('#theme-select', 'classic');
      assert.deepEqual(await downloadLayout(page), before);
      const selected = after.components.find((c) => c.id === 'radar');
      assert.equal(selected.z, Math.max(...after.components.map((c) => c.z)));
    },
  );
  await checkpoint(
    'layout round trip, deletion, local recovery and theme-independent geometry',
    async () => {
      const layout = await downloadLayout(page);
      const layoutPath = path.resolve('test-results/roundtrip.json');
      await fs.writeFile(layoutPath, JSON.stringify(layout));
      await page.click('#clear-btn');
      await waitCount(page, 0);
      await page.locator('#layout-input').setInputFiles(layoutPath);
      await waitCount(page, layout.components.length);
      assert.deepEqual(await downloadLayout(page), layout);
      await page.getByRole('button', { name: '横排文字 · name', exact: true }).first().click();
      await page.getByLabel('组件宽度', { exact: true }).fill('230');
      await page.getByLabel('组件宽度', { exact: true }).press('Tab');
      await page.waitForTimeout(50);
      const scaledFont = await page
        .locator('.component.selected .component-text')
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(scaledFont <= 30.1 && scaledFont > 0);
      await page.reload();
      await waitCount(page, 0);
      await page.click('#example-btn');
      await waitCount(page, 11);
      await page.click('#restore-btn');
      await waitCount(page, layout.components.length);
    },
  );
  await checkpoint(
    'folder import with Unicode paths, explicit assets, empty layout and validation failure rollback',
    async () => {
      const dir = path.resolve('test-results/作品 文件夹');
      await fs.cp('public/works/example', dir, { recursive: true });
      const manifest = JSON.parse(await fs.readFile(path.join(dir, 'work.json'), 'utf8'));
      delete manifest.layout;
      manifest.name = '本地文件夹';
      await fs.writeFile(path.join(dir, 'work.json'), JSON.stringify(manifest));
      const data = JSON.parse(await fs.readFile(path.join(dir, 'data.json'), 'utf8'));
      await fs.rename(
        path.join(dir, 'images/player-1.svg'),
        path.join(dir, 'images/选手 姓名.svg'),
      );
      data.records[0].photo = 'images/选手 姓名.svg';
      await fs.writeFile(path.join(dir, 'data.json'), JSON.stringify(data));
      await page.locator('#folder-input').setInputFiles(dir);
      await page.waitForFunction(
        () => document.querySelector('#project-name').textContent === '本地文件夹',
      );
      await waitCount(page, 0);
      await page.selectOption('#component-type', 'image');
      await page.click('#add-btn');
      await waitCount(page, 1);
      assert.ok((await page.locator('.component-image').getAttribute('src')).startsWith('blob:'));
      data.records[0].photo = 'images/missing.png';
      await fs.writeFile(path.join(dir, 'data.json'), JSON.stringify(data));
      await page.locator('#folder-input').setInputFiles(dir);
      await page.waitForFunction(() =>
        document.querySelector('.notice.error')?.textContent.includes('缺少素材'),
      );
      await waitCount(page, 1);
      await page.click('#present-btn');
      assert.equal(await page.locator('.sidebar').isVisible(), false);
      const ratio = await page.locator('.stage').boundingBox();
      assert.ok(Math.abs(ratio.width / ratio.height - 16 / 9) < 0.001);
      await page.getByRole('button', { name: '返回编辑', exact: true }).click();
      assert.equal(await page.locator('.sidebar').isVisible(), true);
    },
  );
  await context.close();
  await checkpoint(
    'theme background image/video/code lifecycle and animated-image rejection',
    async () => {
      const c = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const p = await c.newPage();
      await p.goto(url);
      await p.waitForFunction(() => !!window.__VIDEO_EXPORT__);
      const result = await p.evaluate(async (prefix) => {
        const { createBackground } = await import(
          `${prefix}__test_modules__/src/themes/background.ts`
        );
        const { createParticles } = await import(
          `${prefix}__test_modules__/src/themes/classic/particles.ts`
        );
        const { checkStaticImage } = await import(
          `${prefix}__test_modules__/src/assets/static-image.ts`
        );
        const host = document.createElement('div');
        document.body.append(host);
        const pixels = () => host.querySelector('canvas').toDataURL();
        const code = createBackground(host, { kind: 'code', create: createParticles });
        await code.prepare(42);
        await code.render(1000, 320, 180, 2);
        const first = pixels();
        await code.render(2000, 320, 180, 2);
        const second = pixels();
        await code.prepare(42);
        await code.render(1000, 320, 180, 2);
        const reset = pixels();
        code.dispose();
        const video = createBackground(host, {
          kind: 'video',
          src: `${prefix}__test_modules__/tests/fixtures/background.webm`,
          loop: true,
        });
        await video.prepare(1);
        await video.render(500, 320, 180, 2);
        const videoFirst = pixels();
        await video.render(1250, 320, 180, 2);
        const videoNext = pixels();
        await video.render(500, 320, 180, 2);
        const videoReset = pixels();
        await video.render(2500, 320, 180, 2);
        const loop = pixels();
        video.dispose();
        const image = createBackground(host, {
          kind: 'image',
          src: `${prefix}works/example/images/logo.svg`,
        });
        await image.prepare(1);
        await image.render(0, 320, 180, 1);
        const imageLoaded = host.querySelector('img').naturalWidth > 0;
        image.dispose();
        const svg = URL.createObjectURL(
          new Blob(
            [
              '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity" values="0;1" dur="1s"/></svg>',
            ],
            { type: 'image/svg+xml' },
          ),
        );
        let rejected = false;
        try {
          await checkStaticImage(svg, 'animated.svg');
        } catch {
          rejected = true;
        }
        URL.revokeObjectURL(svg);
        return {
          different: first !== second,
          reset: first === reset,
          videoDifferent: videoFirst !== videoNext,
          videoReset: videoFirst === videoReset,
          loop: loop === videoFirst,
          released: host.childNodes.length === 0,
          imageLoaded,
          rejected,
        };
      }, prefix);
      assert.deepEqual(result, {
        different: true,
        reset: true,
        videoDifferent: true,
        videoReset: true,
        loop: true,
        released: true,
        imageLoaded: true,
        rejected: true,
      });
      await c.close();
    },
  );
  const exportContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await exportContext.addInitScript(() => {
    window.__VIDEO_EXPORT_REQUEST__ = {
      fps: 60,
      viewport: { width: 1920, height: 1080 },
      output: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      seed: 42,
    };
  });
  const exporting = await exportContext.newPage();
  exporting.on('pageerror', (error) => errors.push(String(error)));
  await exporting.goto(`${url}?work=example`);
  await exporting.waitForFunction(() => !!window.__VIDEO_EXPORT__);
  const manifest = await exporting.evaluate(() => window.__VIDEO_EXPORT__.getManifest());
  assert.equal(manifest.supportsSeeking, false);
  assert.ok(manifest.durationMs > 0);
  await checkpoint(
    'export startup disables autoplay; prepare/reset/renderFrame are deterministic',
    async () => {
      assert.equal(await exporting.locator('.return-edit').isVisible(), false);
      const first = await exporting.screenshot();
      await exporting.waitForTimeout(120);
      assert.equal(hash(await exporting.screenshot()), hash(first));
      await exporting.evaluate(() =>
        window.__VIDEO_EXPORT__.prepare(window.__VIDEO_EXPORT_REQUEST__),
      );
      const renderTo = async (end) => {
        await exporting.evaluate(async (end) => {
          const api = window.__VIDEO_EXPORT__;
          await api.reset();
          for (let i = 0; i <= end; i++)
            await api.renderFrame({
              index: i,
              timeMs: (i * 1000) / 60,
              deltaMs: i ? 1000 / 60 : 0,
            });
        }, end);
        return exporting.screenshot();
      };
      const a = await renderTo(240);
      await exporting.waitForTimeout(200);
      assert.equal(hash(await exporting.screenshot()), hash(a));
      assert.equal(hash(await renderTo(240)), hash(a));
      await exporting.evaluate(async () => {
        for (let i = 241; i <= 700; i++)
          await window.__VIDEO_EXPORT__.renderFrame({
            index: i,
            timeMs: (i * 1000) / 60,
            deltaMs: 1000 / 60,
          });
      });
      const whole = await exporting.screenshot();
      assert.equal(hash(await renderTo(700)), hash(whole));
      assert.equal(await exporting.locator('.component[data-id="title"]').isVisible(), false);
      assert.equal(
        await exporting.locator('.component[data-id="name"]').textContent(),
        '石井 一馬',
      );
      await exporting.screenshot({ path: 'test-results/presentation.png' });
      await assert.rejects(
        () => exporting.evaluate((f) => window.__VIDEO_EXPORT__.renderFrame(f), frame(999)),
        /顺序逐帧/,
      );
      await exporting.evaluate(() => {
        window.__VIDEO_EXPORT__.dispose();
        window.__VIDEO_EXPORT__.dispose();
      });
    },
  );
  await exportContext.close();
  await checkpoint(
    '4K increases actual Canvas bitmap; dispose is safe without prepare',
    async () => {
      const c = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
      });
      await c.addInitScript(() => {
        window.__VIDEO_EXPORT_REQUEST__ = {
          fps: 60,
          viewport: { width: 1920, height: 1080 },
          output: { width: 3840, height: 2160 },
          deviceScaleFactor: 2,
          seed: 42,
        };
      });
      const p = await c.newPage();
      p.on('pageerror', (error) => errors.push(String(error)));
      await p.goto(`${url}?work=example`);
      await p.waitForFunction(() => !!window.__VIDEO_EXPORT__);
      await p.evaluate(async () => {
        const a = window.__VIDEO_EXPORT__;
        await a.getManifest();
        await a.prepare(window.__VIDEO_EXPORT_REQUEST__);
        await a.reset();
        await a.renderFrame({ index: 0, timeMs: 0, deltaMs: 0 });
      });
      const bitmap = await p
        .locator('.radar-canvas')
        .evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
      assert.deepEqual(bitmap, { width: 1520, height: 1520 });
      const shot = await p.screenshot();
      assert.equal(shot.readUInt32BE(16), 3840);
      assert.equal(shot.readUInt32BE(20), 2160);
      const metadata = await c.newPage();
      await metadata.goto(`${url}?work=example`);
      await metadata.waitForFunction(() => !!window.__VIDEO_EXPORT__);
      await metadata.evaluate(async () => {
        await window.__VIDEO_EXPORT__.getManifest();
        window.__VIDEO_EXPORT__.dispose();
      });
      await c.close();
    },
  );
  assert.deepEqual(errors, [], `Uncaught browser errors: ${errors.join('\n')}`);
  console.log('Browser checks passed against production files under /RadarStandard/.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
