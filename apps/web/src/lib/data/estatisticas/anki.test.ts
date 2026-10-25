/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { registroDoAnki, type CartaDoRegistro } from './anki';

const carta = (
  id: string,
  word: string,
  estado: string,
  lote_id: string | null,
  modified_at = '2026-10-01T10:00:00Z'
): CartaDoRegistro => ({
  id,
  word,
  word_reading: word,
  word_meaning: `sentido de ${word}`,
  book_id: 'h1',
  state: estado,
  lote_id,
  modified_at
});

// Dia local simples: a data UTC.
const diaDe = (quando: string) => quando.slice(0, 10);

describe('registroDoAnki (palavras exportadas para o Anki, na tela Início)', () => {
  const lotes = [
    { id: 'L1', exported_at: '2026-10-20T08:00:00Z' },
    { id: 'L2', exported_at: '2026-10-24T21:00:00Z' }
  ];
  const titulos = new Map([['h1', '夢']]);

  it('só as exportadas, agrupadas pelo dia do Lote, do mais novo para o mais antigo', () => {
    const registro = registroDoAnki(
      [
        carta('a', '猫', 'exportada', 'L1'),
        carta('b', '犬', 'exportada', 'L2'),
        carta('c', '鳥', 'gerada', null),
        carta('d', '魚', 'exportada', 'L2')
      ],
      lotes,
      titulos,
      diaDe
    );

    expect(registro.map((dia) => [dia.dia, dia.palavras.map((p) => p.palavra)])).toEqual([
      ['2026-10-24', ['犬', '魚']],
      ['2026-10-20', ['猫']]
    ]);
    expect(registro[1].palavras[0]).toEqual({
      id: 'a',
      palavra: '猫',
      leitura: '猫',
      significado: 'sentido de 猫',
      livro: '夢'
    });
  });

  it('sem o Lote (ainda não recebido), vale a data em que a carta mudou', () => {
    const registro = registroDoAnki(
      [carta('a', '猫', 'exportada', 'L9', '2026-10-22T10:00:00Z')],
      lotes,
      new Map(),
      diaDe
    );

    expect(registro).toEqual([
      {
        dia: '2026-10-22',
        palavras: [{ id: 'a', palavra: '猫', leitura: '猫', significado: 'sentido de 猫' }]
      }
    ]);
  });
});
