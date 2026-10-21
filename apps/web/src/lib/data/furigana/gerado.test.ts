/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import { ordenarPorFrequencia } from '$lib/data/dicionario/banco';
import type { Entrada, Forma } from '$lib/data/dicionario/formato';
import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import type { Consulta } from '$lib/data/vocabulario/casamento';
import { furiganaDoParagrafo, leituraDoPedaco, mostrarFurigana } from './gerado';

let seq = 0;
const entrada = (...formas: Forma[]): Entrada => ({
  id: (seq += 1),
  seq,
  formas,
  sentidos: []
});

const entradas: Entrada[] = [
  entrada({
    e: '最初',
    l: 'さいしょ',
    f: 300,
    fu: [
      ['最', 'さい'],
      ['初', 'しょ']
    ]
  }),
  entrada({ e: '気持ち', l: 'きもち', f: 400 }),
  entrada({ e: '入り口', l: 'いりぐち', f: 2000 }),
  entrada({ e: '方', l: 'かた', f: 500 }),
  entrada({ e: '方', l: 'ほう', f: 100 }),
  entrada({ e: '行く', l: 'いく', f: 50 }),
  entrada({
    e: '見詰める',
    l: 'みつめる',
    f: 3000,
    fu: [['見', 'み'], ['詰', 'つ'], 'める']
  }),
  entrada({ e: '鬱', l: 'うつ', f: 9000 }),
  entrada({ e: '何', l: 'なに', f: 30 }, { e: '何', l: 'なん', f: 20 }),
  entrada({ e: '日本', l: 'にほん', f: 80 }, { e: '日本', l: 'にっぽん', f: 5000 }),
  entrada({ e: '分かる', l: 'わかる', f: 300 })
];

// Como o banco: escrita ou leitura igual ao termo, da mais frequente para a menos.
const consultar: Consulta = async (termo) =>
  ordenarPorFrequencia(
    entradas.filter((x) => x.formas.some((f) => f.e === termo || f.l === termo)),
    termo
  );

const pedaco = (
  superficie: string,
  base: string,
  leitura: string,
  inicio = 0,
  classe = '名詞',
  subclasse = '一般'
): Pedaco => ({ superficie, base, leitura, classe, subclasse, inicio });

describe('leitura de um pedaço', () => {
  it('kana não ganha furigana', async () => {
    expect(await leituraDoPedaco(consultar, pedaco('わかる', 'わかる', 'わかる'))).toBeUndefined();
    expect(await leituraDoPedaco(consultar, pedaco('。', '。', ''))).toBeUndefined();
  });

  it('kanji por kanji quando o JmdictFurigana separa', async () => {
    expect(await leituraDoPedaco(consultar, pedaco('最初', '最初', 'さいしょ'))).toEqual([
      ['最', 'さい'],
      ['初', 'しょ']
    ]);
  });

  it('fora do JmdictFurigana: sobre os kanji, sem o okurigana', async () => {
    expect(await leituraDoPedaco(consultar, pedaco('気持ち', '気持ち', 'きもち'))).toEqual([
      ['気持', 'きも'],
      'ち'
    ]);
  });

  it('homógrafo: a leitura do tokenizador escolhe a entrada', async () => {
    expect(await leituraDoPedaco(consultar, pedaco('方', '方', 'かた'))).toEqual([['方', 'かた']]);
    expect(await leituraDoPedaco(consultar, pedaco('方', '方', 'ほう'))).toEqual([['方', 'ほう']]);
  });

  it('leitura do tokenizador que o JMdict não tem para a escrita: vale a do JMdict', async () => {
    // O IPADIC lê 入り口 como いりくち (R4).
    expect(await leituraDoPedaco(consultar, pedaco('入り口', '入り口', 'いりくち'))).toEqual([
      ['入', 'い'],
      'り',
      ['口', 'ぐち']
    ]);
  });

  it('conjugado: a leitura da superfície, sem o okurigana', async () => {
    expect(
      await leituraDoPedaco(consultar, pedaco('行っ', '行く', 'いっ', 0, '動詞', '自立'))
    ).toEqual([['行', 'い'], 'っ']);
  });

  it('conjugado: kanji por kanji pelo JmdictFurigana da forma de dicionário', async () => {
    expect(
      await leituraDoPedaco(consultar, pedaco('見詰め', '見詰める', 'みつめ', 0, '動詞', '自立'))
    ).toEqual([['見', 'み'], ['詰', 'つ'], 'め']);
  });

  it('sem leitura no tokenizador: a da entrada do JMdict; sem entrada, nada', async () => {
    expect(await leituraDoPedaco(consultar, pedaco('鬱', '鬱', ''))).toEqual([['鬱', 'うつ']]);
    expect(await leituraDoPedaco(consultar, pedaco('翠', '翠', ''))).toBeUndefined();
  });

  it('nome que o JMdict não tem fica com a leitura do tokenizador', async () => {
    expect(
      await leituraDoPedaco(consultar, pedaco('佐藤', '佐藤', 'さとう', 0, '名詞', '固有名詞'))
    ).toEqual([['佐藤', 'さとう']]);
  });

  it('何 antes de だ, で, の, と e de contador é なん', async () => {
    const nani = pedaco('何', '何', 'なに', 0, '名詞', '代名詞');
    const lido = (seguinte?: Pedaco) => leituraDoPedaco(consultar, nani, seguinte);

    expect(await lido(pedaco('だ', 'だ', 'だ', 1, '助動詞', '*'))).toEqual([['何', 'なん']]);
    expect(await lido(pedaco('で', 'で', 'で', 1, '助詞', '格助詞'))).toEqual([['何', 'なん']]);
    expect(await lido(pedaco('の', 'の', 'の', 1, '助詞', '連体化'))).toEqual([['何', 'なん']]);
    expect(await lido(pedaco('人', '人', 'にん', 1, '名詞', '接尾'))).toEqual([['何', 'なん']]);
    expect(await lido(pedaco('か', 'か', 'か', 1, '助詞', '副助詞／並立助詞／終助詞'))).toEqual([
      ['何', 'なに']
    ]);
    expect(await lido(pedaco('を', 'を', 'を', 1, '助詞', '格助詞'))).toEqual([['何', 'なに']]);
    expect(await lido()).toEqual([['何', 'なに']]);
  });
});

describe('furigana de um parágrafo', () => {
  it('posições no texto do parágrafo, um trecho por kanji ou grupo de kanji', async () => {
    // 最初に行った
    const pedacos = [
      pedaco('最初', '最初', 'さいしょ', 0),
      pedaco('に', 'に', 'に', 2, '助詞', '格助詞'),
      pedaco('行っ', '行く', 'いっ', 3, '動詞', '自立'),
      pedaco('た', 'た', 'た', 5, '助動詞', '*')
    ];

    expect(await furiganaDoParagrafo(consultar, pedacos, [])).toEqual([
      {
        pedaco: 0,
        leituras: [
          { inicio: 0, fim: 1, leitura: 'さい' },
          { inicio: 1, fim: 2, leitura: 'しょ' }
        ]
      },
      { pedaco: 2, leituras: [{ inicio: 3, fim: 4, leitura: 'い' }] }
    ]);
  });

  it('respeita o furigana do EPUB: não gera onde o livro já tem <ruby>', async () => {
    // 最初の気持ち, com 最初 em <ruby> no livro.
    const pedacos = [
      pedaco('最初', '最初', 'さいしょ', 0),
      pedaco('の', 'の', 'の', 2, '助詞', '連体化'),
      pedaco('気持ち', '気持ち', 'きもち', 3)
    ];

    expect(await furiganaDoParagrafo(consultar, pedacos, [{ inicio: 0, fim: 2 }])).toEqual([
      { pedaco: 2, leituras: [{ inicio: 3, fim: 5, leitura: 'きも' }] }
    ]);
  });

  it('ruby do EPUB num só kanji da palavra: os outros kanji ainda ganham furigana', async () => {
    const pedacos = [pedaco('最初', '最初', 'さいしょ', 0)];

    expect(await furiganaDoParagrafo(consultar, pedacos, [{ inicio: 0, fim: 1 }])).toEqual([
      { pedaco: 0, leituras: [{ inicio: 1, fim: 2, leitura: 'しょ' }] }
    ]);
  });
});

describe('qual furigana gerado aparece', () => {
  it('Do livro: nenhum gerado', () => {
    expect(mostrarFurigana('livro', 'desconhecida')).toBe(false);
  });

  it('Todos: todos', () => {
    expect(mostrarFurigana('todos', 'conhecida')).toBe(true);
    expect(mostrarFurigana('todos', undefined)).toBe(true);
  });

  it('Adaptativo: esconde só as conhecidas (inclusive "Já sei"); fora do hub aparece', () => {
    expect(mostrarFurigana('adaptativo', 'conhecida')).toBe(false);
    expect(mostrarFurigana('adaptativo', 'aprendendo')).toBe(true);
    expect(mostrarFurigana('adaptativo', 'desconhecida')).toBe(true);
    expect(mostrarFurigana('adaptativo', undefined)).toBe(true);
  });
});
