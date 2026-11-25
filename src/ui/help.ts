import { KEYS } from './commands';

const GESTURES: readonly (readonly [string, string])[] = [
  ['hand up / down', 'pitch'],
  ['hand left / right', 'tone'],
  ['open / close hand', 'loud and bright'],
  ['fist', 'mute'],
  ['second hand up / down', 'volume'],
  ['pinch thumb + finger', 'strike (bell, kalimba)'],
];

function list(title: string, rows: readonly (readonly [string, string])[]): HTMLElement {
  const box = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = title;
  const ul = document.createElement('ul');
  for (const [a, b] of rows) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = a;
    const right = document.createElement('span');
    right.textContent = b;
    li.append(left, right);
    ul.append(li);
  }
  box.append(h, ul);
  return box;
}

export class Help {
  constructor(private readonly root: HTMLElement) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = 'help';
    const body = document.createElement('div');
    body.className = 'panel-body grid';
    body.append(list('hands', GESTURES), list('keys', KEYS));
    const note = document.createElement('p');
    note.className = 'panel-body';
    note.style.color = 'var(--dim)';
    note.textContent = 'camera and audio stay on this device. only anonymous page views are counted.';
    panel.append(title, body, note);
    root.append(panel);
    root.addEventListener('click', (e) => {
      if (e.target === root) this.close();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
  }
}
