/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { csvDoHub, nomeDoCsv } from './csv';

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

const linhasDoCsv = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n');

describe('CSV do hub (V3.3)', () => {
  it('começa com BOM e cabeçalho, linhas separadas por CRLF', () => {
    const csv = csvDoHub([]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(linhasDoCsv(csv)).toEqual([
      'palavra,leitura,estado,origem,intervalo (dias),JMdict,atualizado em'
    ]);
  });

  it('conhecidas primeiro, depois aprendendo, cada grupo pela leitura; sem desconhecidas e apagadas', () => {
    const csv = csvDoHub([
      linha({ word: '猫', reading: 'ねこ', jmdict_ids: [1467640] }),
      linha({ word: '雨', reading: 'あめ', state: 'aprendendo', interval_days: 3 }),
      linha({ word: '食べる', reading: 'たべる', interval_days: 45, jmdict_ids: [1358280] }),
      linha({ word: '犬', reading: 'いぬ', state: 'desconhecida', source: 'anki' }),
      linha({ word: '空', reading: 'そら', deleted_at: ANTES }),
      linha({ word: '赤', reading: 'あか', state: 'aprendendo', interval_days: 1 })
    ]);

    expect(linhasDoCsv(csv).slice(1)).toEqual([
      '食べる,たべる,conhecida,Anki,45,1358280,2026-10-20',
      '猫,ねこ,conhecida,Anki,30,1467640,2026-10-20',
      '赤,あか,aprendendo,Anki,1,,2026-10-20',
      '雨,あめ,aprendendo,Anki,3,,2026-10-20'
    ]);
  });

  it('"Já sei" vale como conhecida; origem e intervalo dizem de onde veio', () => {
    const csv = csvDoHub([
      linha({
        word: '皆',
        reading: 'みな',
        source: 'ja-sei',
        state: 'desconhecida',
        interval_days: null,
        ja_sei_at: ANTES,
        jmdict_ids: [1, 2]
      }),
      linha({
        word: '本',
        reading: 'ほん',
        state: 'aprendendo',
        interval_days: 2,
        ja_sei_at: ANTES
      })
    ]);

    expect(linhasDoCsv(csv).slice(1)).toEqual([
      '本,ほん,conhecida,Anki + Já sei,2,,2026-10-20',
      '皆,みな,conhecida,Já sei,,1 2,2026-10-20'
    ]);
  });

  it('põe entre aspas o que tem vírgula, aspas ou quebra de linha', () => {
    const csv = csvDoHub([linha({ word: 'a,b', reading: 'diz "oi"\nfim' })]);

    expect(csv).toContain('"a,b","diz ""oi""\nfim",conhecida');
  });

  it('nome do arquivo com a data local', () => {
    expect(nomeDoCsv(new Date(2026, 9, 5, 23, 30))).toBe('dokusho-vocabulario-2026-10-05.csv');
  });
});
