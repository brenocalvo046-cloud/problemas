// Regras puras do jogo (sem rede, sem estado). Fáceis de testar.
import config from './config.js';

export const PASSWORD_LENGTH = config.passwordLength;

const PASSWORD_RE = new RegExp(`^[A-Za-z0-9]{${PASSWORD_LENGTH}}$`);
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Valida e normaliza uma senha/tentativa. Retorna a string em MAIÚSCULAS ou null.
 * A regex roda ANTES do toUpperCase para impedir truques de Unicode (ex.: "ß" → "SS").
 */
export function normalizeSecret(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return PASSWORD_RE.test(s) ? s.toUpperCase() : null;
}

/**
 * Compara a tentativa com a senha secreta, caractere a caractere.
 * G = certo na posição · O = existe em outra posição · R = não existe.
 * Respeita repetições (estilo Wordle): cada letra da senha só "paga" uma vez.
 */
export function evaluate(guess, secret) {
  const n = secret.length;
  const marks = new Array(n).fill('R');
  const remaining = Object.create(null);

  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) marks[i] = 'G';
    else remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (marks[i] === 'G') continue;
    if (remaining[guess[i]] > 0) {
      marks[i] = 'O';
      remaining[guess[i]] -= 1;
    }
  }
  return marks.join('');
}

export function tally(guesses) {
  const out = { attempts: guesses.length, green: 0, orange: 0, red: 0 };
  for (const { marks } of guesses) {
    for (const m of marks) {
      if (m === 'G') out.green++;
      else if (m === 'O') out.orange++;
      else out.red++;
    }
  }
  return out;
}

export function sanitizeNick(value) {
  if (typeof value !== 'string') return 'Jogador';
  const clean = value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, config.maxNickLength);
  return clean || 'Jogador';
}

export function normalizeCode(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
