/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { htmlDaNoticia, resumoDaCobertura } from './cobertura';

describe('cobertura da Notícia', () => {
  it('mostra a porcentagem e as desconhecidas, no singular e no plural', () => {
    expect(resumoDaCobertura({ porcentagem: 92, desconhecidas: 6 })).toBe('92% · 6 desconhecidas');
    expect(resumoDaCobertura({ porcentagem: 97, desconhecidas: 1 })).toBe('97% · 1 desconhecida');
    expect(resumoDaCobertura({ porcentagem: 100, desconhecidas: 0 })).toBe('100%');
  });

  it('o texto contado é o título e o corpo, como na leitura', () => {
    expect(
      htmlDaNoticia({
        title_ruby: '<ruby>猫<rt>ねこ</rt></ruby>',
        body_html: '<p>犬がいます。</p>'
      })
    ).toBe('<h1><ruby>猫<rt>ねこ</rt></ruby></h1><p>犬がいます。</p>');
  });
});
