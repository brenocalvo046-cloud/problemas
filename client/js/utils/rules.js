// Constantes/regras de APRESENTAÇÃO. A validação que vale é a do servidor.
export const PASSWORD_LENGTH = 12;
export const CODE_LENGTH = 6;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const isAlnum = (ch) => /^[A-Za-z0-9]$/.test(ch);
export const cleanInput = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function randomPassword() {
  const buf = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => ALNUM[n % ALNUM.length]).join('');
}

/** Melhor status conhecido por tecla: G > O > R. */
export function keyStatuses(guesses) {
  const rank = { R: 1, O: 2, G: 3 };
  const map = {};
  for (const { guess, marks } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i];
      if (!map[ch] || rank[marks[i]] > rank[map[ch]]) map[ch] = marks[i];
    }
  }
  return map;
}

export const countMarks = (marks, m) => [...marks].filter((x) => x === m).length;
