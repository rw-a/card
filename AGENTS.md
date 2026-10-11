# AGENTS.md

Technical notes for AI coding agents (and developers) working on Card Maker. The user-facing
documentation is `README.md`; keep it free of implementation detail.

## Overview

Card Maker is a static single-page app: load a CSV, design one card template, print a card per
row. Everything runs in the browser; there is no server. Deployed to GitHub Pages.

Stack: [SolidJS](https://www.solidjs.com/), [Park UI](https://park-ui.com/) on
[Ark UI](https://ark-ui.com/), [Panda CSS](https://panda-css.com/), [Vite](https://vitejs.dev/) 8
(Rolldown), TypeScript 7, PapaParse for CSV, Lucide icons, Playwright for all tests. Node 22.12 or
later (see `.nvmrc`; Vite 8 requires it).

Build notes (`vite.config.ts`): `cssTarget` is the first browsers with `:has()`, which the styles
need; a lower target makes the CSS minifier add fallbacks (e.g. `:-webkit-any()`) that only bloat
the bundle. Rolldown's `invalidAnnotation` and `pluginTimings` checks are off because the first
only reports misplaced `@__PURE__` comments in Panda's generated `styled-system/`. TypeScript 7
no longer accepts `baseUrl`; `paths` resolve relative to the tsconfig.

## Commands

```bash
npm install            # also runs `panda codegen` (prepare)
npm run dev            # http://localhost:5173
npm run build          # panda codegen + tsc + vite build → dist/
npm run preview        # serve the production build
npm run typecheck      # panda codegen + tsc for src and tests
npm run lint           # oxlint (correctness = error, suspicious = warn)
npm run lint:fix
npm run format         # oxfmt, in place
npm run format:check
npm test               # all Playwright projects (unit + chromium), builds and serves dist first
npm run test:unit      # pure-function tests only (Node)
npm run test:ui        # browser tests only
npm run test:headed
npm run test:report
npm run screenshots    # regenerate docs/screenshots/ for README.md (not part of npm test)
CI_FONTS=1 npm test    # render with DejaVu Sans, the CI runners' default font (Linux, fontconfig)
```

Before finishing a change, run `npm run typecheck`, `npm run lint`, `npm run format:check` and
`npm test`; CI (`.github/workflows/ci.yml`) runs the same on every pull request. Locally,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point at an installed Chrome/Chromium.

## Conventions

- **Formatting:** oxfmt with single quotes, semicolons, trailing commas, 150-character lines
  (`.oxfmtrc.json`). Generated code is excluded: `src/components/park/`, `src/theme/` (Park UI
  CLI output; keep its style so it can be regenerated) and `styled-system/` (Panda output, not in
  Git; regenerate with `npm run prepare`).
- **Linting:** `.oxlintrc.json`; every disabled rule has a comment explaining why. Notable: Solid
  assigns `let el!: HTMLElement` through `ref={el}`, so `no-unassigned-vars` is off.
- **Formatting-only commits** go in `.git-blame-ignore-revs`.
- **Help text** in `Help.tsx` is a short version of `README.md`; when a user-facing feature changes,
  update both.
- **Adding Park UI components** with `npx @park-ui/cli add <name>`. The CLI is not a dependency:
  its latest release (1.0.1) declares a TypeScript 5 peer, which conflicts with TypeScript 7, so
  `npx` fetches it when needed. It may generate
  `createStyleContext` (replace it with `createSlotRecipeContext`, which this Panda version uses) and
  register slot recipes under `recipes` in `src/theme/recipes/index.ts` (move them to `slotRecipes`).
  Render dialogs and other overlays in a `Portal` so they inherit no styles from where they are
  placed.
- **Comments** explain why, in plain sentences; match the density of the surrounding code.
- **No backwards compatibility yet.** The app has no users to keep, so there is no migration
  code. Saved data that fails validation is cleared (see Persistence). When compatibility starts
  to matter, bump `TEMPLATE_VERSION` and add an upgrade step in `src/lib/template-schema.ts`.
- **Accessibility:** interactive elements must be keyboard operable (the jsx-a11y rules are
  errors). Text measurement on preview cards relies on them not inheriting button styles, which is
  why the Fit Check cards use `role="button"` on a `div`.
- **Layout decisions that depend on rendered width** (the design toolbar) are measured in code,
  not set with breakpoints: fonts differ between machines (CI uses DejaVu Sans, which is wider).

## Project layout

```
src/
  components/
    App.tsx             tabs, top bar, startup/persistence notices
    Help.tsx            Help button and instructions dialog; CsvSteps (also used on the Data tab)
    Brand.tsx           app name (top bar; Data page title on phones)
    DataPanel.tsx       CSV upload/paste/sample, preview table, per-column length stats
    Designer.tsx        design toolbar, canvas, drag/resize, shortcuts, zoom, editor/fit-check splitter
    SideSwitcher.tsx    Front / Back switch (different-sides mode)
    Layers.tsx          add buttons, layer list (select, reorder, lock, hide)
    TemplateBasics.tsx  Card Settings: sides mode, size, corner radius, side background
    Inspector.tsx       template files, stored pictures, tips; settings of the selected layer
    Previews.tsx        Fit Check: shortest/median/longest previews
    Card.tsx            renders one face of a card for a template, side and data row
    TextBox.tsx         text layer with shrink-to-fit and fit measurement
    PrintPanel.tsx      paper, cutting, copies/rows, summary, sheet preview, print run
    ui.tsx              app compositions of Park UI controls (Field, Select, PictureControl…)
    park/               Park UI component source (generated; dialog.tsx added with the CLI, see below)
  theme/                Park UI tokens and recipes (generated)
  lib/
    types.ts            template, element, dataset types; TEMPLATE_VERSION
    template.ts         defaults, placeholders, rules, sheet layout, picture store
    template-schema.ts  validation of stored and imported templates
    sides.ts            which design each face shows; cloning sides
    store.ts            Solid store, active side, undo/redo, async-edit guards, persistence
    storage.ts          IndexedDB key-value store with a localStorage fallback
    print-plan.ts       badges → pages with explicit front/back placements; crop marks
    print-ready.ts      waits for fonts, pictures and text fitting before printing
    stats.ts            shortest / median / longest value per column
    csv.ts              PapaParse wrapper, sample data
    images.ts           image upload → downscaled data URL
  styles.css            app layout, responsive rules, canvas and print styles
tests/
  unit/                 pure-function tests (Node)
  ui/                   end-to-end tests + helpers.ts
scripts/screenshots.spec.ts   README screenshot generator (playwright.screenshots.config.ts)
docs/screenshots/              images used by README.md
```

## Data model

`Template` (`src/lib/types.ts`), saved and exported as JSON (`template.card-maker.json`):

- `version` – `TEMPLATE_VERSION` (currently 1). Any other version is rejected.
- `card` – shared geometry: `width`, `height`, `borderRadius` (mm).
- `sidedness` – `single` | `same` | `different`.
- `sides.front` / `sides.back` – `SideDesign` (`bg`, `bgImage`, `elements`). `back` is `null` until
  first created and is kept while unused, so switching back to `different` restores it.
- `page` – paper, margins, gaps, crop marks, outline, `copies` (complete badges per row),
  `printMethod` (`cutouts` | `duplex`, used only when double-sided).
- `assets` – picture store: id → `{ name, dataUrl }`. Ids are a content hash (`hashString`), so
  identical pictures are stored once and keep the first file name. Elements and backgrounds refer
  to pictures by id; unreferenced pictures are pruned on save and export (`pruneAssets`).

Elements are `text`, `rect` or `image`, positioned in mm. Text uses `{{Column}}` placeholders.
`colorRule` (text, rect) maps column values to fills; `imageRule` maps column values to picture ids
with a fallback; `srcColumn` takes an image URL from a column.

`template-schema.ts` validates by comparing shapes against the app's own defaults
(`defaultTemplate`, `newTextElement`…), so new fields are covered automatically. It also checks
enums, positive card size, unique element ids across sides and that `different` has a back.

## Sides

Resolvers in `src/lib/sides.ts`: `getDesignForSide` (`same` → back reads the front; `single` → no
back), `getStoredDesigns` (picture bookkeeping, includes a retained back), `getUsedDesigns`
(column discovery, excludes a retained back). The editor edits `activeSide()`, normalised so only
`different` can edit the back. `Card` takes an explicit `side`.

## Store, undo and async edits (`src/lib/store.ts`)

- One Solid store holds the template; mutations go through `updateTemplate`, `updateSide(side, …)`
  and `updateElement(side, id, …)`, which never create a missing side or element.
- Undo/redo keep whole-template snapshots (80 entries) plus the affected side and selection; undo
  reveals the side whose content changed.
- Uploads finish asynchronously. `beginAsyncEdit(side, key)` returns a check that fails if the
  document was replaced, the side was cleared or restored, the target is gone, or a newer request
  for the same target started. Capture side and element id before awaiting.
- The template is "pristine" until edited; loading a CSV then regenerates the starter design
  from the CSV headers.

## Persistence

`storage.ts` opens IndexedDB `card-maker` (store `kv`, keys `template`, `dataset`,
`template-pristine`) and falls back to localStorage (`card-maker:` prefix) when IndexedDB is
unavailable. Writes are debounced (300 ms) and flushed on `pagehide`/`beforeunload`.
At startup, a stored template that fails `parseTemplate` or a dataset that fails `isDataset`
causes the whole store to be cleared and a dismissible notice to be shown. The first time pictures
are saved the app calls `navigator.storage.persist()`.

## Text fitting and the Fit Check

`TextBox` shrinks text (binary search between `fontSize` and `minFontSize`) until it fits the area
inside its padding. Two statuses are reported per element:

- `overflow` – text is actually cut off by its own box: it does not fit inside the padding at the
  minimum size **and** a rendered line extends past the box by more than 0.3 mm plus 0.2 em (a line
  box includes the font's built-in space above and below the glyphs). Measured with the element's
  rotation temporarily removed.
- `clipped` – visible text lies outside the card.

The Fit Check renders the active side with synthetic rows where each field independently takes its
shortest, median or longest value (`stats.ts`). It can be collapsed; on desktop the panel is an Ark
splitter panel collapsed to its heading (`FIT_CHECK_COLLAPSED_PX`).

## Printing

- `print-plan.ts` expands the selected rows by copies into badge instances, then places faces:
  `single` packs fronts row-major; `cutouts` puts each badge's front and back in adjacent slots
  (one slot per sheet → consecutive sheets); `duplex` emits sheet front, then sheet back with each
  back at its front's position reflected across the page width. Convention: the sheet is turned
  over around its vertical axis (long-edge flip for portrait, short-edge for landscape); artwork is
  never mirrored. Back pages are always emitted, even when blank. Crop marks come from occupied
  placements; duplex prints guides on fronts only.
- `PrintPanel` snapshots the template and rows, mounts every page in an off-screen (but laid out)
  `.print-root`, waits via `print-ready.ts` (fonts, images, text settling; 20 s limit with retry /
  print anyway / cancel), then calls `window.print()`. `@page` sets the paper size.
- Duplex alignment has been checked in the browser and PDF output, not on physical printers.

## UI components and styling

Park UI's Solid components with the default neutral theme; recipes live in `src/theme/`.
`ui.tsx` composes them into labelled fields (`Field`, `NumberField`, `ColorField`, `Select`,
`Toggle`, `SegButtons`, `Section`, `Notice`, `PictureControl`). Unlayered rules in `styles.css`
override Panda's layered recipe styles. Phones are `max-width: 600px`; panels stack below 861 px.
Dropdown menus are capped to the viewport width and truncate long options.

## Tests

- `tests/unit/` – CSV parsing, statistics, placeholders, layout maths, colour/picture rules, the
  picture store, side resolvers, template validation, print plans.
- `tests/ui/` – end-to-end tests per area (data, designer, sides, images, fit check, print,
  persistence, layout, mobile). `helpers.ts` has the shared steps; `getElement(page, name, side)`
  reads layers, `setLayerField` targets the selected layer's panel (Width/Height labels also exist
  in Card Settings).
- Tests run against the production build served by `vite preview` on port 4173. Two
  `playwright test` runs at the same time on one machine conflict (shared port and `dist/`).
- The 50,000-row persistence test is slow and can time out under heavy parallel load.
- **Fonts differ between machines.** CI (Ubuntu) renders with DejaVu Sans, which is wider and has
  different line metrics than most desktop fonts, so tests that sit near a threshold pass locally and
  fail on CI. Write tests that measure what they depend on (e.g. the narrowest width at which
  something still fits) or use values well clear of the boundary, and check with
  `CI_FONTS=1 npm test`, which points Chromium at `tests/ci-fonts.conf`.
- Debug hook in the browser: `cardMaker.getTemplate()`, `getEditor()`, `getDataset()`,
  `flushPersist()`, `storage`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: tests, then build and publish to GitHub
Pages. `actions/configure-pages` supplies the base path (`VITE_BASE`, see `vite.config.ts`).

## Documentation screenshots

`npm run screenshots` (config `playwright.screenshots.config.ts`, script
`scripts/screenshots.spec.ts`) builds a demo from the sample data — a colour and a picture per
group — and writes the README images to `docs/screenshots/`. Regenerate them when the UI changes.
