import { For, Show, createMemo, createSignal } from 'solid-js';
import { ArrowRight, Upload } from 'lucide-solid';
import { SAMPLE_CSV, parseCsv, readFileAsText } from '../lib/csv';
import { columnStats } from '../lib/stats';
import { dataset, ignoreEmpty, setDataset, setIgnoreEmpty, setTab, usedColumns } from '../lib/store';
import Brand from './Brand';
import { Section, Switch, Button, Textarea, Notice, Badge, Table, Heading, Disclosure } from './ui';

/** Spreadsheet files that must be saved as CSV first (they are binary, not text). */
const SPREADSHEET_FILE = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i;

export default function DataPanel() {
  const [warnings, setWarnings] = createSignal<string[]>([]);
  const [dragOver, setDragOver] = createSignal(false);
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [pasteText, setPasteText] = createSignal('');
  const [csvHelpOpen, setCsvHelpOpen] = createSignal(false);
  let fileInput!: HTMLInputElement;

  /** A spreadsheet file instead of a CSV: say what to do, and show how. */
  function rejectSpreadsheet(name: string) {
    setWarnings([`“${name}” is a spreadsheet file, not a CSV file. Save it as CSV first, or copy the cells and use Paste text.`]);
    setCsvHelpOpen(true);
  }

  async function loadFile(file: File) {
    if (SPREADSHEET_FILE.test(file.name)) return rejectSpreadsheet(file.name);
    try {
      const text = await readFileAsText(file);
      // Text files never contain NUL characters; spreadsheet files (whatever their name) do.
      if (text.includes('\u0000')) return rejectSpreadsheet(file.name);
      loadText(text, file.name);
    } catch (e) {
      setWarnings([`Could not read ${file.name}: ${(e as Error).message}`]);
    }
  }

  function loadText(text: string, name: string) {
    const { dataset: ds, warnings: w } = parseCsv(text, name);
    setWarnings(w);
    if (ds.headers.length > 0) {
      setDataset(ds);
    }
  }

  /** The warnings describe the loaded file, so they go with it. */
  function removeData() {
    setDataset(null);
    setWarnings([]);
  }

  const stats = createMemo(() => {
    const ds = dataset();
    if (!ds) return [];
    return ds.headers.map((h) => columnStats(ds.rows, h, ignoreEmpty()));
  });

  const previewRows = createMemo(() => dataset()?.rows.slice(0, 8) ?? []);

  return (
    <div class="panel-scroll">
      <div class="data-layout">
        <Brand class="brand-page" testId="brand-page" />
        <div
          class="dropzone"
          classList={{ over: dragOver() }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer?.files?.[0];
            if (f) void loadFile(f);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void loadFile(f);
              e.currentTarget.value = '';
            }}
          />
          <div class="dropzone-icon" aria-hidden="true">
            <Upload size={40} />
          </div>
          <Heading as="h2" textStyle="xl" color="fg.default">
            Drop Your CSV Here
          </Heading>
          <p class="muted">
            A CSV file is a spreadsheet saved as plain text. Its first row holds the column names (e.g. <code>Name, Accommodation, Group</code>), and
            each row after that becomes one card. Nothing is uploaded anywhere — everything stays in your browser.
          </p>
          <div class="row gap">
            <Button size="md" class="btn primary" onClick={() => fileInput.click()}>
              Choose file…
            </Button>
            <Button variant="outline" size="md" class="btn" onClick={() => setPasteOpen((v) => !v)}>
              Paste text
            </Button>
            <Button variant="outline" size="md" class="btn" onClick={() => loadText(SAMPLE_CSV, 'sample-data.csv')}>
              Load sample data
            </Button>
          </div>
          <Disclosure label="How do I make a CSV file?" class="csv-help" open={csvHelpOpen()} onOpenChange={setCsvHelpOpen} data-testid="csv-help">
            <ul class="csv-help-steps">
              <li>
                <strong>Excel:</strong> choose <em>File → Save As</em> (or <em>Save a Copy</em>), set the file type to{' '}
                <em>CSV UTF-8 (Comma delimited) (.csv)</em>, and save. Only the sheet that is open is saved.
              </li>
              <li>
                <strong>Google Sheets:</strong> choose <em>File → Download → Comma-separated values (.csv)</em>. Only the sheet that is open is
                downloaded.
              </li>
              <li>
                <strong>Numbers:</strong> choose <em>File → Export To → CSV</em>.
              </li>
              <li>
                <strong>Or skip the file:</strong> select the cells in your spreadsheet (including the column names), copy them, and choose{' '}
                <em>Paste text</em>.
              </li>
            </ul>
          </Disclosure>
          <Show when={pasteOpen()}>
            {/* Only keeps clicks inside the box from reaching the drop zone behind it; not an interaction of its own. */}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div class="paste-box" onClick={(e) => e.stopPropagation()}>
              <Textarea
                class="input"
                rows={8}
                placeholder={'Name,Accommodation,Group\nAda Lovelace,Cabin 3,Otters'}
                value={pasteText()}
                onInput={(e) => setPasteText(e.currentTarget.value)}
              />
              <div class="row gap">
                <Button
                  size="md"
                  class="btn primary"
                  disabled={!pasteText().trim()}
                  onClick={() => {
                    loadText(pasteText(), 'pasted.csv');
                    setPasteOpen(false);
                  }}
                >
                  Use this data
                </Button>
                <Button variant="outline" size="md" class="btn" onClick={() => setPasteOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Show>
        </div>

        <Show when={warnings().length > 0}>
          <Notice warning class="notice warn">
            <strong>Heads up:</strong>
            <ul>
              <For each={warnings()}>{(w) => <li>{w}</li>}</For>
            </ul>
          </Notice>
        </Show>

        <Show when={dataset()}>
          {(ds) => (
            <>
              <Section
                title={`${ds().fileName} — ${ds().rows.length} ${ds().rows.length === 1 ? 'Person' : 'People'}, ${ds().headers.length} Columns`}
                actions={
                  <div class="row gap">
                    <Button variant="outline" size="md" class="btn" onClick={removeData}>
                      Remove data
                    </Button>
                    <Button size="md" class="btn primary" onClick={() => setTab('design')}>
                      Design the badge <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                }
              >
                <p class="muted small">
                  Columns used by the current template:{' '}
                  <Show when={usedColumns().length > 0} fallback={<em>none yet</em>}>
                    <For each={usedColumns()}>
                      {(c) => (
                        <Badge class={ds().headers.includes(c) ? 'chip' : 'chip missing'} colorPalette={ds().headers.includes(c) ? 'gray' : 'red'}>
                          {c}
                        </Badge>
                      )}
                    </For>
                  </Show>
                  <Show when={usedColumns().some((c) => !ds().headers.includes(c))}>
                    {' '}
                    <span class="warn-text">Red columns are referenced by the template but do not exist in this file — fix them in Design.</span>
                  </Show>
                </p>
                <div class="table-wrap">
                  <Table.Root class="table">
                    <Table.Head>
                      <Table.Row>
                        <Table.Header class="idx">#</Table.Header>
                        <For each={ds().headers}>{(h) => <Table.Header>{h}</Table.Header>}</For>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      <For each={previewRows()}>
                        {(r, i) => (
                          <Table.Row>
                            <Table.Cell class="idx">{i() + 1}</Table.Cell>
                            <For each={ds().headers}>{(h) => <Table.Cell>{r[h]}</Table.Cell>}</For>
                          </Table.Row>
                        )}
                      </For>
                      <Show when={ds().rows.length > previewRows().length}>
                        <Table.Row>
                          <Table.Cell class="idx muted">…</Table.Cell>
                          <Table.Cell colSpan={ds().headers.length} class="muted">
                            and {ds().rows.length - previewRows().length} more
                          </Table.Cell>
                        </Table.Row>
                      </Show>
                    </Table.Body>
                  </Table.Root>
                </div>
              </Section>

              <Section
                title="Text Length per Column"
                actions={
                  <Switch
                    checked={ignoreEmpty()}
                    onChange={setIgnoreEmpty}
                    label="Ignore empty cells"
                    title="When off, an empty cell counts as the shortest value"
                  />
                }
              >
                <p class="muted small">
                  These are the values the <strong>Shortest</strong>, <strong>Median</strong> and <strong>Longest</strong> previews use. Each column
                  is picked independently, so the "longest" card combines the longest value of every field at once — the worst case for your layout.
                </p>
                <div class="table-wrap">
                  <Table.Root class="table stats">
                    <Table.Head>
                      <Table.Row>
                        <Table.Header>Column</Table.Header>
                        <Table.Header>Shortest</Table.Header>
                        <Table.Header>Median</Table.Header>
                        <Table.Header>Longest</Table.Header>
                        <Table.Header class="num-col">Empty</Table.Header>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      <For each={stats()}>
                        {(s) => (
                          <Table.Row class={usedColumns().includes(s.column) ? 'used' : undefined}>
                            <Table.Cell>
                              <strong>{s.column}</strong>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.shortest || <em class="muted">(empty)</em>}</span> <span class="len">{s.minLen}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.median || <em class="muted">(empty)</em>}</span> <span class="len">{s.medianLen}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.longest || <em class="muted">(empty)</em>}</span> <span class="len">{s.maxLen}</span>
                            </Table.Cell>
                            <Table.Cell class="num-col">{s.empty}</Table.Cell>
                          </Table.Row>
                        )}
                      </For>
                    </Table.Body>
                  </Table.Root>
                </div>
              </Section>
            </>
          )}
        </Show>

        <Show when={!dataset()}>
          <Notice class="notice tip" data-testid="data-tip">
            <span class="tip-body">
              <span>
                <strong>Tip:</strong> you can start designing without data — the template will show placeholder field names until a CSV is loaded.
              </span>
              <Button variant="outline" size="xs" class="btn small" onClick={() => setTab('design')}>
                Go to Design <ArrowRight aria-hidden="true" />
              </Button>
            </span>
          </Notice>
        </Show>
      </div>
    </div>
  );
}
