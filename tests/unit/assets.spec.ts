import { expect, test } from '@playwright/test';
import {
  cleanFileName,
  defaultTemplate,
  hashString,
  imageRefsIn,
  internAsset,
  newImageElement,
  pictureUrl,
  pruneAssets,
  resolveImageUrl,
  unusedAssetIds,
} from '../../src/lib/template';
import type { AssetStore, Template } from '../../src/lib/types';
import { dataUrlBytes } from '../../src/lib/images';

const A = 'data:image/png;base64,AAAA';
const B = 'data:image/png;base64,BBBB';

test('dataUrlBytes accounts for base64 padding', () => {
  expect(dataUrlBytes('data:image/png;base64,YQ==')).toBe(1);
  expect(dataUrlBytes('data:image/png;base64,YWI=')).toBe(2);
  expect(dataUrlBytes('data:image/png;base64,YWJj')).toBe(3);
});

test.describe('hashString', () => {
  test('is stable, fixed-width hex and content-sensitive', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toMatch(/^[0-9a-f]{14}$/);
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    expect(hashString('')).toMatch(/^[0-9a-f]{14}$/);
  });

  test('does not collide on a few thousand near-identical inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(hashString(`data:image/png;base64,${i.toString(36).padStart(8, '0')}`));
    expect(seen.size).toBe(5000);
  });
});

test.describe('internAsset / pictureUrl', () => {
  test('stores a picture once, under the name it was first uploaded with', () => {
    const assets: AssetStore = {};
    const a = internAsset(assets, A, 'bears.png');
    expect(internAsset(assets, A, 'otters.png')).toBe(a); // the same picture again
    const b = internAsset(assets, B, 'lions.png');
    expect(b).not.toBe(a);
    expect(assets).toEqual({ [a]: { name: 'bears.png', dataUrl: A }, [b]: { name: 'lions.png', dataUrl: B } });
    expect(pictureUrl(assets, a)).toBe(A);
    expect(pictureUrl(assets, b)).toBe(B);
  });

  test('a picture without a usable file name is still named', () => {
    const assets: AssetStore = {};
    expect(assets[internAsset(assets, A, '   ')].name).toBe('Picture');
  });

  test('no picture, or one that is gone, resolves to nothing rather than throwing', () => {
    expect(pictureUrl({}, 'deadbeef')).toBe('');
    expect(pictureUrl({}, '')).toBe('');
    expect(pictureUrl({}, null)).toBe('');
    expect(pictureUrl(undefined, 'x')).toBe('');
  });

  test('survives a hash collision by suffixing the id', () => {
    const assets: AssetStore = {};
    const id = hashString(A);
    assets[id] = { name: 'other.png', dataUrl: 'data:image/png;base64,SOMETHING_ELSE_WITH_THE_SAME_HASH' };
    const ref = internAsset(assets, A, 'a.png');
    expect(ref).toBe(`${id}-1`);
    expect(assets[ref].dataUrl).toBe(A);
    expect(internAsset(assets, A, 'a.png')).toBe(ref); // and again → reuses the suffixed slot
    expect(Object.keys(assets)).toHaveLength(2);
  });

  test('cleanFileName keeps just the trimmed file name, within a sensible length', () => {
    expect(cleanFileName('  bears.png ')).toBe('bears.png');
    expect(cleanFileName('C:\\fakepath\\camp logo.jpg')).toBe('camp logo.jpg');
    expect(cleanFileName('photos/2026/lions.webp')).toBe('lions.webp');
    expect(cleanFileName('   ')).toBe('');
    expect(cleanFileName('x'.repeat(300))).toHaveLength(120);
  });
});

test('resolveImageUrl prefers the picture rule, then the URL column, then the fixed picture', () => {
  const assets: AssetStore = {};
  const logo = internAsset(assets, A, 'logo.png');
  const bear = internAsset(assets, B, 'bear.png');
  const fixed = { src: logo, srcColumn: null, imageRule: null };
  expect(resolveImageUrl(fixed, { Group: 'Bears' }, assets)).toBe(A);
  expect(resolveImageUrl({ ...fixed, src: '' }, {}, assets)).toBe('');

  const byColumn = { src: logo, srcColumn: 'Photo', imageRule: null };
  expect(resolveImageUrl(byColumn, { Photo: 'https://x/y.png' }, assets)).toBe('https://x/y.png');
  expect(resolveImageUrl(byColumn, { Photo: '  ' }, assets)).toBe(A); // blank cell → fixed picture

  const rule = { column: 'Group', map: { Bears: bear }, fallback: logo };
  const byRule = { src: logo, srcColumn: 'Photo', imageRule: rule };
  expect(resolveImageUrl(byRule, { Group: ' Bears ', Photo: 'https://x/y.png' }, assets)).toBe(B); // values are trimmed
  expect(resolveImageUrl(byRule, { Group: 'Wolves' }, assets)).toBe(A); // fallback
  expect(resolveImageUrl({ ...byRule, imageRule: { ...rule, fallback: '' } }, { Group: 'Wolves' }, assets)).toBe(''); // no fallback → nothing
});

test.describe('references and pruning', () => {
  function withImages(): Template {
    const t = defaultTemplate(['Name', 'Group']);
    const a = internAsset(t.assets, A, 'a.png');
    const b = internAsset(t.assets, B, 'b.png');
    t.sides.front.bgImage = a;
    t.sides.front.elements.push(newImageElement({ src: a }));
    t.sides.front.elements.push(newImageElement({ imageRule: { column: 'Group', map: { Bears: b, Lions: a }, fallback: b } }));
    return t;
  }

  test('imageRefsIn lists every place a picture is used', () => {
    const refs = imageRefsIn(withImages());
    expect(refs).toHaveLength(5); // bg, fixed, Bears, Lions, fallback
    expect(new Set(refs).size).toBe(2);
  });

  test('unusedAssetIds / pruneAssets drop what nothing refers to', () => {
    const t = withImages();
    expect(unusedAssetIds(t)).toEqual([]);
    expect(pruneAssets(t)).toBe(0);
    t.sides.front.elements = t.sides.front.elements.filter((e) => e.kind !== 'image' || !e.imageRule); // stop using B
    const [bId] = Object.entries(t.assets).find(([, p]) => p.dataUrl === B)!;
    expect(unusedAssetIds(t)).toEqual([bId]);
    expect(pruneAssets(t)).toBe(1);
    expect(Object.values(t.assets).map((p) => p.dataUrl)).toEqual([A]);
  });

  test('pictures used only by a saved-but-unused back survive pruning; the last use going frees them', () => {
    const t = defaultTemplate(['Name']);
    const b = internAsset(t.assets, B, 'b.png');
    t.sides.back = { bg: '#ffffff', bgImage: null, elements: [newImageElement({ src: b })] };
    t.sidedness = 'single'; // the back is not printed, but is kept for later
    expect(imageRefsIn(t)).toEqual([b]);
    expect(pruneAssets(t)).toBe(0);
    t.sides.back.elements = [];
    expect(pruneAssets(t)).toBe(1);
    expect(t.assets).toEqual({});
  });
});
