/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { Entrada } from '$lib/data/dicionario/formato';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import {
  desfazerImportacao,
  importacoes,
  jaSeiPorFrequencia,
  posicaoNaFrequencia
} from './importacao';

const AGORA = '2026-10-22T10:00:00.000Z';
const ANTES = '2026-10-20T10:00:00.000Z';

const entrada = (seq: number, formas: Entrada['formas'], t = ['n']): Entrada => ({
  id: seq,
  seq,
  formas,
  sentidos: [{ t, g: ['x'] }]
});

const linha = (parcial: Partial<LinhaVocab>): LinhaVocab => ({
  user_id: 'u1',
  word: '',
  reading: '',
  jmdict_id: null,
  jmdict_ids: null,
  source: 'ja_sei',
  state: 'conhecida',
  interval_days: null,
  suspended: false,
  leech: false,
  synced_at: null,
  ja_sei_at: ANTES,
  modified_at: ANTES,
  updated_at: ANTES,
  deleted_at: null,
  ...parcial
});

describe('posicaoNaFrequencia', () => {
  it('a melhor posição do JPDB entre as formas, escrita ou em kana', () => {
    expect(posicaoNaFrequencia(entrada(1, [{ e: '分かる', l: 'わかる', f: 300, fk: 40 }]))).toBe(
      40
    );
    expect(posicaoNaFrequencia(entrada(2, [{ e: '雨', l: 'あめ' }]))).toBe(Infinity);
  });
});

describe('jaSeiPorFrequencia (importação inicial, ADR 0007)', () => {
  const ENTRADAS = [
    entrada(1, [{ e: '分かる', l: 'わかる', f: 300, fk: 40 }], ['v5r']),
    entrada(2, [{ e: '雨', l: 'あめ', f: 900 }]),
    entrada(3, [{ e: 'は', l: 'は', fk: 1 }], ['prt']),
    entrada(4, [{ e: '食べる', l: 'たべる', f: 200 }], ['v1']),
    entrada(5, [{ e: '生', l: 'なま', f: 1500 }]),
    entrada(6, [{ e: '生', l: 'なま', f: 1600 }]),
    entrada(7, [{ e: '静か', l: 'しずか', f: 800 }], ['adj-na'])
  ];

  it('marca as entradas até a posição N, sem gramática, na forma mais frequente', () => {
    const linhas = jaSeiPorFrequencia(ENTRADAS, 1000, new Set(), [], AGORA);

    expect(linhas.map((l) => [l.word, l.reading, l.jmdict_ids])).toEqual([
      ['わかる', 'わかる', [1]],
      ['雨', 'あめ', [2]],
      ['食べる', 'たべる', [4]],
      ['静か', 'しずか', [7]]
    ]);
    expect(linhas[0]).toMatchObject({ source: 'ja_sei', state: 'conhecida', ja_sei_at: AGORA });
  });

  it('pula as entradas que estão no Anki e as Palavras que já estão no hub', () => {
    const atuais = [linha({ word: '雨', reading: 'あめ', jmdict_ids: [2] })];
    const linhas = jaSeiPorFrequencia(ENTRADAS, 1000, new Set([4]), atuais, AGORA);

    expect(linhas.map((l) => l.word)).toEqual(['わかる', '静か']);
  });

  it('linha apagada é marcada de novo', () => {
    const atuais = [linha({ word: '雨', reading: 'あめ', deleted_at: ANTES })];

    expect(
      jaSeiPorFrequencia(ENTRADAS, 1000, new Set(), atuais, AGORA).map((l) => l.word)
    ).toContain('雨');
  });

  it('duas entradas com a mesma forma viram uma linha com as duas', () => {
    const linhas = jaSeiPorFrequencia(ENTRADAS, 2000, new Set(), [], AGORA);

    expect(linhas.find((l) => l.word === '生')).toMatchObject({ jmdict_id: 5, jmdict_ids: [5, 6] });
  });
});

describe('importacoes e desfazerImportacao', () => {
  const hub = [
    ...Array.from({ length: 3 }, (_, i) => linha({ word: `a${i}`, ja_sei_at: AGORA })),
    linha({ word: 'b', ja_sei_at: ANTES }),
    linha({ word: 'c', ja_sei_at: AGORA, deleted_at: AGORA }),
    linha({ word: 'd', source: 'anki', state: 'aprendendo', ja_sei_at: AGORA })
  ];

  it('agrupa os "Já sei" pelo horário; só grupos a partir do mínimo contam como importação', () => {
    expect(importacoes(hub, 2)).toEqual([{ quando: AGORA, palavras: 3 }]);
  });

  it('desfazer apaga as linhas só ja_sei daquele horário', () => {
    const desfeitas = desfazerImportacao(hub, AGORA, '2026-10-23T00:00:00.000Z');

    expect(desfeitas.map((l) => l.word)).toEqual(['a0', 'a1', 'a2']);
    expect(desfeitas[0]).toMatchObject({ deleted_at: '2026-10-23T00:00:00.000Z', ja_sei_at: null });
  });
});
