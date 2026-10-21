/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { Entrada } from '$lib/data/dicionario/formato';
import { criarAnkiConnect } from '$lib/functions/anki/anki-connect';
import type { LojasDeLinhas } from '$lib/data/supabase/sincronizacao/sincronizador';
import type { LinhaCarta, LinhaLote } from '$lib/data/supabase/sincronizacao/regras';
import type { Consulta } from './casamento';
import { sincronizarAnki, type OpcoesSincAnki } from './sincronizar-anki';

// AnkiConnect simulado (nada de Anki real nos testes): responde as ações de leitura e o sync.

interface CardFalso {
  id: number;
  deck: string;
  word: string;
  reading: string;
  interval: number;
  queue: number;
  type: number;
  tags?: string[];
}

function ankiFalso(cards: CardFalso[]) {
  const acoes: string[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    const { action, params } = JSON.parse(String(init.body));
    acoes.push(action);
    const responder: Record<string, () => unknown> = {
      version: () => 6,
      sync: () => null,
      deckNamesAndIds: () => ({ 日本語: 1 }),
      findCards: () =>
        cards.filter((c) => `"deck:${c.deck.split('::')[0]}"` === params.query).map((c) => c.id),
      cardsInfo: () =>
        cards
          .filter((c) => params.cards.includes(c.id))
          .map((c) => ({
            cardId: c.id,
            note: c.id * 10,
            deckName: c.deck,
            modelName: 'Kaishi 1.5k',
            interval: c.interval,
            queue: c.queue,
            type: c.type,
            fields: {
              Word: { value: c.word, order: 0 },
              'Word Reading': { value: c.reading, order: 1 }
            }
          })),
      notesInfo: () =>
        params.notes.map((n: number) => ({
          noteId: n,
          tags: cards.find((c) => c.id * 10 === n)?.tags ?? []
        }))
    };
    return new Response(JSON.stringify({ result: responder[action](), error: null }));
  }) as typeof globalThis.fetch;
  return { anki: criarAnkiConnect({ fetch, esperar: async () => undefined }), acoes };
}

const ENTRADAS: Entrada[] = [
  { id: 1, seq: 1, formas: [{ e: '食べる', l: 'たべる', f: 200 }], sentidos: [] },
  { id: 2, seq: 2, formas: [{ e: '皆', l: 'みんな', f: 70 }], sentidos: [] }
];
const consultar: Consulta = async (termo) =>
  ENTRADAS.filter((e) => e.formas.some((f) => f.e === termo || f.l === termo));

/** O pedaço do Sincronizador que a Sincronização do Anki usa, em memória. */
function sincFalso(inicial: Partial<{ [L in keyof LojasDeLinhas]: LojasDeLinhas[L][] }> = {}) {
  const lojas = {
    cartas: [...(inicial.cartas ?? [])],
    lotes: [...(inicial.lotes ?? [])],
    traducoes: [],
    vocab: [...(inicial.vocab ?? [])],
    retratos: [...(inicial.retratos ?? [])]
  } as { [L in keyof LojasDeLinhas]: LojasDeLinhas[L][] };
  let rodadas = 0;
  const chave = (l: Record<string, unknown>) => (l.id as string) ?? `${l.word}|${l.reading}`;
  return {
    lojas,
    rodadas: () => rodadas,
    sinc: {
      async listarComApagadas<L extends keyof LojasDeLinhas>(loja: L) {
        return [...lojas[loja]];
      },
      async listar<L extends keyof LojasDeLinhas>(loja: L) {
        return lojas[loja].filter((l) => !l.deleted_at);
      },
      async salvarVarias<L extends keyof LojasDeLinhas>(loja: L, linhas: LojasDeLinhas[L][]) {
        for (const linha of linhas) {
          const lista = lojas[loja] as unknown as Record<string, unknown>[];
          const i = lista.findIndex((l) => chave(l) === chave(linha as never));
          if (i >= 0) lista[i] = linha as never;
          else lista.push(linha as never);
        }
      },
      async sincronizar() {
        rodadas += 1;
        return 'feito' as const;
      }
    } as unknown as OpcoesSincAnki['sinc']
  };
}

const AGORA = '2026-10-22T10:00:00.000Z';

describe('sincronizarAnki', () => {
  it('sync do AnkiWeb, lê os Cards, grava o hub e o retrato, e envia', async () => {
    const { anki, acoes } = ankiFalso([
      {
        id: 1,
        deck: '日本語::2. Kaishi 1.5k',
        word: '食べる',
        reading: 'たべる',
        interval: 30,
        queue: 2,
        type: 2
      },
      {
        id: 2,
        deck: '日本語::3. Old',
        word: '皆',
        reading: 'みんな',
        interval: 0,
        queue: 0,
        type: 0
      },
      {
        id: 3,
        deck: '日本語::3. Old',
        word: '桐生',
        reading: 'きりゅう',
        interval: 3,
        queue: -1,
        type: 2,
        tags: ['leech']
      }
    ]);
    const { sinc, lojas, rodadas } = sincFalso();

    const resumo = await sincronizarAnki({
      anki,
      consultar,
      sinc,
      decks: ['日本語'],
      agora: () => AGORA,
      novoId: () => 'r1'
    });

    expect(acoes.slice(0, 3)).toEqual(['version', 'sync', 'deckNamesAndIds']);
    expect(acoes).not.toContain('getDeckStats');
    expect(resumo).toEqual({
      quando: AGORA,
      cards: 3,
      palavras: 3,
      semEntrada: 1,
      gravadas: 3,
      apagadas: 0,
      conhecidas: 1,
      aprendendo: 2,
      lotesConfirmados: 0
    });
    expect(lojas.vocab.map((l) => [l.word, l.state, l.leech])).toEqual([
      ['食べる', 'conhecida', false],
      ['皆', 'aprendendo', false],
      ['桐生', 'aprendendo', true]
    ]);
    expect(lojas.retratos).toEqual([
      expect.objectContaining({ id: 'r1', synced_at: AGORA, known_count: 1, learning_count: 2 })
    ]);
    // Uma rodada antes (recebe os "Já sei" dos outros aparelhos) e uma depois (envia).
    expect(rodadas()).toBe(2);
  });

  it('Palavra que sumiu do Anki é apagada; Lote cujas cartas chegaram é confirmado', async () => {
    const { anki } = ankiFalso([
      {
        id: 1,
        deck: '日本語::1. Dokusho',
        word: '食べる',
        reading: 'たべる',
        interval: 0,
        queue: 0,
        type: 0
      }
    ]);
    const antes = '2026-10-21T10:00:00.000Z';
    const { sinc, lojas } = sincFalso({
      vocab: [
        {
          user_id: 'u1',
          word: '皆',
          reading: 'みんな',
          jmdict_id: 2,
          jmdict_ids: [2],
          source: 'anki',
          state: 'aprendendo',
          interval_days: 0,
          suspended: false,
          leech: false,
          synced_at: antes,
          ja_sei_at: null,
          modified_at: antes,
          updated_at: antes,
          deleted_at: null
        }
      ],
      lotes: [{ id: 'l1', confirmed_in_anki_at: null, deleted_at: null } as LinhaLote],
      cartas: [
        {
          id: 'c1',
          lote_id: 'l1',
          word: '食べる',
          word_reading: 'たべる',
          deleted_at: null
        } as LinhaCarta
      ]
    });

    const resumo = await sincronizarAnki({
      anki,
      consultar,
      sinc,
      decks: ['日本語'],
      agora: () => AGORA,
      novoId: () => 'r2',
      comAnkiWeb: false
    });

    expect(resumo).toMatchObject({ gravadas: 1, apagadas: 1, lotesConfirmados: 1 });
    expect(lojas.vocab.find((l) => l.word === '皆')).toMatchObject({ deleted_at: AGORA });
    expect(lojas.lotes[0]).toMatchObject({ confirmed_in_anki_at: AGORA, modified_at: AGORA });
  });

  it('sem AnkiConnect falha antes de mexer no hub', async () => {
    const anki = criarAnkiConnect({
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof globalThis.fetch
    });
    const { sinc, lojas, rodadas } = sincFalso();

    await expect(
      sincronizarAnki({ anki, consultar, sinc, decks: ['日本語'] })
    ).rejects.toMatchObject({ tipo: 'rede' });
    expect(lojas.vocab).toEqual([]);
    expect(rodadas()).toBe(0);
  });
});
