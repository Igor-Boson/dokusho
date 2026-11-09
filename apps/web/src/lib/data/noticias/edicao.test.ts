/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { describe, expect, it } from 'vitest';
import {
  avisoDaColeta,
  escolherEdicao,
  estadoDaEdicao,
  historico,
  precisaColetar,
  proximaDaEdicao
} from './edicao';

const noticia = (id: string, publicada: string, texto = true, apagada = false) => ({
  news_id: id,
  published_at: publicada,
  body_html: texto ? '<p>本文</p>' : null,
  deleted_at: apagada ? '2026-11-09T00:00:00.000Z' : null
});

const ESTOQUE = [
  noticia('a', '2026-11-09T10:30:00.000Z'),
  noticia('b', '2026-11-09T11:00:00.000Z'),
  noticia('c', '2026-11-06T10:00:00.000Z'),
  noticia('d', '2026-11-05T10:00:00.000Z', false), // sem texto ainda
  noticia('e', '2026-11-04T10:00:00.000Z'),
  noticia('f', '2026-11-03T10:00:00.000Z', true, true), // apagada
  noticia('g', '2026-11-02T10:00:00.000Z'),
  noticia('h', '2026-10-30T10:00:00.000Z')
];

describe('escolherEdicao', () => {
  it('as N não lidas mais recentes com texto, da mais nova para a mais velha', () => {
    expect(escolherEdicao(ESTOQUE, new Set(), 5)).toEqual(['b', 'a', 'c', 'e', 'g']);
  });

  it('completa com as de dias anteriores quando as lidas saem', () => {
    expect(escolherEdicao(ESTOQUE, new Set(['b', 'c']), 3)).toEqual(['a', 'e', 'g']);
  });

  it('estoque curto: a Edição sai menor; estoque vazio: nenhuma', () => {
    expect(escolherEdicao(ESTOQUE, new Set(['b', 'a', 'c', 'e']), 5)).toEqual(['g', 'h']);
    expect(escolherEdicao(ESTOQUE, new Set(['a', 'b', 'c', 'e', 'g', 'h']), 5)).toEqual([]);
  });
});

describe('estadoDaEdicao', () => {
  it('as pendentes na ordem da Edição; acabou quando todas estão lidas', () => {
    expect(estadoDaEdicao(['b', 'a', 'c'], new Set(['a']))).toEqual({
      pendentes: ['b', 'c'],
      lidas: 1,
      total: 3,
      acabou: false
    });
    expect(estadoDaEdicao(['b', 'a'], new Set(['a', 'b', 'x'])).acabou).toBe(true);
  });

  it('sem Edição não há o que acabar', () => {
    expect(estadoDaEdicao(undefined, new Set())).toEqual({
      pendentes: [],
      lidas: 0,
      total: 0,
      acabou: false
    });
  });
});

describe('proximaDaEdicao', () => {
  it('a pendente seguinte na ordem; no fim, volta para a primeira pendente', () => {
    expect(proximaDaEdicao(['b', 'a', 'c', 'e'], new Set(['a']), 'a')).toBe('c');
    expect(proximaDaEdicao(['b', 'a', 'c', 'e'], new Set(['e', 'c']), 'e')).toBe('b');
  });

  it('nenhuma pendente: acabou', () => {
    expect(proximaDaEdicao(['b', 'a'], new Set(['a', 'b']), 'a')).toBeUndefined();
  });
});

describe('historico', () => {
  it('lidas agrupadas pelo dia da leitura, mais novas primeiro, sem as desmarcadas', () => {
    const lida = (id: string, quando: string, desmarcada = false) => ({
      news_id: id,
      read_at: quando,
      deleted_at: desmarcada ? quando : null
    });
    const dias = historico(
      [
        lida('a', '2026-11-08T23:00:00.000Z'),
        lida('b', '2026-11-09T22:00:00.000Z'),
        lida('c', '2026-11-09T21:00:00.000Z'),
        lida('e', '2026-11-09T20:00:00.000Z', true),
        lida('zzz', '2026-11-09T20:00:00.000Z')
      ],
      new Map(ESTOQUE.map((n) => [n.news_id, n])),
      (iso) => iso.slice(0, 10)
    );

    expect(dias.map((d) => [d.dia, d.itens.map((i) => i.noticia.news_id)])).toEqual([
      ['2026-11-09', ['b', 'c']],
      ['2026-11-08', ['a']]
    ]);
  });
});

describe('Coleta', () => {
  const agora = Date.parse('2026-11-09T22:00:00.000Z');

  it('o app pede Coleta quando a última tentativa tem mais de 12 h', () => {
    expect(precisaColetar(undefined, agora)).toBe(true);
    expect(precisaColetar({ last_attempt_at: '2026-11-09T11:45:00.000Z' }, agora)).toBe(false);
    expect(precisaColetar({ last_attempt_at: '2026-11-09T09:00:00.000Z' }, agora)).toBe(true);
  });

  const coleta = (tentativa: string, sucesso: string | null, erro: string | null) => ({
    last_attempt_at: tentativa,
    last_success_at: sucesso,
    last_error: erro
  });

  it('sem aviso quando a última tentativa deu certo, mesmo com um artigo falhando', () => {
    expect(
      avisoDaColeta(coleta('2026-11-09T11:45:00.000Z', '2026-11-09T11:45:30.000Z', null), agora)
    ).toBeUndefined();
    expect(
      avisoDaColeta(
        coleta('2026-11-09T11:45:00.000Z', '2026-11-09T11:45:30.000Z', '1 artigo(s) com erro'),
        agora
      )
    ).toBeUndefined();
  });

  it('avisa quando a última tentativa falhou, com o motivo e a última que deu certo', () => {
    expect(
      avisoDaColeta(
        coleta('2026-11-09T11:45:00.000Z', '2026-11-07T11:45:30.000Z', 'login: status 403'),
        agora
      )
    ).toEqual({ motivo: 'login: status 403', ultimaBoa: '2026-11-07T11:45:30.000Z' });
  });

  it('avisa quando a última que deu certo tem mais de 48 h, mesmo sem erro gravado', () => {
    expect(
      avisoDaColeta(coleta('2026-11-07T11:45:00.000Z', '2026-11-07T11:45:30.000Z', null), agora)
    ).toEqual({ motivo: undefined, ultimaBoa: '2026-11-07T11:45:30.000Z' });
  });
});
