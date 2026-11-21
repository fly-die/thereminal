import type { Choice, Entry } from './commands';

// Command palette with two levels, so it never shows one long list.
//   level 1: settings grouped into sections, each with its current value
//   level 2: the options of one setting, the current one marked
// Typing on level 1 searches every option of every setting at once.
// Choosing something returns to level 1 instead of closing, escape closes.

interface Row {
  /** Section or setting name shown as a small heading above the first row of a group. */
  head: string;
  title: string;
  value: string;
  key: string;
  /** undefined on level 1 rows, which have no "current" marker. */
  active?: boolean;
  /** Opens a second level instead of running. */
  opens?: Entry;
  /** The setting this row belongs to, so the palette can return to it. */
  owner?: Entry;
  closes?: boolean;
  run?(): void;
}

export class Palette {
  private readonly crumb = document.createElement('span');
  private readonly input = document.createElement('input');
  private readonly list = document.createElement('ul');
  private readonly foot = document.createElement('div');
  private rows: Row[] = [];
  private selected = 0;
  private parent: Entry | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly entries: readonly Entry[],
  ) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = 'commands';
    const body = document.createElement('div');
    body.className = 'panel-body';
    const field = document.createElement('div');
    field.className = 'field';
    this.crumb.className = 'crumb';
    this.input.type = 'text';
    this.input.setAttribute('aria-label', 'search commands');
    this.input.spellcheck = false;
    this.foot.className = 'foot';
    field.append(this.crumb, this.input);
    body.append(field, this.list, this.foot);
    panel.append(title, body);
    root.append(panel);

    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('click', (e) => {
      if (e.target === root) this.close();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.enter(null);
    this.input.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.input.blur();
  }

  /**
   * Moves to a setting's options, or back to the first level with null.
   * @param focus the setting to land on when returning to the first level
   */
  private enter(parent: Entry | null, focus: Entry | null = this.parent): void {
    const from = focus;
    this.parent = parent;
    this.input.value = '';
    this.refresh();
    if (parent) {
      // Start on the current value, that is where the eye expects to be.
      const current = this.rows.findIndex((r) => r.active);
      this.selected = Math.max(0, current);
    } else if (from) {
      // Coming back: stay on the setting that was open.
      this.selected = Math.max(0, this.rows.findIndex((r) => r.opens === from || r.owner === from));
    }
    this.render();
  }

  private choiceRow(owner: Entry, choice: Choice, head: string): Row {
    return {
      owner,
      head,
      title: choice.title,
      value: '',
      key: choice.key ?? '',
      active: choice.active(),
      run: choice.run,
    };
  }

  private refresh(): void {
    const terms = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text: string): boolean => terms.every((t) => text.toLowerCase().includes(t));
    const { parent } = this;

    const entryRow = (e: Entry): Row => ({
      head: e.section,
      title: e.title,
      value: e.value?.() ?? '',
      key: e.key ?? '',
      opens: e.choices ? e : undefined,
      owner: e,
      closes: e.closes,
      run: e.run,
    });

    if (parent?.choices) {
      this.rows = parent
        .choices()
        .filter((c) => matches(c.title))
        .map((c) => this.choiceRow(parent, c, ''));
    } else if (terms.length === 0) {
      this.rows = this.entries.map(entryRow);
    } else {
      // Search: settings whose name matches, then single options, grouped by setting.
      this.rows = this.entries.filter((e) => matches(e.title)).map(entryRow);
      for (const e of this.entries) {
        for (const c of e.choices?.() ?? []) {
          if (matches(`${e.title} ${c.title}`) && !matches(e.title)) {
            this.rows.push(this.choiceRow(e, c, e.title));
          }
        }
      }
    }
    this.selected = 0;
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    const row = this.rows[this.selected];
    const empty = this.input.value === '';
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const n = this.rows.length;
        if (n) this.selected = (this.selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        this.render();
        break;
      }
      case 'ArrowRight':
        if (empty && row?.opens) {
          e.preventDefault();
          this.enter(row.opens);
        }
        break;
      case 'ArrowLeft':
      case 'Backspace':
        if (empty && this.parent) {
          e.preventDefault();
          this.enter(null);
        }
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation(); // enter must not also restart the boot prompt
        this.activate(row);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (this.parent) this.enter(null);
        else this.close();
        break;
    }
  }

  private activate(row: Row | undefined): void {
    if (!row) return;
    if (row.opens) {
      this.enter(row.opens);
      this.input.focus();
      return;
    }
    row.run?.();
    if (row.closes) {
      this.close();
      return;
    }
    // Stay in the menu: someone changing one setting often wants to change another.
    this.enter(null, row.owner ?? null);
    this.input.focus();
  }

  private render(): void {
    this.crumb.textContent = this.parent ? `${this.parent.title} /` : '>';
    this.input.placeholder = this.parent ? 'filter' : 'search settings';
    this.foot.textContent = this.parent
      ? 'enter select   esc back'
      : 'enter open   esc done   type to search everything';

    this.list.replaceChildren();
    if (this.rows.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'no match';
      this.list.append(empty);
      return;
    }
    let head = '';
    this.rows.forEach((row, i) => {
      if (row.head && row.head !== head) {
        head = row.head;
        const li = document.createElement('li');
        li.className = 'head';
        li.textContent = head;
        this.list.append(li);
      }
      const li = document.createElement('li');
      li.className = 'item';
      li.setAttribute('aria-selected', String(i === this.selected));
      if (row.active !== undefined) {
        li.dataset.active = String(row.active);
        const mark = document.createElement('span');
        mark.className = 'mark';
        li.append(mark);
      }
      const title = document.createElement('span');
      title.textContent = row.title;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = row.opens ? `${row.value}  >` : row.value;
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = row.key;
      li.append(title, value, key);
      li.addEventListener('click', () => this.activate(row));
      this.list.append(li);
      if (i === this.selected) li.scrollIntoView({ block: 'nearest' });
    });
  }
}
