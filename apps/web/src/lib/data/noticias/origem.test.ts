/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { etiquetasDoLivro } from '$lib/functions/anki/modelo';
import { origemDaNoticia, tituloDaOrigem } from './origem';

describe('origem da Carta', () => {
  const titulos = new Map([['hash1', 'また、同じ夢を見ていた']]);

  it('Carta de Notícia: book_id nhk:<id>, título NHK Easy e etiqueta dokusho::NHK_Easy', () => {
    const origem = origemDaNoticia('20261109de72841');

    expect(origem).toBe('nhk:20261109de72841');
    expect(tituloDaOrigem(origem, titulos)).toBe('NHK Easy');
    expect(etiquetasDoLivro(tituloDaOrigem(origem, titulos)!)).toEqual([
      'dokusho',
      'dokusho::NHK_Easy'
    ]);
  });

  it('Carta de Livro segue pelo hash; sem origem, sem título', () => {
    expect(tituloDaOrigem('hash1', titulos)).toBe('また、同じ夢を見ていた');
    expect(tituloDaOrigem('outro', titulos)).toBeUndefined();
    expect(tituloDaOrigem(null, titulos)).toBeUndefined();
  });
});
