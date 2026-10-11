import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import { GripHorizontal, Minus, Plus, Redo2, Undo2 } from 'lucide-solid';
import { fitProblem, type FitStatus, type PreviewSource, type SideId, type TemplateElement } from '../lib/types';
import { PX_PER_MM, clamp, describeFit, outsideCard, round, uid } from '../lib/template';
import { editingLabel } from '../lib/sides';
import {
  activeDesign,
  activeSide,
  canRedo,
  canUndo,
  commit,
  previewRow,
  previewSource,
  redo,
  rows,
  selectedElement,
  selectedId,
  setPreviewSource,
  setSelectedId,
  template,
  undo,
  updateElement,
  updateSide,
} from '../lib/store';
import Card from './Card';
import Inspector from './Inspector';
import Layers from './Layers';
import Previews from './Previews';
import SideSwitcher from './SideSwitcher';
import { Select, IconButton, Button, Toggle, Splitter } from './ui';

type HandleDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** Phones get their own toolbar arrangement (see styles.css). */
const PHONE_QUERY = '(max-width: 600px)';
/** How narrow the "Preview with" menu may get (it truncates its text) to make room for Front / Back. */
const PREVIEW_MENU_MIN_PX = 110;

const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface DragState {
  kind: 'move' | 'resize';
  dir?: HandleDir;
  /** The side the dragged element belongs to; every move of this drag edits that side only. */
  side: SideId;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
}

export default function Designer() {
  const [zoom, setZoom] = createSignal(1);
  const [panMode, setPanMode] = createSignal(false);
  const [snap, setSnap] = createSignal(true);
  const [grid, setGrid] = createSignal(true);
  /** Fit status per text element for the card currently on the canvas (results for the side being edited only). */
  const [rawFitMap, setFitMap] = createSignal<Map<string, FitStatus>>(new Map());
  /** Ignore results for layers that were deleted or hidden since they were measured. */
  const fitMap = createMemo(() => {
    const visible = new Set(
      activeDesign()
        .elements.filter((e) => !e.hidden)
        .map((e) => e.id),
    );
    return new Map([...rawFitMap()].filter(([id]) => visible.has(id)));
  });
  const [canvasSize, setCanvasSize] = createSignal({ width: 0, height: 0 });
  let canvasArea!: HTMLDivElement;
  let canvasCaption!: HTMLDivElement;
  let toolbar!: HTMLDivElement;
  let drag: DragState | null = null;
  let pan: PanState | null = null;

  const cardW = () => template.card.width;
  const cardH = () => template.card.height;
  const canPan = () => cardW() * PX_PER_MM * zoom() > canvasSize().width || cardH() * PX_PER_MM * zoom() > canvasSize().height;

  function fitZoom() {
    if (!canvasArea) return;
    const areaStyle = getComputedStyle(canvasArea);
    const captionSpace = canvasCaption ? canvasCaption.offsetHeight + parseFloat(getComputedStyle(canvasCaption).marginTop) : 0;
    const availW = canvasArea.clientWidth - parseFloat(areaStyle.paddingLeft) - parseFloat(areaStyle.paddingRight);
    const availH = Math.max(1, canvasArea.clientHeight - parseFloat(areaStyle.paddingTop) - parseFloat(areaStyle.paddingBottom) - captionSpace);
    setCanvasSize({ width: availW, height: availH });
    const z = Math.min(availW / (cardW() * PX_PER_MM), availH / (cardH() * PX_PER_MM));
    setZoom(clamp(Math.floor(z * 20) / 20, 0.25, 4));
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      fitZoom();
    });
    ro.observe(canvasArea);
    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('pointermove', onPanMove);
      window.removeEventListener('pointerup', endPan);
      window.removeEventListener('pointercancel', endPan);
      document.body.classList.remove('dragging');
    });
  });

  /**
   * Whether the Front / Back switcher fits on the toolbar line between the other
   * controls (the "Preview with" menu may shrink and truncate to make room), and
   * where: exactly centred when both outer columns can be equally wide, otherwise as
   * close to the centre as the wider side allows. Measured rather than set by
   * breakpoints so it holds for any font.
   */
  const [sidesInline, setSidesInline] = createSignal(false);
  function measureToolbar() {
    const sides = toolbar?.querySelector<HTMLElement>('.side-switcher');
    if (!sides || window.matchMedia(PHONE_QUERY).matches) {
      setSidesInline(false);
      return;
    }
    const left = toolbar.querySelector<HTMLElement>('.toolbar-left')!;
    const right = toolbar.querySelector<HTMLElement>('.toolbar-right')!;
    const menu = left.querySelector<HTMLElement>('[data-testid="preview-source"]')!;
    const style = getComputedStyle(toolbar);
    const available = toolbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    // Everything on the left keeps its size except the menu, which can shrink to PREVIEW_MENU_MIN_PX.
    const leftMin = left.getBoundingClientRect().width - menu.getBoundingClientRect().width + PREVIEW_MENU_MIN_PX;
    const rightWidth = right.scrollWidth;
    const outer = available - sides.getBoundingClientRect().width - 2 * gap; // for both outer columns together
    const fits = outer >= leftMin + rightWidth;
    setSidesInline(fits);
    if (!fits) return;
    // Equal halves centre the switcher exactly; if one side needs more, it gets just that.
    const half = outer / 2;
    const leftColumn = rightWidth > half ? outer - rightWidth : Math.max(leftMin, half);
    toolbar.style.setProperty('--toolbar-left-column', `${Math.floor(leftColumn)}px`);
  }
  onMount(() => {
    const ro = new ResizeObserver(() => measureToolbar());
    ro.observe(toolbar);
    ro.observe(toolbar.querySelector('.toolbar-right')!); // e.g. the zoom level's width changes
    onCleanup(() => ro.disconnect());
    void document.fonts?.ready.then(measureToolbar);
  });
  // The switcher appears and disappears with the sides mode.
  createEffect(
    on(
      () => template.sidedness,
      () => queueMicrotask(measureToolbar),
    ),
  );

  // Fit the card into view initially and whenever its size changes.
  createEffect(() => {
    cardW();
    cardH();
    fitZoom();
  });

  // Switching sides ends any drag or pan first and starts the fit results afresh.
  createEffect(
    on(
      activeSide,
      () => {
        stopDrag();
        stopPan();
        setFitMap(new Map());
      },
      { defer: true },
    ),
  );

  // --- pointer interactions -------------------------------------------------
  function onCanvasPointerDown(e: PointerEvent) {
    if (!panMode() && (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-stage'))) setSelectedId(null);
    if ((!panMode() && e.pointerType !== 'touch') || !canPan() || drag || pan || e.button !== 0) return;
    e.preventDefault();
    pan = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: canvasArea.scrollLeft,
      scrollY: canvasArea.scrollTop,
    };
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);
  }

  function onPanMove(e: PointerEvent) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    canvasArea.scrollLeft = pan.scrollX + pan.startX - e.clientX;
    canvasArea.scrollTop = pan.scrollY + pan.startY - e.clientY;
  }

  function endPan(e: PointerEvent) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    stopPan();
  }

  function stopPan() {
    pan = null;
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
  }

  function pxToMm(px: number) {
    return px / (PX_PER_MM * zoom());
  }

  function onElementPointerDown(e: PointerEvent, el: TemplateElement) {
    if (e.button !== 0 || drag || panMode()) return;
    e.stopPropagation();
    setSelectedId(el.id);
    beginDrag(e, { kind: 'move', side: activeSide(), id: el.id, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h } });
  }

  function onHandlePointerDown(e: PointerEvent, dir: HandleDir) {
    const el = selectedElement();
    if (!el || e.button !== 0 || drag || panMode()) return;
    e.stopPropagation();
    beginDrag(e, {
      kind: 'resize',
      dir,
      side: activeSide(),
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  }

  function beginDrag(e: PointerEvent, state: Omit<DragState, 'pointerId'>) {
    e.preventDefault();
    commit(state.side);
    drag = { ...state, pointerId: e.pointerId };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    document.body.classList.add('dragging');
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    const step = snap() && !e.altKey ? 1 : 0.1;
    const dx = pxToMm(e.clientX - d.startX);
    const dy = pxToMm(e.clientY - d.startY);
    if (d.kind === 'move') {
      updateElement(
        d.side,
        d.id,
        (el) => {
          el.x = round(d.orig.x + dx, step);
          el.y = round(d.orig.y + dy, step);
        },
        false,
      );
    } else {
      const o = d.orig;
      let { x, y, w, h } = o;
      const dir = d.dir!;
      if (dir.includes('e')) w = o.w + dx;
      if (dir.includes('s')) h = o.h + dy;
      if (dir.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (dir.includes('n')) {
        h = o.h - dy;
        y = o.y + dy;
      }
      if (e.shiftKey && dir.length === 2) {
        // keep aspect ratio from corners
        const ratio = o.w / o.h || 1;
        if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
        else w = h * ratio;
        if (dir.includes('n')) y = o.y + o.h - h;
        if (dir.includes('w')) x = o.x + o.w - w;
      }
      const minSize = 2;
      if (w < minSize) {
        if (dir.includes('w')) x = o.x + o.w - minSize;
        w = minSize;
      }
      if (h < minSize) {
        if (dir.includes('n')) y = o.y + o.h - minSize;
        h = minSize;
      }
      updateElement(
        d.side,
        d.id,
        (el) => {
          el.x = round(x, step);
          el.y = round(y, step);
          el.w = round(w, step);
          el.h = round(h, step);
        },
        false,
      );
    }
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    stopDrag();
  }

  function stopDrag() {
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    document.body.classList.remove('dragging');
  }

  // --- keyboard ---------------------------------------------------------------
  /** True when the key press belongs to a form control (so we must not hijack it). */
  function isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
    if (t.tagName === 'INPUT') {
      const type = (t as HTMLInputElement).type;
      // checkboxes / buttons don't use arrows or Delete, so shortcuts can still apply
      return !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(type);
    }
    return false;
  }
  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (isTyping(e)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      if (isTyping(e)) return;
      e.preventDefault();
      redo();
      return;
    }
    if (
      isTyping(e) ||
      (e.target as HTMLElement)?.closest(
        '[data-scope="select"][data-part="trigger"], [data-scope="select"][data-part="content"], [data-scope="segment-group"][data-part="item"], [data-scope="splitter"][data-part="resize-trigger"], [data-scope="accordion"][data-part="item-trigger"]',
      )
    )
      return;
    const el = selectedElement();
    if (!el) return;
    if (e.key === 'Escape') {
      setSelectedId(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    const nudge = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-nudge, 0],
      ArrowRight: [nudge, 0],
      ArrowUp: [0, -nudge],
      ArrowDown: [0, nudge],
    };
    const m = moves[e.key];
    if (m && !el.locked) {
      e.preventDefault();
      updateElement(activeSide(), el.id, (x) => {
        x.x = round(x.x + m[0], 0.1);
        x.y = round(x.y + m[1], 0.1);
      });
    }
  }
  onMount(() => {
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  function removeSelected() {
    const el = selectedElement();
    if (!el) return;
    const id = el.id;
    updateSide(activeSide(), (d) => {
      d.elements = d.elements.filter((e) => e.id !== id);
    });
    setSelectedId(null);
  }

  function duplicateSelected() {
    const el = selectedElement();
    if (!el) return;
    const copy = structuredClone({ ...el }) as TemplateElement;
    copy.id = uid();
    copy.x += 3;
    copy.y += 3;
    copy.name = `${el.name} copy`;
    updateSide(activeSide(), (d) => {
      const i = d.elements.findIndex((e) => e.id === el.id);
      d.elements.splice(i + 1, 0, copy);
    });
    setSelectedId(copy.id);
  }

  // --- preview source selector -----------------------------------------------
  const sourceOptions = createMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'shortest', label: 'Shortest values' },
      { value: 'median', label: 'Median values' },
      { value: 'longest', label: 'Longest values' },
    ];
    const rs = rows();
    // Rows are labelled from the front's name field on both sides, so the labels do not change on a side switch.
    const nameCol = template.sides.front.elements.find((e) => e.kind === 'text' && /name/i.test(e.name));
    rs.forEach((r, i) => {
      let label = `Row ${i + 1}`;
      if (nameCol && nameCol.kind === 'text') {
        const m = nameCol.content.match(/\{\{\s*([^}]+?)\s*\}\}/);
        if (m && r[m[1]]) label += ` — ${r[m[1]]}`;
      } else {
        const first = Object.values(r)[0];
        if (first) label += ` — ${first}`;
      }
      opts.push({ value: `row:${i}`, label });
    });
    return opts;
  });
  const sourceValue = () => {
    const s = previewSource();
    return s.type === 'row' ? `row:${s.index}` : s.type;
  };
  function setSource(v: string) {
    const src: PreviewSource = v.startsWith('row:') ? { type: 'row', index: parseInt(v.slice(4), 10) } : ({ type: v } as PreviewSource);
    setPreviewSource(src);
  }

  function onFit(side: SideId, id: string, status: FitStatus) {
    if (side !== activeSide()) return; // a late report from the side that was just switched away from
    setFitMap((prev) => {
      const next = new Map(prev);
      if (fitProblem(status)) next.set(id, status);
      else next.delete(id);
      return next;
    });
  }
  const problemIds = createMemo(() => new Set(fitMap().keys()));

  const handleSizePx = () => (window.matchMedia('(pointer: coarse)').matches ? 28 : 9) / zoom();

  return (
    <div class="design-layout">
      <aside class="side left">
        <Layers fitMap={fitMap()} onDuplicate={duplicateSelected} onRemove={removeSelected} />
      </aside>

      <main class="center">
        <div
          ref={toolbar}
          class="toolbar designer-toolbar"
          classList={{ 'has-sides': template.sidedness === 'different', 'sides-inline': sidesInline() }}
        >
          <div class="row gap toolbar-left">
            <IconButton variant="outline" size="xs" class="btn icon" title="Undo (Ctrl+Z)" disabled={!canUndo()} onClick={undo}>
              <Undo2 aria-hidden="true" />
            </IconButton>
            <IconButton variant="outline" size="xs" class="btn icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo()} onClick={redo}>
              <Redo2 aria-hidden="true" />
            </IconButton>
            <span class="sep" />
            <label class="row gap-s small">
              <span class="muted">Preview with</span>
              <span data-testid="preview-source">
                <Select value={sourceValue()} options={sourceOptions()} onChange={setSource} label="Preview with" class="compact" />
              </span>
            </label>
          </div>
          <SideSwitcher />
          <div class="row gap toolbar-right">
            <div class="row gap toolbar-view">
              <Toggle checked={snap()} onChange={setSnap} label="Snap" title="Snap positions to whole millimetres (hold Alt to override)" />
              <Toggle checked={grid()} onChange={setGrid} label="Grid" />
              <Toggle checked={panMode()} onChange={setPanMode} label="Drag to Pan" title="Drag the canvas to pan" />
            </div>
            <span class="sep" />
            <span class="zoom-controls" role="group" aria-label="Zoom">
              <IconButton
                variant="outline"
                size="xs"
                class="btn icon"
                title="Zoom out"
                onClick={() => setZoom((z) => clamp(round(z - 0.1, 0.05), 0.25, 4))}
              >
                <Minus aria-hidden="true" />
              </IconButton>
              <Button variant="outline" size="2xs" class="btn tiny" title="Fit to view" onClick={fitZoom}>
                {Math.round(zoom() * 100)}%
              </Button>
              <IconButton
                variant="outline"
                size="xs"
                class="btn icon"
                title="Zoom in"
                onClick={() => setZoom((z) => clamp(round(z + 0.1, 0.05), 0.25, 4))}
              >
                <Plus aria-hidden="true" />
              </IconButton>
            </span>
          </div>
        </div>

        <Splitter.Root
          class="editor-split"
          orientation="vertical"
          defaultSize={['1fr', '300px']}
          panels={[
            { id: 'editor', minSize: '180px' },
            { id: 'previews', minSize: '100px', resizeBehavior: 'preserve-pixel-size' },
          ]}
          keyboardResizeBy={20}
          gap="0"
        >
          <Splitter.Panel
            id="editor"
            class="editor-panel"
            p="0"
            borderWidth="0"
            borderRadius="0"
            flexDirection="column"
            minHeight="0"
            overflow="hidden"
          >
            <div
              ref={canvasArea}
              class="canvas-area"
              classList={{ pannable: canPan(), 'pan-mode': panMode() }}
              onPointerDown={onCanvasPointerDown}
              onWheel={(e) => {
                if (!e.ctrlKey && !e.metaKey) return;
                e.preventDefault();
                setZoom((z) => clamp(round(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.01), 0.25, 4));
              }}
            >
              <div
                class="canvas-stage"
                data-testid="canvas-stage"
                style={{
                  width: `${cardW() * PX_PER_MM * zoom()}px`,
                  height: `${cardH() * PX_PER_MM * zoom()}px`,
                }}
              >
                <div
                  class="canvas-scaler"
                  style={{ transform: `scale(${zoom()})`, 'transform-origin': '0 0' }}
                  onPointerDown={(e) => {
                    // A press on the card background (not on an element) clears the selection.
                    if (!panMode() && (e.target as HTMLElement).classList.contains('card')) setSelectedId(null);
                  }}
                >
                  {/* Keyed on the side so a switch remounts the card and its text measurements. */}
                  <Show when={activeSide()} keyed>
                    {(side) => (
                      <Card
                        template={template}
                        side={side}
                        row={previewRow()}
                        editor
                        selectedId={selectedId()}
                        onElementPointerDown={onElementPointerDown}
                        onElementDblClick={() => {
                          const ta = document.getElementById('content-editor') as HTMLTextAreaElement | null;
                          ta?.focus();
                          ta?.select();
                        }}
                        onFit={(id, status) => onFit(side, id, status)}
                        class="editor-card"
                      />
                    )}
                  </Show>
                  <Show when={grid()}>
                    <div class="grid-overlay" style={{ width: `${cardW()}mm`, height: `${cardH()}mm` }} />
                  </Show>
                  {/* Selection box + handles live in the same scaled coordinate space as the card. */}
                  <Show when={selectedElement()}>
                    {(el) => (
                      <div
                        class="selection"
                        data-testid="selection"
                        classList={{
                          locked: el().locked,
                          overflow: problemIds().has(el().id),
                          outside: !problemIds().has(el().id) && outsideCard(el(), template.card),
                        }}
                        style={{
                          left: `${el().x}mm`,
                          top: `${el().y}mm`,
                          width: `${el().w}mm`,
                          height: `${el().h}mm`,
                          'outline-width': `${1.5 / zoom()}px`,
                          transform: el().rotation ? `rotate(${el().rotation}deg)` : undefined,
                        }}
                      >
                        <Show when={!el().locked}>
                          <For each={HANDLES}>
                            {(dir) => (
                              <div
                                class={`handle ${dir}`}
                                style={{ width: `${handleSizePx()}px`, height: `${handleSizePx()}px`, 'border-width': `${1 / zoom()}px` }}
                                onPointerDown={(e) => onHandlePointerDown(e, dir)}
                              />
                            )}
                          </For>
                        </Show>
                        <div class="sel-label" data-testid="selection-label" style={{ 'font-size': `${11 / zoom()}px`, top: `${-18 / zoom()}px` }}>
                          {el().name} · {el().w.toFixed(1)} × {el().h.toFixed(1)} mm
                          <Show when={describeFit(fitMap().get(el().id))}>{(d) => <> · {d()}!</>}</Show>
                          <Show when={!problemIds().has(el().id) && outsideCard(el(), template.card)}> · extends past the card edge</Show>
                        </div>
                      </div>
                    )}
                  </Show>
                </div>
              </div>
              <div ref={canvasCaption} class="canvas-caption muted small">
                {/* Name the side only when there is more than one face. */}
                <Show when={template.sidedness !== 'single'}>
                  <strong class="canvas-side" data-testid="canvas-side">
                    {editingLabel(template, activeSide())}
                  </strong>
                  {' · '}
                </Show>
                <span class="caption-desktop">
                  {cardW()} × {cardH()} mm · drag to move, drag handles to resize (Shift = keep ratio) · arrows nudge 1 mm · Delete removes ·
                  double-click text to edit
                </span>
                <span class="caption-mobile">
                  {cardW()} × {cardH()} mm · drag a box to move it · drag its handles to resize
                </span>
              </div>
            </div>
          </Splitter.Panel>
          <Splitter.ResizeTrigger id="editor:previews" class="previews-divider" aria-label="Resize card previews and template editor">
            <GripHorizontal size={12} aria-hidden="true" />
          </Splitter.ResizeTrigger>
          <Splitter.Panel id="previews" class="previews-panel" p="0" borderWidth="0" borderRadius="0" minHeight="0" overflow="hidden">
            <Previews />
          </Splitter.Panel>
        </Splitter.Root>
      </main>

      <aside class="side right">
        <Inspector />
      </aside>
    </div>
  );
}
