import { reducedMotion } from './theme';

// Terminal-style boot log. Every line reports something real: the model download
// percentage is measured, and nothing says "ok" before it is.

type State = 'ok' | 'wait' | 'err' | 'plain';

interface Line {
  id: string;
  label: string;
  text: string;
  state: State;
}

const WIDTH = 32;
const SEEN_KEY = 'thereminal.booted';

export class Boot {
  private readonly lines: Line[] = [];
  private revealed = 0;
  private readonly log: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    onStart: () => void,
  ) {
    const log = root.querySelector<HTMLElement>('#boot-log');
    if (!log) throw new Error('missing boot log');
    this.log = log;
    root.addEventListener('click', onStart);
  }

  /** Adds or updates a line. */
  set(id: string, label: string, text = '', state: State = 'plain'): void {
    const line = this.lines.find((l) => l.id === id);
    if (line) Object.assign(line, { label, text, state });
    else this.lines.push({ id, label, text, state });
    this.render();
  }

  /** First visit: lines appear one by one. After that the log is simply there. */
  start(): void {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // storage unavailable, treat as a first visit
    }
    if (seen || reducedMotion()) {
      this.revealed = Infinity;
      this.render();
      return;
    }
    const step = (): void => {
      this.revealed++;
      this.render();
      if (this.revealed < this.lines.length) setTimeout(step, 110);
      else this.revealed = Infinity;
    };
    step();
  }

  hide(): void {
    this.root.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // not being able to remember is fine
    }
  }

  private render(): void {
    this.log.replaceChildren();
    const shown = this.lines.slice(0, this.revealed);
    shown.forEach((line, i) => {
      const row = document.createElement('div');
      const dots = line.text ? ` ${'.'.repeat(Math.max(3, WIDTH - line.label.length))} ` : '';
      row.append(`> ${line.label}${dots}`);
      if (line.text) {
        const status = document.createElement('span');
        if (line.state !== 'plain') status.className = line.state;
        status.textContent = line.text;
        row.append(status);
      }
      if (i === shown.length - 1) {
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        row.append(cursor);
      }
      this.log.append(row);
    });
  }
}
