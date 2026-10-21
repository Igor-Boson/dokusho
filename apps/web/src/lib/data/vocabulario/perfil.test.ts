/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { IndiceDoHub } from './indice';
import { cobertura, desconhecidas, PerfilEmConstrucao } from './perfil';
import type { PalavraJmdict } from './casamento';

const pedaco = (superficie: string, base = superficie, classe = '名詞'): Pedaco => ({
  superficie,
  base,
  leitura: '',
  classe,
  subclasse: '*',
  inicio: 0
});

// Casamento falso: 雨 → 1, 食べる → 2, 皆 → 3 (lido みな); は é gramática; 桐生 sem entrada.
const casar = async (p: Pedaco): Promise<PalavraJmdict | null | undefined> => {
  if (p.classe === '助詞') return null;
  return (
    {
      雨: { seq: 1, leitura: 'あめ' },
      食べる: { seq: 2, leitura: 'たべる' },
      皆: { seq: 3, leitura: 'みな' }
    } as Record<string, PalavraJmdict>
  )[p.base];
};

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

async function perfilDe(pedacos: Pedaco[]) {
  const perfil = new PerfilEmConstrucao();
  await perfil.acrescentar(pedacos, casar);
  return perfil.pronto('livro', 'v1');
}

describe('perfil do livro', () => {
  it('conta as ocorrências por Palavra, sem gramática; sem entrada fica pela escrita', async () => {
    const perfil = await perfilDe([
      pedaco('雨'),
      pedaco('は', 'は', '助詞'),
      pedaco('食べ', '食べる', '動詞'),
      pedaco('雨'),
      pedaco('桐生')
    ]);

    expect(perfil.itens).toEqual([
      { seq: 1, leitura: 'あめ', escrita: '雨', ocorrencias: 2 },
      { seq: 2, leitura: 'たべる', escrita: '食べる', ocorrencias: 1 },
      { seq: null, leitura: '', escrita: '桐生', ocorrencias: 1 }
    ]);
    expect(perfil).toMatchObject({ livroId: 'livro', versao: 'v1' });
  });
});

describe('cobertura (ESCOPO "Hub de vocabulário")', () => {
  it('porcentagem das ocorrências conhecidas, sem gramática; sem entrada só conta se casa pela escrita', async () => {
    const perfil = await perfilDe([
      pedaco('雨'),
      pedaco('雨'),
      pedaco('雨'),
      pedaco('食べ', '食べる', '動詞'),
      pedaco('皆'),
      pedaco('桐生'),
      pedaco('小柳')
    ]);
    const indice = new IndiceDoHub([
      linha({ word: '雨', reading: 'あめ', jmdict_ids: [1] }),
      linha({ word: '皆', reading: 'みんな', jmdict_ids: [3] }),
      linha({ word: '食べる', reading: 'たべる', jmdict_ids: [2], state: 'aprendendo' }),
      linha({ word: '桐生', reading: 'きりゅう' })
    ]);

    // Contam: 雨×3 (conhecida), 食べる (aprendendo), 皆 (conhecida, outra leitura), 桐生 (escrita).
    // 小柳 (sem entrada, fora do Anki) não conta.
    expect(cobertura(perfil, indice)).toEqual({
      porcentagem: 83,
      ocorrencias: 6,
      conhecidas: 5,
      palavras: 4,
      palavrasConhecidas: 3,
      aprendendo: 1,
      desconhecidas: 0
    });
  });

  it('livro sem palavras: 0%', async () => {
    expect(cobertura(await perfilDe([]), new IndiceDoHub([])).porcentagem).toBe(0);
  });
});

describe('desconhecidas', () => {
  it('Palavras desconhecidas com entrada, da mais frequente no livro para a menos', async () => {
    const perfil = await perfilDe([
      pedaco('食べ', '食べる', '動詞'),
      pedaco('皆'),
      pedaco('皆'),
      pedaco('雨'),
      pedaco('桐生')
    ]);
    const indice = new IndiceDoHub([linha({ word: '雨', reading: 'あめ', jmdict_ids: [1] })]);

    expect(desconhecidas(perfil, indice).map((i) => [i.escrita, i.ocorrencias])).toEqual([
      ['皆', 2],
      ['食べる', 1]
    ]);
  });
});
