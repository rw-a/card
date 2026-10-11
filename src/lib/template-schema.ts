import type { PrintMethod, Sidedness, Template, TemplateElement } from './types';
import { TEMPLATE_VERSION } from './types';
import { PAGE_PRESETS, defaultTemplate, newImageElement, newRectElement, newTextElement } from './template';

/**
 * Checking that stored or imported JSON is a template this version of the app can
 * use, so a damaged or foreign file can never put the editor into a broken state.
 *
 * Shapes are checked against the app's own defaults (every field present, same type),
 * so new fields are covered without listing them here. Nothing is repaired or
 * upgraded: anything else is rejected with a reason.
 */

export type ParseResult = { ok: true; template: Template } | { ok: false; error: string };

type Obj = Record<string, unknown>;

class Invalid extends Error {}

function fail(msg: string): never {
  throw new Invalid(msg);
}

function isObj(x: unknown): x is Obj {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** Fields whose default is null, and the type they hold when set. */
const NULLABLE: Record<string, 'string' | 'object'> = { bgImage: 'string', srcColumn: 'string', colorRule: 'object', imageRule: 'object' };

/** Every field of `sample` must be present in `value` with the same type (finite numbers only). */
function checkShape(value: unknown, sample: object, where: string): asserts value is Obj {
  if (!isObj(value)) fail(`${where} is missing`);
  for (const [key, expected] of Object.entries(sample)) {
    const v = value[key];
    const ok =
      expected === null
        ? v === null || typeof v === NULLABLE[key]
        : Array.isArray(expected)
          ? Array.isArray(v)
          : typeof expected === 'number'
            ? typeof v === 'number' && Number.isFinite(v)
            : typeof v === typeof expected && (typeof v !== 'object' || isObj(v));
    if (!ok) fail(`${where}: "${key}" is missing or has the wrong type`);
  }
}

/** A colour or picture rule: a column, a value → string map and a fallback. */
function checkRule(rule: unknown, where: string) {
  if (rule === null) return;
  checkShape(rule, { column: '', map: {}, fallback: '' }, where);
  if (!Object.values(rule.map as Obj).every((v) => typeof v === 'string')) fail(`${where}: values must be text`);
}

const SAMPLE_ELEMENT = { text: newTextElement(), rect: newRectElement(), image: newImageElement() } as const;

function checkSide(side: unknown, where: string, ids: Set<string>) {
  checkShape(side, { bg: '', bgImage: null, elements: [] }, `the ${where} design`);
  (side.elements as unknown[]).forEach((el, i) => {
    const at = `${where} layer ${i + 1}`;
    const kind = isObj(el) ? (el.kind as TemplateElement['kind']) : undefined;
    if (!kind || !(kind in SAMPLE_ELEMENT)) fail(`${at} has an unknown kind`);
    checkShape(el, SAMPLE_ELEMENT[kind], at);
    if (ids.has(el.id as string)) fail(`${at} has the same id as another layer`);
    ids.add(el.id as string);
    if ('colorRule' in el) checkRule(el.colorRule, `${at} colour rule`);
    if ('imageRule' in el) checkRule(el.imageRule, `${at} picture rule`);
  });
}

const SIDEDNESS: Sidedness[] = ['single', 'same', 'different'];
const PRINT_METHODS: PrintMethod[] = ['cutouts', 'duplex'];

function check(t: Obj): Template {
  if (t.version !== TEMPLATE_VERSION) fail('it was made by a different version of Card Maker');
  const sample = defaultTemplate();
  checkShape(t.card, sample.card, 'the card size');
  if ((t.card.width as number) <= 0 || (t.card.height as number) <= 0) fail('the card size must be positive');
  if (!SIDEDNESS.includes(t.sidedness as Sidedness)) fail('"sidedness" must be single, same or different');
  checkShape(t.page, sample.page, 'the page settings');
  if (!(t.page.preset === 'custom' || (t.page.preset as string) in PAGE_PRESETS)) fail('the paper size is unknown');
  if (!PRINT_METHODS.includes(t.page.printMethod as PrintMethod)) fail('the printing method is unknown');
  if (!isObj(t.sides)) fail('the side designs are missing');
  const ids = new Set<string>();
  checkSide(t.sides.front, 'front', ids);
  if (t.sides.back !== null) checkSide(t.sides.back, 'back', ids);
  if (t.sidedness === 'different' && t.sides.back === null) fail('different sides need a back design');
  if (!isObj(t.assets)) fail('the stored pictures are missing');
  for (const [id, picture] of Object.entries(t.assets)) checkShape(picture, { name: '', dataUrl: '' }, `picture ${id}`);
  return t as unknown as Template;
}

/** Validate a stored or imported template. The input is not changed; the result is a copy. */
export function parseTemplate(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'This is not a Card Maker template.' };
  try {
    return { ok: true, template: check(structuredClone(raw)) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: `This template cannot be used: ${e.message}.` };
    throw e;
  }
}
