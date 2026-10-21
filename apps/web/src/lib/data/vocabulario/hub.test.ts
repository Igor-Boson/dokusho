/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { Entrada, Forma } from '$lib/data/dicionario/formato';
import type { CardAnki } from '$lib/functions/anki/anki-connect';
import type { LinhaCarta, LinhaLote, LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import type { Consulta } from './casamento';
import {
  atualizarHub,
  contarRetrato,
  lotesConfirmados,
  marcarJaSei,
  palavrasDoAnki,
  desfazerJaSei,
  estadoDaLinha
} from './hub';

const entrada = (seq: number, ...formas: Forma[]): Entrada => ({
  id: seq,
  seq,
  formas,
  sentidos: []
});

const ENTRADAS = [
  entrada(1, { e: '分かる', l: 'わかる', f: 300, fk: 40 }, { e: '判る', l: 'わかる' }),
  entrada(2, { e: '何', l: 'なに', f: 30 }, { e: '何', l: 'なん', f: 20 }),
  entrada(3, { e: '皆', l: 'みんな', f: 70 }, { e: '皆', l: 'みな', f: 120 }),
  entrada(4, { e: '食べる', l: 'たべる', f: 200 })
];

const consultar: Consulta = async (termo) =>
  ENTRADAS.filter((e) => e.formas.some((f) => f.e === termo || f.l === termo));

let proximoId = 1;

const card = (word: string, wordReading: string, parcial: Partial<CardAnki> = {}): CardAnki => ({
  cardId: proximoId++,
  noteId: proximoId,
  deck: '日本語::2. Kaishi 1.5k',
  modelo: 'Kaishi 1.5k',
  word,
  wordReading,
  intervalo: 5,
  suspenso: false,
  leech: false,
  etiquetas: [],
  queue: 2,
  tipo: 2,
  ...parcial
});

const AGORA = '2026-10-22T10:00:00.000Z';
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

describe('palavrasDoAnki', () => {
  it('uma Palavra por (Word, Word Reading), ligada às entradas do JMdict', async () => {
    const palavras = await palavrasDoAnki([card('分かる', 'わかる')], consultar);

    expect(palavras).toEqual([
      expect.objectContaining({
        word: '分かる',
        reading: 'わかる',
        jmdictIds: [1],
        estado: 'aprendendo'
      })
    ]);
  });

  it('limpa HTML e junta as leituras do campo com ・ (何 → なに・なん)', async () => {
    const [palavra] = await palavrasDoAnki([card('<b>何</b>', 'なに・なん')], consultar);

    expect(palavra).toMatchObject({ word: '何', reading: 'なに・なん', jmdictIds: [2] });
  });

  it('dois Cards da mesma Palavra: vale o mais avançado; intervalo maior, leech de qualquer um', async () => {
    const palavras = await palavrasDoAnki(
      [
        card('食べる', 'たべる', { intervalo: 3, leech: true }),
        card('食べる', 'たべる', { intervalo: 30, deck: '日本語::3. Old' })
      ],
      consultar
    );

    expect(palavras).toHaveLength(1);
    expect(palavras[0]).toMatchObject({
      estado: 'conhecida',
      intervalo: 30,
      suspensa: false,
      leech: true
    });
  });

  it('suspensa só quando todos os Cards estão suspensos', async () => {
    const [palavra] = await palavrasDoAnki(
      [card('食べる', 'たべる', { suspenso: true }), card('食べる', 'たべる')],
      consultar
    );

    expect(palavra.suspensa).toBe(false);
  });

  it('Card sem entrada fica guardado pela escrita, sem jmdict_ids', async () => {
    const [palavra] = await palavrasDoAnki([card('桐生', 'きりゅう')], consultar);

    expect(palavra).toMatchObject({ word: '桐生', reading: 'きりゅう', jmdictIds: [] });
  });

  it('Card sem Word é ignorado', async () => {
    expect(await palavrasDoAnki([card('', '')], consultar)).toEqual([]);
  });
});

describe('atualizarHub', () => {
  it('Palavra nova do Anki vira linha anki com o estado e as entradas', async () => {
    const doAnki = await palavrasDoAnki([card('食べる', 'たべる', { intervalo: 40 })], consultar);

    expect(atualizarHub([], doAnki, AGORA)).toEqual([
      {
        word: '食べる',
        reading: 'たべる',
        jmdict_id: 4,
        jmdict_ids: [4],
        source: 'anki',
        state: 'conhecida',
        interval_days: 40,
        suspended: false,
        leech: false,
        synced_at: AGORA,
        ja_sei_at: null,
        modified_at: AGORA,
        deleted_at: null
      }
    ]);
  });

  it('linha igual à do Anki não é regravada', async () => {
    const doAnki = await palavrasDoAnki([card('食べる', 'たべる')], consultar);
    const atual = linha({ word: '食べる', reading: 'たべる', jmdict_id: 4, jmdict_ids: [4] });

    expect(atualizarHub([atual], doAnki, AGORA)).toEqual([]);
  });

  it('mudou de estado: regrava com o horário novo', async () => {
    const doAnki = await palavrasDoAnki([card('食べる', 'たべる', { intervalo: 21 })], consultar);
    const atual = linha({ word: '食べる', reading: 'たべる', jmdict_id: 4, jmdict_ids: [4] });

    expect(atualizarHub([atual], doAnki, AGORA)).toEqual([
      expect.objectContaining({ state: 'conhecida', interval_days: 21, modified_at: AGORA })
    ]);
  });

  it('Palavra que sumiu do Anki é apagada (soft delete) e volta a desconhecida', () => {
    const atual = linha({ word: '食べる', reading: 'たべる' });

    expect(atualizarHub([atual], [], AGORA)).toEqual([
      expect.objectContaining({ word: '食べる', deleted_at: AGORA, modified_at: AGORA })
    ]);
  });

  it('Palavra que sumiu do Anki mas tem "Já sei" fica, como ja_sei e conhecida', () => {
    const atual = linha({ word: '食べる', reading: 'たべる', ja_sei_at: ANTES });

    expect(atualizarHub([atual], [], AGORA)).toEqual([
      expect.objectContaining({
        source: 'ja_sei',
        state: 'conhecida',
        deleted_at: null,
        ja_sei_at: ANTES
      })
    ]);
  });

  it('"Já sei" que entra no Anki vira anki com o estado do Anki e mantém a marca', async () => {
    const doAnki = await palavrasDoAnki([card('食べる', 'たべる', { intervalo: 2 })], consultar);
    const atual = linha({
      word: '食べる',
      reading: 'たべる',
      source: 'ja_sei',
      state: 'conhecida',
      ja_sei_at: ANTES,
      interval_days: null
    });

    expect(atualizarHub([atual], doAnki, AGORA)).toEqual([
      expect.objectContaining({ source: 'anki', state: 'aprendendo', ja_sei_at: ANTES })
    ]);
  });

  it('linhas "Já sei" fora do Anki não mudam', () => {
    const atual = linha({ source: 'ja_sei', state: 'conhecida', ja_sei_at: ANTES, word: '皆' });

    expect(atualizarHub([atual], [], AGORA)).toEqual([]);
  });

  it('linha apagada que volta ao Anki é restaurada', async () => {
    const doAnki = await palavrasDoAnki([card('食べる', 'たべる')], consultar);
    const atual = linha({
      word: '食べる',
      reading: 'たべる',
      jmdict_id: 4,
      jmdict_ids: [4],
      deleted_at: ANTES
    });

    expect(atualizarHub([atual], doAnki, AGORA)).toEqual([
      expect.objectContaining({ deleted_at: null, modified_at: AGORA })
    ]);
  });

  it('apagada fica apagada', () => {
    expect(atualizarHub([linha({ word: '食べる', deleted_at: ANTES })], [], AGORA)).toEqual([]);
  });
});

describe('estadoDaLinha', () => {
  it('sem linha ou apagada é desconhecida; "Já sei" vence o estado do Anki', () => {
    expect(estadoDaLinha(undefined)).toBe('desconhecida');
    expect(estadoDaLinha(linha({ state: 'conhecida', deleted_at: ANTES }))).toBe('desconhecida');
    expect(estadoDaLinha(linha({ state: 'aprendendo' }))).toBe('aprendendo');
    expect(estadoDaLinha(linha({ state: 'aprendendo', ja_sei_at: ANTES }))).toBe('conhecida');
  });
});

describe('contarRetrato', () => {
  it('conta conhecidas (com "Já sei") e aprendendo, sem as apagadas', () => {
    const linhas = [
      linha({ word: 'a', state: 'conhecida' }),
      linha({ word: 'b', state: 'conhecida', source: 'ja_sei' }),
      linha({ word: 'c', state: 'aprendendo' }),
      linha({ word: 'e', state: 'aprendendo', ja_sei_at: ANTES }),
      linha({ word: 'd', state: 'conhecida', deleted_at: ANTES })
    ];

    expect(contarRetrato(linhas)).toEqual({ known_count: 3, learning_count: 1 });
  });
});

describe('marcarJaSei e desfazerJaSei (por entrada, ADR 0013)', () => {
  it('Palavra fora do hub: linha ja_sei conhecida com a entrada', () => {
    expect(marcarJaSei(undefined, { word: '皆', reading: 'みな', seq: 3 }, AGORA)).toEqual({
      word: '皆',
      reading: 'みな',
      jmdict_id: 3,
      jmdict_ids: [3],
      source: 'ja_sei',
      state: 'conhecida',
      interval_days: null,
      suspended: false,
      leech: false,
      synced_at: null,
      ja_sei_at: AGORA,
      modified_at: AGORA,
      deleted_at: null
    });
  });

  it('Palavra do Anki ganha a marca; o estado do Anki fica guardado', () => {
    const atual = linha({ word: '皆', reading: 'みな', jmdict_id: 3, jmdict_ids: [3] });
    const marcada = marcarJaSei(atual, { word: '皆', reading: 'みな', seq: 3 }, AGORA);

    expect(marcada).toMatchObject({ source: 'anki', state: 'aprendendo', ja_sei_at: AGORA });
    expect(estadoDaLinha(marcada)).toBe('conhecida');
  });

  it('desfazer numa linha ja_sei apaga a linha', () => {
    const atual = linha({ source: 'ja_sei', state: 'conhecida', ja_sei_at: ANTES });

    expect(desfazerJaSei(atual, AGORA)).toMatchObject({
      deleted_at: AGORA,
      ja_sei_at: null,
      modified_at: AGORA
    });
  });

  it('desfazer numa linha do Anki tira a marca e volta ao estado do Anki', () => {
    const atual = linha({ source: 'anki', state: 'aprendendo', ja_sei_at: ANTES });
    const desfeita = desfazerJaSei(atual, AGORA);

    expect(desfeita).toMatchObject({ deleted_at: null, ja_sei_at: null });
    expect(estadoDaLinha(desfeita)).toBe('aprendendo');
  });
});

describe('lotesConfirmados', () => {
  const lote = (id: string): LinhaLote =>
    ({ id, confirmed_in_anki_at: null, deleted_at: null }) as LinhaLote;
  const carta = (loteId: string, word: string, wordReading: string): LinhaCarta =>
    ({ lote_id: loteId, word, word_reading: wordReading, deleted_at: null }) as LinhaCarta;

  it('confirma o Lote quando todas as cartas dele estão no Anki', () => {
    const cards = [card('食べる', 'たべる'), card('皆', 'みな')];
    const cartas = [
      carta('l1', '食べる', 'たべる'),
      carta('l1', '皆', 'みな'),
      carta('l2', '食べる', 'たべる'),
      carta('l2', '分かる', 'わかる')
    ];

    expect(lotesConfirmados([lote('l1'), lote('l2')], cartas, cards)).toEqual(['l1']);
  });

  it('não reconfirma nem confirma Lote sem cartas', () => {
    const confirmado = { ...lote('l1'), confirmed_in_anki_at: ANTES };

    expect(
      lotesConfirmados(
        [confirmado, lote('l3')],
        [carta('l1', '食べる', 'たべる')],
        [card('食べる', 'たべる')]
      )
    ).toEqual([]);
  });
});
