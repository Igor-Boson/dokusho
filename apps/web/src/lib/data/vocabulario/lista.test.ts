/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { contarPorFiltro, filtrarHub } from './lista';

const ANTES = '2026-10-20T10:00:00.000Z';
const linha = (parcial: Partial<LinhaVocab>): LinhaVocab => ({
  user_id: 'u1',
  word: '',
  reading: '',
  jmdict_id: null,
  jmdict_ids: null,
  source: 'anki',
  state: 'conhecida',
  interval_days: 30,
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
  linha({ word: '雨', reading: 'あめ', modified_at: '2026-10-21T00:00:00Z' }),
  linha({ word: '食べる', reading: 'たべる', state: 'aprendendo' }),
  linha({ word: '皆', reading: 'みな', source: 'ja_sei', ja_sei_at: ANTES }),
  linha({ word: '何', reading: 'なに', state: 'aprendendo', ja_sei_at: ANTES }),
  linha({ word: '静か', reading: 'しずか', deleted_at: ANTES })
];

describe('filtrarHub (tela Vocabulário)', () => {
  it('conhecidas pelo estado da Palavra ("Já sei" incluído), mais recentes primeiro', () => {
    expect(filtrarHub(HUB, 'conhecida', '').map((l) => l.word)).toEqual(['雨', '皆', '何']);
  });

  it('aprendendo só pelo estado da Palavra', () => {
    expect(filtrarHub(HUB, 'aprendendo', '').map((l) => l.word)).toEqual(['食べる']);
  });

  it('"Já sei": as linhas com a marca', () => {
    expect(filtrarHub(HUB, 'ja-sei', '').map((l) => l.word)).toEqual(['皆', '何']);
  });

  it('busca pela escrita ou pela leitura, em hiragana ou katakana', () => {
    expect(filtrarHub(HUB, 'conhecida', 'アメ').map((l) => l.word)).toEqual(['雨']);
    expect(filtrarHub(HUB, 'aprendendo', '食').map((l) => l.word)).toEqual(['食べる']);
  });

  it('conta cada filtro sem as apagadas', () => {
    expect(contarPorFiltro(HUB)).toEqual({ conhecida: 3, aprendendo: 1, 'ja-sei': 2 });
  });
});
