import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, normalizeSecret, tally, sanitizeNick, normalizeCode } from '../server/rules.js';

test('evaluate: tudo certo', () => {
  assert.equal(evaluate('SENHASECRETA', 'SENHASECRETA'), 'GGGGGGGGGGGG');
});

test('evaluate: verde, laranja e vermelho', () => {
  assert.equal(evaluate('SEGREDOSENHA', 'SENHASECRETA'), 'GGROORROOOOG');
  assert.equal(evaluate('ZZZZZZZZZZZZ', 'SENHASECRETA'), 'RRRRRRRRRRRR');
});

test('evaluate: letras repetidas só contam o que a senha realmente tem', () => {
  // senha tem 1 "A" e 11 "B"; a tentativa tem vários "A"
  assert.equal(evaluate('AAAAAAAAAAAA', 'ABBBBBBBBBBB'), 'GRRRRRRRRRRR');
  assert.equal(evaluate('BAAAAAAAAAAA', 'ABBBBBBBBBBB'), 'OORRRRRRRRRR');
});

test('normalizeSecret: exatamente 12, só A-Z/0-9, maiúsculas', () => {
  assert.equal(normalizeSecret('abc123def456'), 'ABC123DEF456');
  assert.equal(normalizeSecret(' abc123def456 '), 'ABC123DEF456');
  assert.equal(normalizeSecret('abc123def45'), null);
  assert.equal(normalizeSecret('abc123def4567'), null);
  assert.equal(normalizeSecret('abc123def45!'), null);
  assert.equal(normalizeSecret('abc123def45ç'), null);
  assert.equal(normalizeSecret('ßabc123def45'), null); // truque Unicode
  assert.equal(normalizeSecret(123456789012), null);
  assert.equal(normalizeSecret(null), null);
});

test('tally soma verdes, laranjas e vermelhos', () => {
  const t = tally([{ marks: 'GGGGGGGGGGGR' }, { marks: 'OOORRRRRRRRR' }]);
  assert.deepEqual(t, { attempts: 2, green: 11, orange: 3, red: 10 });
});

test('sanitizeNick / normalizeCode', () => {
  assert.equal(sanitizeNick('  <b>João</b>   Silva  '), 'bJoãob Silva');
  assert.ok(!/[<>]/.test(sanitizeNick('<script>')));
  assert.equal(sanitizeNick(''), 'Jogador');
  assert.equal(sanitizeNick('x'.repeat(50)).length, 16);
  assert.equal(normalizeCode(' ab-12 cd '), 'AB12CD');
});
