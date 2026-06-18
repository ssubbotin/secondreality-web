/**
 * Dev-only part selector: lists all 20 Second Reality parts (canonical MAIN/PARTS order). Implemented
 * parts are one-click links to `?effect=<id>` (a full reload re-mounts that effect); unimplemented parts
 * are greyed and inert. Purely a lab convenience — not shipped in the eventual sequenced demo.
 */

interface Part {
  /** Running-order number (1..20). */
  n: number;
  name: string;
  /** The `?effect=` value if implemented, else null (inactive). */
  effect: string | null;
}

const PARTS: readonly Part[] = [
  { n: 1, name: 'Opening texts I', effect: 'alku1' },
  { n: 2, name: 'Opening texts II', effect: null },
  { n: 3, name: 'Opening texts III', effect: null },
  { n: 4, name: 'Glenz vectors', effect: 'glenz' },
  { n: 5, name: 'Dot tunnel', effect: 'dottunnel' },
  { n: 6, name: 'Techno bars', effect: 'techno' },
  { n: 7, name: 'Panic fake', effect: 'panic' },
  { n: 8, name: 'Vector I — Space battle', effect: null },
  { n: 9, name: 'Mirror-ball water scroll', effect: null },
  { n: 10, name: 'Desert Dream stars', effect: 'ddstars' },
  { n: 11, name: 'Lens', effect: 'lens' },
  { n: 12, name: 'Rotozoomer', effect: 'rotozoomer' },
  { n: 13, name: 'Plasma', effect: 'plasma' },
  { n: 14, name: 'Plasmacube', effect: 'plasmacube' },
  { n: 15, name: 'MiniVectorBalls', effect: 'minivectorballs' },
  { n: 16, name: 'Mountain scroller', effect: 'forest' },
  { n: 17, name: '3D Sinus field', effect: 'comanche' },
  { n: 18, name: 'Vector II — City', effect: null },
  { n: 19, name: 'End picture flash', effect: 'endpic' },
  { n: 20, name: 'Credits / greetings', effect: null },
];

export interface PartsMenu {
  /** Move the active highlight to `id` (no rebuild). */
  setActive(id: string): void;
  /** Remove the panel (HMR teardown). */
  remove(): void;
}

/**
 * Build the selector panel and append it. Implemented parts are clickable: a click calls `onSelect`
 * (no navigation/reload). Returns a handle to move the highlight and tear the panel down.
 */
export function renderPartsMenu(current: string, onSelect: (id: string) => void): PartsMenu {
  document.getElementById('parts')?.remove(); // avoid duplicates on HMR re-run
  const panel = document.createElement('div');
  panel.id = 'parts';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    font: '11px/1.5 monospace',
    background: 'rgba(0,0,0,.6)',
    padding: '6px 9px',
    color: '#666',
    zIndex: '10',
    userSelect: 'none',
  });

  // id -> its row element, so setActive can restyle without rebuilding.
  const rows = new Map<string, HTMLElement>();

  for (const p of PARTS) {
    const label = `${String(p.n).padStart(2, '0')} ${p.name}`;
    if (p.effect) {
      const id = p.effect;
      const a = document.createElement('a');
      a.href = `?effect=${id}`;
      a.textContent = label;
      a.style.display = 'block';
      a.style.textDecoration = 'none';
      a.style.cursor = 'pointer';
      a.addEventListener('click', (e) => {
        e.preventDefault(); // in-app switch, no reload
        onSelect(id);
      });
      rows.set(id, a);
      panel.appendChild(a);
    } else {
      const row = document.createElement('div');
      row.textContent = label;
      row.style.color = '#555';
      panel.appendChild(row);
    }
  }

  const setActive = (id: string) => {
    for (const [rowId, el] of rows) {
      const active = rowId === id;
      el.style.color = active ? '#0f0' : '#39c';
      el.style.fontWeight = active ? 'bold' : 'normal';
    }
  };
  setActive(current);

  document.body.appendChild(panel);
  return { setActive, remove: () => panel.remove() };
}
