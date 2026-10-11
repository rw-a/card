import { CircleHelp, X } from 'lucide-solid';
import { Portal } from 'solid-js/web';
import * as Dialog from './park/dialog';
import { IconButton, Table } from './ui';

/** How to save a spreadsheet as CSV (also shown on the Data tab). */
export function CsvSteps() {
  return (
    <ul class="csv-help-steps">
      <li>
        <strong>Excel:</strong> choose <em>File → Save As</em> (or <em>Save a Copy</em>), set the file type to{' '}
        <em>CSV UTF-8 (Comma delimited) (.csv)</em>, and save. Only the sheet that is open is saved.
      </li>
      <li>
        <strong>Google Sheets:</strong> choose <em>File → Download → Comma-separated values (.csv)</em>. Only the sheet that is open is downloaded.
      </li>
      <li>
        <strong>Numbers:</strong> choose <em>File → Export To → CSV</em>.
      </li>
      <li>
        <strong>Or skip the file:</strong> select the cells in your spreadsheet (including the column names), copy them, and choose{' '}
        <em>Paste text</em>.
      </li>
    </ul>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Undo / redo', 'Ctrl+Z / Ctrl+Shift+Z (⌘ on a Mac)'],
  ['Move the selected element', 'Arrow keys (Shift: 5 mm, Alt: 0.1 mm)'],
  ['Duplicate / delete', 'Ctrl+D / Delete'],
  ['Deselect', 'Esc'],
  ['Keep proportions when resizing', 'Hold Shift while dragging a corner'],
  ['Move freely without snapping', 'Hold Alt while dragging'],
];

/** The Help button in the top bar and the instructions it opens. */
export default function Help() {
  return (
    <Dialog.Root size="xl" scrollBehavior="inside">
      <Dialog.Trigger asChild={(props) => <IconButton {...props()} variant="plain" size="sm" class="help-button" aria-label="Help" title="Help" />}>
        <CircleHelp aria-hidden="true" />
      </Dialog.Trigger>
      {/* Rendered at the end of the page, so it inherits nothing from the top bar. */}
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content class="help" data-testid="help">
            <Dialog.Header>
              <Dialog.Title>How to use Card Maker</Dialog.Title>
              <Dialog.Description>
                Card Maker turns a spreadsheet of people into printed cards, one card per row. Everything stays in your browser; nothing is uploaded.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body class="help-body">
              <h3>Getting started</h3>
              <ol>
                <li>
                  <strong>Data</strong> — choose your CSV file, or paste cells copied from your spreadsheet. To try Card Maker first, choose{' '}
                  <em>Load sample data</em>.
                </li>
                <li>
                  <strong>Design</strong> — edit the starter card: click an element to change it, drag it to move it, and add text, shapes or
                  pictures.
                </li>
                <li>
                  <strong>Print</strong> — choose the paper and settings, check the preview, then choose <em>Print / Save as PDF</em>.
                </li>
              </ol>

              <h3>Your data</h3>
              <p>
                Card Maker reads a <strong>CSV file</strong>: a spreadsheet saved as plain text. Put the column names in the first row and one person
                per row. Each column becomes a field you can place on the card; each row becomes one card.
              </p>
              <CsvSteps />

              <h3>Designing a card</h3>
              <ul>
                <li>
                  <strong>Text</strong> can mix fixed words with fields, e.g. <code>Cabin {'{{Accommodation}}'}</code>. With <em>Shrink to fit</em>,
                  long values get a smaller font, down to the minimum size you set.
                </li>
                <li>
                  <strong>Colour by field</strong> (shapes and text boxes) gives each value of a column its own colour, e.g. one colour per group.
                </li>
                <li>
                  <strong>Pictures</strong> can be the same on every card, chosen per value of a column, or taken from a column of image addresses.
                  For a picture per value, choose <em>Upload for all values…</em> and select all the files at once: <code>bears.png</code> is matched
                  to “Bears”.
                </li>
                <li>
                  <strong>Fit Check</strong>, below the canvas, fills the card with the shortest, median and longest values in your data. Text that is
                  cut off is outlined in red and named.
                </li>
                <li>
                  <strong>Sides</strong> in Card Settings makes cards double-sided: the same design on both sides, or a different back, edited with
                  the <em>Front / Back</em> switch.
                </li>
              </ul>

              <h3>Keyboard shortcuts</h3>
              <Table.Root class="table small help-shortcuts">
                <Table.Body>
                  {SHORTCUTS.map(([action, keys]) => (
                    <Table.Row>
                      <Table.Cell>{action}</Table.Cell>
                      <Table.Cell>{keys}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>

              <h3>Printing</h3>
              <ul>
                <li>Choose the paper size, orientation, margin and gaps. The summary shows how many cards fit and how many sheets are needed.</li>
                <li>
                  Under <em>What to Print</em>, set the number of copies, or list rows to reprint (e.g. <code>1-10, 14</code>).
                </li>
                <li>
                  In the print dialog, set the scale to <strong>100%</strong>, margins to <strong>None</strong>, and turn on{' '}
                  <strong>Background graphics</strong>. Choose <em>Save as PDF</em> to keep a file.
                </li>
                <li>
                  Double-sided cards print either as <strong>Separate Cutouts</strong> (front beside back, cut out and place back to back) or as{' '}
                  <strong>Duplex Sheets</strong> (fronts on one side of the paper, backs on the other). For duplex, print a test sheet first.
                </li>
              </ul>

              <h3>Saving and sharing</h3>
              <p>
                Your data and design are saved in this browser automatically. Use <em>Export JSON</em> and <em>Import JSON</em> on the Design tab to
                back up a design, move it to another computer or share it.
              </p>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild={(props) => <IconButton {...props()} variant="plain" size="sm" aria-label="Close help" />}>
              <X aria-hidden="true" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
