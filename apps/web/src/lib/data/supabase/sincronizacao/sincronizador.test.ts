/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  BooksDbBookData,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { createBooksDb } from '$lib/data/database/books-db/factory';
import { ReadingGoalFrequency } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
import { abrirBancoSinc } from './banco';
import {
  Sincronizador,
  type Linhas,
  type NovasLinhas,
  type Servidor,
  type TabelaSinc
} from './sincronizador';

// Servidor em memória que imita o Supabase: upsert na chave primária, gatilho touch_row (ignora
// update com modified_at mais velho e grava updated_at) e o bucket.
const CHAVES: Record<TabelaSinc, string[]> = {
  books: ['id'],
  bookmarks: ['book_id'],
  reading_stats: ['book_id', 'date_key', 'device_id'],
  reading_goals: ['goal_start_date'],
  batch_items: ['id'],
  lotes: ['id'],
  translations: ['sentence_sha256'],
  vocab: ['word', 'reading'],
  vocab_history: ['id']
};

const PADRAO: Record<TabelaSinc, Record<string, unknown>> = {
  books: { characters: 0, cover_path: null, processed_path: null, original_path: null },
  bookmarks: { reach_char_count: null, device_id: null, device_name: null },
  reading_stats: { characters_read: 0, reading_time: 0, completed_book: false },
  reading_goals: { time_goal: 0, character_goal: 0 },
  batch_items: {},
  lotes: {},
  translations: {},
  vocab: {},
  vocab_history: {}
};

class ServidorFalso {
  tabelas = new Map<TabelaSinc, Map<string, Record<string, unknown>>>();

  arquivos = new Map<string, Blob>();

  relogio = 0;

  /** Passos que falham, como `receber:vocab` ou `enviar:vocab` (rede caindo, tabela com erro). */
  falhas = new Set<string>();

  servidor(userId = 'u1'): Servidor {
    return {
      userId,
      enviar: async <T extends TabelaSinc>(tabela: T, linhas: NovasLinhas[T][]) => {
        if (this.falhas.has(`enviar:${tabela}`)) throw new Error(`Enviar ${tabela}: falhou`);

        const dados = this.tabela(tabela);

        // Um upsert é uma transação: todas as linhas ganham o mesmo updated_at.
        this.relogio += 1;

        for (const linha of linhas as Record<string, unknown>[]) {
          const id = CHAVES[tabela].map((coluna) => linha[coluna]).join('|');
          const antiga = dados.get(id);

          if (
            antiga &&
            Date.parse(linha.modified_at as string) < Date.parse(antiga.modified_at as string)
          ) {
            continue;
          }

          dados.set(id, {
            ...PADRAO[tabela],
            ...antiga,
            ...linha,
            user_id: userId,
            updated_at: new Date(Date.UTC(2026, 9, 21) + this.relogio).toISOString()
          });
        }
      },
      receber: async <T extends TabelaSinc>(
        tabela: T,
        desde: string | undefined,
        limite: number,
        pulo: number
      ) => {
        if (this.falhas.has(`receber:${tabela}`)) throw new Error(`Receber ${tabela}: falhou`);

        return [...this.tabela(tabela).entries()]
          .filter(([, linha]) => !desde || (linha.updated_at as string) > desde)
          .sort(([chaveA, a], [chaveB, b]) =>
            `${a.updated_at}|${chaveA}` < `${b.updated_at}|${chaveB}` ? -1 : 1
          )
          .map(([, linha]) => linha)
          .slice(pulo, pulo + limite) as unknown as Linhas[T][];
      },
      subir: async (caminho, dados) => {
        this.arquivos.set(caminho, dados);
      },
      baixar: async (caminho) => {
        const arquivo = this.arquivos.get(caminho);

        if (!arquivo) throw new Error(`sem ${caminho}`);

        return arquivo;
      },
      apagar: async (caminhos) => {
        caminhos.forEach((caminho) => this.arquivos.delete(caminho));
      }
    };
  }

  tabela(tabela: TabelaSinc) {
    if (!this.tabelas.has(tabela)) this.tabelas.set(tabela, new Map());
    return this.tabelas.get(tabela)!;
  }
}

let contador = 0;

function criarAparelho(servidorFalso: ServidorFalso, nome: string, limite?: number) {
  contador += 1;

  const ttu = createBooksDb(`books-${nome}-${contador}`);
  const sinc = abrirBancoSinc(`sinc-${nome}-${contador}`);
  const avisos = { livros: 0, marcadores: 0, metas: 0, estatisticas: 0, cartas: 0 };
  const sincronizador = new Sincronizador({
    ttu,
    sinc,
    servidor: async () => servidorFalso.servidor(),
    aparelho: { id: `id-${nome}`, nome },
    avisos: {
      livros: () => (avisos.livros += 1),
      marcadores: () => (avisos.marcadores += 1),
      metas: () => (avisos.metas += 1),
      estatisticas: () => (avisos.estatisticas += 1),
      cartas: () => (avisos.cartas += 1)
    },
    apagarLivroLocal: async (dataId) => {
      const db = await ttu;

      await db.delete('data', dataId);
      await db.delete('bookmark', dataId);
    },
    limite
  });

  return { ttu, sinc, sincronizador, avisos };
}

function livro(titulo: string, texto = '<p>本文</p>'): Omit<BooksDbBookData, 'id'> {
  return {
    title: titulo,
    styleSheet: 'p{}',
    elementHtml: texto,
    blobs: { 'img.png': new Blob(['png'], { type: 'image/png' }) },
    coverImage: new Blob(['capa'], { type: 'image/jpeg' }),
    hasThumb: true,
    characters: 1000,
    sections: [{ reference: 'c1', charactersWeight: 1 }],
    lastBookModified: 1,
    lastBookOpen: 0
  };
}

async function importar(aparelho: ReturnType<typeof criarAparelho>, titulo: string) {
  const epub = new Blob([`epub de ${titulo}`]);
  const hash = await aparelho.sincronizador.registrarImportado(epub, titulo);
  const db = await aparelho.ttu;
  const dataId = await db.add('data', livro(titulo) as BooksDbBookData);

  return { hash, dataId: dataId as number };
}

function estatistica(titulo: string, dia: string, tempo: number, quando: number): BooksDbStatistic {
  return {
    title: titulo,
    dateKey: dia,
    charactersRead: tempo * 2,
    readingTime: tempo,
    minReadingSpeed: 0,
    altMinReadingSpeed: 0,
    lastReadingSpeed: 0,
    maxReadingSpeed: 0,
    lastStatisticModified: quando
  };
}

let servidor: ServidorFalso;

beforeEach(() => {
  servidor = new ServidorFalso();
});

describe('livros', () => {
  it('importado no PC aparece no iPad como livro na nuvem e baixa ao abrir', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { hash } = await importar(pc, '夢');

    await pc.sincronizador.sincronizar();

    expect(servidor.tabela('books').get(hash)).toMatchObject({
      title: '夢',
      characters: 1000,
      cover_path: `u1/${hash}/capa`,
      original_path: `u1/${hash}/original.epub`,
      deleted_at: null
    });
    expect([...servidor.arquivos.keys()].sort()).toEqual([
      `u1/${hash}/capa`,
      `u1/${hash}/original.epub`,
      `u1/${hash}/processado.zip`
    ]);

    await ipad.sincronizador.sincronizar();

    const ttuIpad = await ipad.ttu;
    const [placeholder] = await ttuIpad.getAll('data');

    expect(placeholder).toMatchObject({ title: '夢', elementHtml: '', characters: 1000 });
    expect(await (placeholder.coverImage as Blob).text()).toBe('capa');
    expect(ipad.avisos.livros).toBe(1);

    let progresso = 0;

    await ipad.sincronizador.baixarLivro(placeholder.id, (feito) => (progresso = feito));

    const baixado = await ttuIpad.get('data', placeholder.id);

    expect(baixado).toMatchObject({
      title: '夢',
      elementHtml: '<p>本文</p>',
      styleSheet: 'p{}',
      sections: [{ reference: 'c1', charactersWeight: 1 }]
    });
    expect(await baixado!.blobs['img.png'].text()).toBe('png');
    expect(progresso).toBe(0);

    // O iPad não sobe de novo um livro que veio da nuvem.
    servidor.arquivos.clear();
    await ipad.sincronizador.sincronizar();
    expect(servidor.arquivos.size).toBe(0);
  });

  it('livro antigo, sem EPUB, sobe pelo hash do texto e sem original', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const db = await pc.ttu;

    await db.add('data', livro('古い本') as BooksDbBookData);
    await pc.sincronizador.sincronizar();

    const [linha] = [...servidor.tabela('books').values()];

    expect(linha).toMatchObject({ title: '古い本', original_path: null });
    expect(linha.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('apagar some em todos os aparelhos e do bucket; estatísticas ficam', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { hash, dataId } = await importar(pc, '夢');
    const dbPc = await pc.ttu;

    await dbPc.put('statistic', estatistica('夢', '2026-10-21', 60, 5));
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();
    expect(await (await ipad.ttu).count('data')).toBe(1);

    await dbPc.delete('data', dataId);
    await pc.sincronizador.apagarLivros(['夢']);
    await pc.sincronizador.sincronizar();

    expect(servidor.tabela('books').get(hash)?.deleted_at).toBeTruthy();
    expect(servidor.tabela('bookmarks').get(hash)?.deleted_at).toBeTruthy();
    expect(servidor.arquivos.size).toBe(0);
    expect(servidor.tabela('reading_stats').size).toBe(1);
    expect([...servidor.tabela('reading_stats').values()][0].deleted_at).toBeNull();

    await ipad.sincronizador.sincronizar();
    expect(await (await ipad.ttu).count('data')).toBe(0);
  });

  it('reimportar depois de apagar devolve o livro', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { dataId } = await importar(pc, '夢');

    await pc.sincronizador.sincronizar();
    await (await pc.ttu).delete('data', dataId);
    await pc.sincronizador.apagarLivros(['夢']);
    await pc.sincronizador.sincronizar();

    await new Promise((ok) => {
      setTimeout(ok, 5);
    });
    await importar(pc, '夢');
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    expect((await (await ipad.ttu).getAll('data')).map((l) => l.title)).toEqual(['夢']);
  });
});

describe('marcador', () => {
  it('aparelho novo recebe o marcador; o outro pergunta antes de pular', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { hash, dataId } = await importar(pc, '夢');
    const dbPc = await pc.ttu;

    await dbPc.put('bookmark', {
      dataId,
      progress: 0.4,
      exploredCharCount: 400,
      lastBookmarkModified: 1000
    });
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    const dbIpad = await ipad.ttu;
    const [livroIpad] = await dbIpad.getAll('data');

    expect(await dbIpad.get('bookmark', livroIpad.id)).toMatchObject({
      progress: 0.4,
      exploredCharCount: 400,
      lastBookmarkModified: 1000
    });

    // O iPad lê mais; o PC só pula se você aceitar.
    await dbIpad.put('bookmark', {
      dataId: livroIpad.id,
      progress: 0.6,
      exploredCharCount: 600,
      lastBookmarkModified: 2000
    });
    await ipad.sincronizador.sincronizar();

    expect(servidor.tabela('bookmarks').get(hash)).toMatchObject({
      reach_char_count: 600,
      device_name: 'iPad'
    });

    const linha = await pc.sincronizador.marcadorDeOutroAparelho(dataId, 1000);

    expect(linha).toMatchObject({ device_name: 'iPad', progress: '0.6' });
    expect((await dbPc.get('bookmark', dataId))?.progress).toBe(0.4);

    await pc.sincronizador.aplicarMarcadorRemoto(dataId, linha!);
    expect(await dbPc.get('bookmark', dataId)).toMatchObject({
      progress: 0.6,
      lastBookmarkModified: 2000
    });
    expect(await pc.sincronizador.marcadorDeOutroAparelho(dataId, 1000)).toBeUndefined();
  });

  it('marcador mais velho de outro aparelho não sobrescreve e não pergunta', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { dataId } = await importar(pc, '夢');

    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    const dbIpad = await ipad.ttu;
    const [livroIpad] = await dbIpad.getAll('data');

    // O iPad marca primeiro (horário 1000), mas sincroniza depois do PC (horário 2000).
    await dbIpad.put('bookmark', {
      dataId: livroIpad.id,
      progress: 0.2,
      exploredCharCount: 200,
      lastBookmarkModified: 1000
    });
    await (
      await pc.ttu
    ).put('bookmark', {
      dataId,
      progress: 0.5,
      exploredCharCount: 500,
      lastBookmarkModified: 2000
    });
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();
    await pc.sincronizador.sincronizar();

    expect([...servidor.tabela('bookmarks').values()][0]).toMatchObject({
      progress: '0.5',
      reach_char_count: 500
    });
    expect(await pc.sincronizador.marcadorDeOutroAparelho(dataId, 1000)).toBeUndefined();
    // O iPad, que ficou para trás, recebe a pergunta.
    expect(await ipad.sincronizador.marcadorDeOutroAparelho(livroIpad.id, 1000)).toMatchObject({
      device_name: 'Windows'
    });
  });

  it('recusar a pergunta mantém o marcador daqui', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const { dataId } = await importar(pc, '夢');
    const dbPc = await pc.ttu;

    await dbPc.put('bookmark', { dataId, progress: 0.1, lastBookmarkModified: 1000 });
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    const dbIpad = await ipad.ttu;
    const [livroIpad] = await dbIpad.getAll('data');

    await dbIpad.put('bookmark', {
      dataId: livroIpad.id,
      progress: 0.9,
      lastBookmarkModified: 3000
    });
    await ipad.sincronizador.sincronizar();

    const linha = await pc.sincronizador.marcadorDeOutroAparelho(dataId, 1000);

    await pc.sincronizador.dispensarMarcadorRemoto(linha!);
    expect(await pc.sincronizador.marcadorDeOutroAparelho(dataId, 1000)).toBeUndefined();
    expect((await dbPc.get('bookmark', dataId))?.progress).toBe(0.1);
  });
});

describe('estatísticas e metas', () => {
  it('o mesmo livro no mesmo dia em dois aparelhos soma o tempo', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');

    await importar(pc, '夢');
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    await (await pc.ttu).put('statistic', estatistica('夢', '2026-10-21', 600, 10));
    await (await ipad.ttu).put('statistic', estatistica('夢', '2026-10-21', 300, 20));
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();
    await pc.sincronizador.sincronizar();

    expect(servidor.tabela('reading_stats').size).toBe(2);

    for (const aparelho of [pc, ipad]) {
      const locais = await (await aparelho.ttu).getAll('statistic');
      const outras = await aparelho.sincronizador.estatisticasDeOutrosAparelhos(
        '2026-10-21',
        '2026-10-21'
      );
      const total =
        locais.reduce((soma, linha) => soma + linha.readingTime, 0) +
        outras.reduce((soma, linha) => soma + linha.reading_time, 0);

      expect(total).toBe(900);
    }
  });

  it('estatística apagada aqui é apagada no servidor e nos outros', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');

    await importar(pc, '夢');

    const dbPc = await pc.ttu;

    await dbPc.put('statistic', estatistica('夢', '2026-10-20', 60, 10));
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();
    expect(await ipad.sincronizador.estatisticasDeOutrosAparelhos()).toHaveLength(1);

    await dbPc.delete('statistic', ['夢', '2026-10-20']);
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    expect([...servidor.tabela('reading_stats').values()][0].deleted_at).toBeTruthy();
    expect(await ipad.sincronizador.estatisticasDeOutrosAparelhos()).toHaveLength(0);
  });

  it('aparelho que perdeu o banco recebe de volta as próprias estatísticas', async () => {
    const pc = criarAparelho(servidor, 'Windows');

    await importar(pc, '夢');
    await (await pc.ttu).put('statistic', estatistica('夢', '2026-10-20', 60, 10));
    await pc.sincronizador.sincronizar();

    // Mesmo aparelho (mesmo id), bancos novos.
    const reinstalado = criarAparelho(servidor, 'Windows');

    await reinstalado.sincronizador.sincronizar();

    expect(await (await reinstalado.ttu).get('statistic', ['夢', '2026-10-20'])).toMatchObject({
      readingTime: 60
    });
  });

  it('meta criada e apagada num aparelho chega ao outro', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const dbPc = await pc.ttu;

    await dbPc.put('readingGoal', {
      goalStartDate: '2026-10-20',
      goalEndDate: '',
      goalOriginalEndDate: '',
      goalFrequency: ReadingGoalFrequency.DAILY,
      timeGoal: 1800,
      characterGoal: 0,
      lastGoalModified: 100
    });
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    const dbIpad = await ipad.ttu;

    expect(await dbIpad.get('readingGoal', '2026-10-20')).toMatchObject({ timeGoal: 1800 });
    expect(ipad.avisos.metas).toBe(1);

    await dbPc.delete('readingGoal', '2026-10-20');
    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    expect(await dbIpad.get('readingGoal', '2026-10-20')).toBeUndefined();
  });
});

describe('cartas e traduções', () => {
  const carta = (id: string, quando: string) => ({
    id,
    user_id: 'u1',
    book_id: 'livro',
    jmdict_id: 1,
    word: '気のせい',
    word_reading: 'きのせい',
    word_meaning: null,
    word_furigana: '気[き]のせい',
    word_audio_path: null,
    word_audio_check: null,
    sentence: '<b>気のせい</b>だ。',
    sentence_meaning: null,
    sentence_furigana: '<b>気[き]のせい</b>だ。',
    sentence_audio_path: null,
    sentence_before: null,
    sentence_after: null,
    notes: null,
    frequency: 100,
    voice_text: null,
    state: 'pendente',
    error_reason: null,
    lote_id: null,
    modified_at: quando,
    updated_at: quando,
    deleted_at: null
  });

  it('carta criada num aparelho chega ao outro; a geração do servidor volta; a edição mais nova vence', async () => {
    const iphone = criarAparelho(servidor, 'iPhone');
    const ipad = criarAparelho(servidor, 'iPad');

    await iphone.sincronizador.salvar('cartas', carta('c1', '2026-10-21T10:00:00.000Z'));
    await iphone.sincronizador.sincronizar();

    expect(servidor.tabela('batch_items').get('c1')).toMatchObject({ state: 'pendente' });

    // A Edge Function gera e grava com modified_at mais novo.
    await servidor.servidor().enviar('batch_items', [
      {
        ...carta('c1', '2026-10-21T10:01:00.000Z'),
        state: 'gerada',
        word_meaning: 'impressão minha'
      }
    ]);
    await iphone.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    for (const aparelho of [iphone, ipad]) {
      expect(await aparelho.sincronizador.ler('cartas', 'c1')).toMatchObject({
        state: 'gerada',
        word_meaning: 'impressão minha'
      });
      expect(aparelho.avisos.cartas).toBeGreaterThan(0);
    }

    expect(await ipad.sincronizador.cartasDaPalavra('気のせい', 'きのせい')).toHaveLength(1);

    // Edição no iPad depois da geração.
    const gerada = await ipad.sincronizador.ler('cartas', 'c1');

    await ipad.sincronizador.salvar('cartas', {
      ...gerada!,
      notes: 'nota',
      modified_at: '2026-10-21T10:05:00.000Z'
    });
    await ipad.sincronizador.sincronizar();
    await iphone.sincronizador.sincronizar();

    expect(await iphone.sincronizador.ler('cartas', 'c1')).toMatchObject({
      notes: 'nota',
      word_meaning: 'impressão minha'
    });
  });

  it('carta apagada (soft delete) some das listas', async () => {
    const iphone = criarAparelho(servidor, 'iPhone');

    await iphone.sincronizador.salvar('cartas', {
      ...carta('c2', '2026-10-21T10:00:00.000Z'),
      deleted_at: '2026-10-21T10:00:00.000Z'
    });

    expect(await iphone.sincronizador.listar('cartas')).toEqual([]);
    expect(await iphone.sincronizador.cartasDaPalavra('気のせい', 'きのせい')).toEqual([]);
  });

  it('traduções do servidor ficam no cache local', async () => {
    const pc = criarAparelho(servidor, 'Windows');

    servidor.tabela('translations').set('h1', {
      sentence_sha256: 'h1',
      sentence: '雨だ。',
      translation: 'Está chovendo.',
      translated_at: '2026-10-21T10:00:00.000Z',
      modified_at: '2026-10-21T10:00:00.000Z',
      updated_at: '2026-10-21T10:00:00.000Z',
      deleted_at: null,
      user_id: 'u1'
    });
    await pc.sincronizador.sincronizar();

    expect(await pc.sincronizador.ler('traducoes', 'h1')).toMatchObject({
      translation: 'Está chovendo.'
    });
  });
});

describe('cursor', () => {
  it('recebe tudo em páginas, mesmo com linhas no mesmo updated_at', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad', 3);

    await importar(pc, '夢');

    const dbPc = await pc.ttu;

    for (let dia = 1; dia <= 8; dia += 1) {
      await dbPc.put('statistic', estatistica('夢', `2026-10-0${dia}`, dia, dia));
    }

    await pc.sincronizador.sincronizar();
    await ipad.sincronizador.sincronizar();

    expect(await ipad.sincronizador.estatisticasDeOutrosAparelhos()).toHaveLength(8);
  });

  it('sem sessão não faz nada', async () => {
    const semLogin = new Sincronizador({
      ttu: createBooksDb('books-sem-login'),
      sinc: abrirBancoSinc('sinc-sem-login'),
      servidor: async () => undefined,
      aparelho: { id: 'x', nome: 'x' },
      avisos: { livros() {}, marcadores() {}, metas() {}, estatisticas() {}, cartas() {} },
      apagarLivroLocal: async () => {}
    });

    expect(await semLogin.sincronizar()).toBe('sem-login');
  });
});

describe('hub de vocabulário', () => {
  const palavra = (word: string, reading: string, quando: string) => ({
    user_id: 'u1',
    word,
    reading,
    jmdict_id: 1,
    jmdict_ids: [1],
    source: 'anki',
    state: 'aprendendo',
    interval_days: 3,
    suspended: false,
    leech: false,
    synced_at: quando,
    ja_sei_at: null,
    modified_at: quando,
    updated_at: quando,
    deleted_at: null
  });

  it('vocab e retratos gravados no PC chegam ao iPad; a mudança mais nova vence', async () => {
    const pc = criarAparelho(servidor, 'Windows');
    const ipad = criarAparelho(servidor, 'iPad');
    const quando = '2026-10-22T10:00:00.000Z';

    await pc.sincronizador.salvarVarias('vocab', [
      palavra('食べる', 'たべる', quando),
      palavra('何', 'なに・なん', quando)
    ]);
    await pc.sincronizador.salvar('retratos', {
      user_id: 'u1',
      id: 'r1',
      synced_at: quando,
      known_count: 0,
      learning_count: 2,
      modified_at: quando,
      updated_at: quando,
      deleted_at: null
    });
    await pc.sincronizador.sincronizar();

    expect(servidor.tabela('vocab').get('何|なに・なん')).toMatchObject({ state: 'aprendendo' });

    await ipad.sincronizador.sincronizar();

    expect(await ipad.sincronizador.listar('vocab')).toHaveLength(2);
    expect(await ipad.sincronizador.listar('retratos')).toHaveLength(1);
    expect(ipad.avisos.cartas).toBe(0);

    // "Já sei" no iPad depois da sincronização do PC.
    const depois = '2026-10-22T11:00:00.000Z';

    await ipad.sincronizador.salvar('vocab', {
      ...palavra('食べる', 'たべる', quando),
      ja_sei_at: depois,
      modified_at: depois
    });
    await ipad.sincronizador.sincronizar();
    await pc.sincronizador.sincronizar();

    expect(await pc.sincronizador.ler('vocab', ['食べる', 'たべる'])).toMatchObject({
      ja_sei_at: depois
    });
  });
});

describe('falhas na rodada', () => {
  it('erro ao receber o vocab não impede o livro e o marcador de subirem, e é relatado', async () => {
    const iphone = criarAparelho(servidor, 'iPhone');
    const pc = criarAparelho(servidor, 'Windows');
    const { hash } = await importar(iphone, '夢');

    servidor.falhas.add('receber:vocab');

    await expect(iphone.sincronizador.sincronizar()).rejects.toThrow(/Receber vocab: falhou/);
    expect(servidor.tabela('books').get(hash)).toMatchObject({ title: '夢', deleted_at: null });

    servidor.falhas.clear();
    await pc.sincronizador.sincronizar();

    const [noPc] = await (await pc.ttu).getAll('data');

    expect(noPc).toMatchObject({ title: '夢' });
  });

  it('erro ao enviar uma tabela não impede as outras', async () => {
    const iphone = criarAparelho(servidor, 'iPhone');

    const quando = '2026-10-21T10:00:00.000Z';

    await iphone.sincronizador.salvar('retratos', {
      user_id: 'u1',
      id: 'r9',
      synced_at: quando,
      known_count: 1,
      learning_count: 0,
      modified_at: quando,
      updated_at: quando,
      deleted_at: null
    });
    servidor.falhas.add('enviar:books');
    await importar(iphone, '夢');

    await expect(iphone.sincronizador.sincronizar()).rejects.toThrow(/Enviar books: falhou/);
    expect(servidor.tabela('vocab_history').get('r9')).toBeTruthy();
  });
});
