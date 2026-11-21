import type { Command } from './commands';

/** Command palette: type to filter, arrows to move, enter to run. */
export class Palette {
  private readonly input = document.createElement('input');
  private readonly list = document.createElement('ul');
  private matches: Command[] = [];
  private selected = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly commands: readonly Command[],
  ) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = 'commands';
    const body = document.createElement('div');
    body.className = 'panel-body';
    this.input.type = 'text';
    this.input.placeholder = 'preset, scale, key, camera ...';
    this.input.setAttribute('aria-label', 'search commands');
    this.input.spellcheck = false;
    body.append(this.input, this.list);
    panel.append(title, body);
    root.append(panel);

    this.input.addEventListener('input', () => this.filter());
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
    this.input.value = '';
    this.filter();
    this.input.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.input.blur();
  }

  private filter(): void {
    const terms = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
    this.matches = this.commands.filter((c) => {
      const text = `${c.group} ${c.title}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
    this.selected = 0;
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.matches.length;
      if (n) this.selected = (this.selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // enter must not also restart the boot prompt
      this.run(this.matches[this.selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  private run(command: Command | undefined): void {
    if (!command) return;
    this.close();
    command.run();
  }

  private render(): void {
    this.list.replaceChildren();
    if (this.matches.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'no match';
      this.list.append(empty);
      return;
    }
    this.matches.forEach((command, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(i === this.selected));
      const group = document.createElement('span');
      group.className = 'group';
      group.textContent = command.group;
      const title = document.createElement('span');
      title.textContent = command.title;
      li.append(group, title);
      if (command.key) {
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = command.key;
        li.append(key);
      }
      li.addEventListener('click', () => this.run(command));
      this.list.append(li);
      if (i === this.selected) li.scrollIntoView({ block: 'nearest' });
    });
  }
}
