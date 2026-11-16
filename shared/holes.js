// Hand-made holes for v0.1. Format: docs/CONTRACT.md.

const W = '##################';

function rows(spec) {
  const out = [];
  for (const [str, count] of spec) for (let i = 0; i < count; i++) out.push(str);
  return out;
}

export const TEST_HOLES = [
  {
    id: 'test-1',
    par: 2,
    cols: 18,
    rows: 29,
    // Straight lane with two posts to steer round.
    tiles: rows([
      [W, 1],
      ['#####........#####', 27],
      [W, 1],
    ]),
    walls: [],
    bumpers: [
      { x: 72, y: 150, r: 4 },
      { x: 108, y: 105, r: 4 },
    ],
    tee: { x: 90, y: 255 },
    cup: { x: 90, y: 35 },
  },
  {
    id: 'test-2',
    par: 2,
    cols: 18,
    rows: 29,
    // L: up the left leg, bank off the angled corner, along the top past a
    // slope pushing right and sand under the cup.
    tiles: rows([
      [W, 2],
      ['#........>>>.....#', 5],
      ['#........>>>ssss.#', 3],
      ['#.......##########', 18],
      [W, 1],
    ]),
    walls: [{ x1: 10, y1: 60, x2: 50, y2: 20 }],
    bumpers: [],
    tee: { x: 40, y: 260 },
    cup: { x: 145, y: 45 },
  },
];
