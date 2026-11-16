// Nickname check for the public leaderboard. Same shape rule as the client
// (3-16 letters, digits, space, _ or -), plus a filter for slurs and obvious
// abuse. Matching folds case and common letter swaps (0->o, 1->i, 3->e, ...)
// and ignores spaces and punctuation, so "N 1 g g" is caught too.
const SHAPE = /^[A-Za-z0-9 _-]{3,16}$/;

const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i' };

// Substrings blocked anywhere in the folded name.
const BLOCK = [
  'nigg', 'faggot', 'fagot', 'retard', 'kike', 'chink', 'wetback', 'tranny', 'beaner', 'raghead', 'towelhead',
  'hitler', 'nazi', 'kkk', 'rapist', 'molest', 'cunt', 'whore', 'slut', 'pussy', 'fuck', 'shit', 'bitch',
  'twat', 'wank', 'jizz', 'porn', 'killyour',
];
// Whole words only, since as substrings they hit ordinary names
// (Cucumber, Essex, Peacock, Torpedo, Skyscraper, Grape, Nigeria, Raccoon).
const WORDS = [
  'ass', 'fag', 'tit', 'tits', 'nig', 'cum', 'anal', 'sex', 'spic', 'coon', 'paki', 'dick', 'cock', 'rape',
  'niger', 'pedo', 'kys', 'dyke', 'penis', 'vagina', 'gook', 'homo',
];

function fold(s) {
  return s.toLowerCase().split('').map(ch => FOLD[ch] || ch).join('');
}

export function cleanNick(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!SHAPE.test(s)) return null;
  const f = fold(s);
  const squashed = f.replace(/[^a-z]/g, '');
  for (const b of BLOCK) if (squashed.includes(b)) return null;
  const words = f.split(/[^a-z]+/).filter(Boolean);
  for (const w of words) if (WORDS.includes(w)) return null;
  // Squashed name that is exactly a blocked word ("a s s").
  if (WORDS.includes(squashed)) return null;
  return s;
}
