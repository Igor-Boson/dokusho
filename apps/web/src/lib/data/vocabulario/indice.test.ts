/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { IndiceDoHub } from './indice';

const ANTES = '2026-10-20T10:00:00.000Z';

const linha = (parcial: Partial<LinhaVocab>): LinhaVocab => ({
  user_id: 'u1',
  word: '',
  reading: '',
  jmdict_id: null,
  jmdict_ids: null,
  source: 'anki',
  state: 'aprendendo',
  interval_days: 5,
  suspended: false,
  leech: false,
  synced_at: ANTES,
  ja_sei_at: null,
  modified_at: ANTES,
  updated_at: ANTES,
  deleted_at: null,
  ...parcial
});

const HUB = [
  linha({ word: '皆', reading: 'みんな', jmdict_id: 3, jmdict_ids: [3], state: 'conhecida' }),
  linha({ word: '何', reading: 'なに・なん', jmdict_id: 2, jmdict_ids: [2] }),
  linha({ word: '生', reading: 'なま', jmdict_id: 5, jmdict_ids: [5, 6], state: 'conhecida' }),
  linha({ word: '桐生', reading: 'きりゅう', state: 'conhecida' }),
  linha({ word: '雨', reading: 'あめ', jmdict_id: 7, jmdict_ids: [7], deleted_at: ANTES }),
  linha({
    word: '静か',
    reading: 'しずか',
    jmdict_id: 8,
    jmdict_ids: [8],
    source: 'ja_sei',
    state: 'conhecida',
    ja_sei_at: ANTES
  }),
  linha({ word: '食べる', reading: 'たべる', jmdict_id: 9, jmdict_ids: [9], ja_sei_at: ANTES })
];

describe('IndiceDoHub (casamento pela entrada, ADR 0008, 0013)', () => {
  const indice = new IndiceDoHub(HUB);

  it('entrada fora do hub é desconhecida', () => {
    expect(indice.daPalavra({ seq: 99, leitura: 'x' })).toMatchObject({
      estado: 'desconhecida',
      noAnki: false,
      jaSei: false
    });
  });

  it('mesma entrada com qualquer leitura pega o estado do Card e mostra "no Anki como"', () => {
    expect(indice.daPalavra({ seq: 3, leitura: 'みな' })).toMatchObject({
      estado: 'conhecida',
      noAnki: true,
      comoNoAnki: 'みんな'
    });
    expect(indice.daPalavra({ seq: 3, leitura: 'みんな' }).comoNoAnki).toBeUndefined();
  });

  it('leituras do Kaishi juntas com ・ contam uma a uma', () => {
    expect(indice.daPalavra({ seq: 2, leitura: 'なん' })).toMatchObject({
      estado: 'aprendendo',
      comoNoAnki: undefined
    });
  });

  it('Card ligado a mais de uma entrada vale para todas', () => {
    expect(indice.daPalavra({ seq: 6, leitura: 'なま' }).estado).toBe('conhecida');
  });

  it('linha apagada não conta', () => {
    expect(indice.daPalavra({ seq: 7, leitura: 'あめ' }).estado).toBe('desconhecida');
  });

  it('"Já sei" vale para a entrada, com qualquer leitura, e não é "no Anki"', () => {
    expect(indice.daPalavra({ seq: 8, leitura: 'しずか' })).toMatchObject({
      estado: 'conhecida',
      noAnki: false,
      jaSei: true
    });
  });

  it('"Já sei" numa Palavra do Anki aprendendo: conhecida', () => {
    expect(indice.daPalavra({ seq: 9, leitura: 'たべる' })).toMatchObject({
      estado: 'conhecida',
      noAnki: true,
      estadoNoAnki: 'aprendendo',
      jaSei: true
    });
  });

  it('Card sem entrada casa pela escrita (forma de dicionário do texto)', () => {
    expect(indice.daPedaco(undefined, '桐生')).toBe('conhecida');
    expect(indice.daPedaco(undefined, '小柳')).toBe('desconhecida');
    expect(indice.daPedaco({ seq: 3, leitura: 'みな' }, '皆')).toBe('conhecida');
  });

  it('linhas de uma entrada (para desfazer o "Já sei")', () => {
    expect(indice.linhasDaEntrada(8).map((l) => l.word)).toEqual(['静か']);
    expect(indice.linhasDaEntrada(7)).toEqual([]);
  });

  it('entradas no Anki (para a importação inicial pular)', () => {
    expect([...indice.entradasNoAnki()].sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 9]);
  });
});
