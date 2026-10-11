import { expect, test } from '@playwright/test';
import { parseTemplate } from '../../src/lib/template-schema';
import { defaultTemplate, internAsset, newImageElement, newRectElement, newTextElement } from '../../src/lib/template';
import type { Template } from '../../src/lib/types';

/** A template using every kind of element, both sides, rules and a stored picture. */
function fullTemplate(): Template {
  const t = defaultTemplate(['Name', 'Group']);
  const pic = internAsset(t.assets, 'data:image/png;base64,AAAA', 'logo.png');
  t.sides.front.bgImage = pic;
  t.sides.front.elements.push(
    newImageElement({ src: pic, imageRule: { column: 'Group', map: { Bears: pic }, fallback: '' } }),
    newRectElement({ colorRule: { column: 'Group', map: { Bears: '#111111' }, fallback: '#999999' } }),
  );
  t.sidedness = 'different';
  t.sides.back = { bg: '#123456', bgImage: null, elements: [newTextElement({ name: 'Back' })] };
  t.page.printMethod = 'duplex';
  return t;
}

const parsed = (raw: unknown) => parseTemplate(raw);

test.describe('valid templates', () => {
  test('the starter design and a full template read back unchanged', () => {
    for (const t of [defaultTemplate(), fullTemplate()]) expect(parsed(structuredClone(t))).toEqual({ ok: true, template: t });
  });

  test('a saved back is accepted in every mode', () => {
    for (const mode of ['single', 'same', 'different'] as const) expect(parsed({ ...fullTemplate(), sidedness: mode }).ok).toBe(true);
  });

  test('parsing returns a copy and never changes its input', () => {
    const t = fullTemplate();
    const before = JSON.stringify(t);
    const r = parsed(t);
    expect(JSON.stringify(t)).toBe(before);
    expect(r.ok && r.template).not.toBe(t);
  });
});

test.describe('rejected templates', () => {
  const cases: [string, (t: Record<string, any>) => void][] = [
    ['another version', (t) => (t.version = 2)],
    ['no version', (t) => delete t.version],
    ['unknown sidedness', (t) => (t.sidedness = 'triple')],
    ['different sides without a back', (t) => (t.sides.back = null)],
    ['no front', (t) => delete t.sides.front],
    ['a side without layers', (t) => delete t.sides.front.elements],
    ['a malformed back', (t) => (t.sides.back = 'nope')],
    ['a non-numeric card width', (t) => (t.card.width = 'wide')],
    ['a zero card height', (t) => (t.card.height = 0)],
    ['a missing page field', (t) => delete t.page.margin],
    ['an unknown paper size', (t) => (t.page.preset = 'B5')],
    ['an unknown printing method', (t) => (t.page.printMethod = 'telepathy')],
    ['a layer without an id', (t) => delete t.sides.front.elements[0].id],
    ['a layer of unknown kind', (t) => (t.sides.back.elements[0].kind = 'video')],
    ['a layer missing a field', (t) => delete t.sides.front.elements[1].fontSize],
    ['a layer field of the wrong type', (t) => (t.sides.front.elements[1].bold = 'yes')],
    ['a position that is not a number', (t) => (t.sides.front.elements[0].x = null)],
    ['a malformed colour rule', (t) => (t.sides.front.elements.at(-1).colorRule = { column: 'Group' })],
    ['a picture rule with a non-text value', (t) => (t.sides.front.elements.at(-2).imageRule.map.Bears = 7)],
    ['two layers with the same id', (t) => (t.sides.back.elements[0].id = t.sides.front.elements[0].id)],
    ['a malformed stored picture', (t) => (t.assets[Object.keys(t.assets)[0]] = 'data:image/png;base64,AAAA')],
    ['no picture store', (t) => delete t.assets],
  ];
  for (const [what, breakIt] of cases) {
    test(what, () => {
      const t = structuredClone(fullTemplate()) as unknown as Record<string, any>;
      breakIt(t);
      const r = parsed(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^This template cannot be used: /);
    });
  }

  test('anything that is not a template object', () => {
    for (const raw of [null, 42, 'x', [], {}]) expect(parsed(raw).ok).toBe(false);
    expect(parsed([])).toEqual({ ok: false, error: 'This is not a Card Maker template.' });
  });
});
