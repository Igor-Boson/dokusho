/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { openDB, type DBSchema } from 'idb';
import { Subject } from 'rxjs';
import { lerParagrafo, SELETOR_PARAGRAFO } from '$lib/components/painel-palavra/texto-do-dom';
import {
  consultarPalavra,
  estadoDicionario$,
  tokenizador,
  verificarDicionario
} from '$lib/data/dicionario/servico';
import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import { casarPedaco, type PalavraJmdict } from './casamento';
import { PerfilEmConstrucao, type PerfilDoLivro } from './perfil';

// Perfis dos livros neste aparelho (V2.3). Ficam num banco próprio, fora da sincronização: cada
// aparelho calcula o dos livros que abre (o texto e o dicionário são os mesmos, o resultado também).
// O cálculo tokeniza o livro parágrafo a parágrafo, devolvendo a vez ao navegador a cada ~30 ms,
// para não travar a leitura no iPhone.

interface PerfisDb extends DBSchema {
  perfis: { key: string; value: PerfilDoLivro };
}

const FATIA_MS = 30;

let banco: ReturnType<typeof abrir> | undefined;

function abrir() {
  return openDB<PerfisDb>('dokusho-perfis', 1, {
    upgrade(db) {
      db.createObjectStore('perfis', { keyPath: 'livroId' });
    },
    blocking(_atual, _nova, evento) {
      (evento.target as IDBDatabase).close();
      banco = undefined;
    }
  });
}

const db = () => (banco ??= abrir());

/** Um perfil novo foi gravado (livroId). */
export const perfilPronto$ = new Subject<string>();

/** Progresso do cálculo em andamento, por livro (0 a 1). */
export const calculando = new Map<string, number>();
export const progressoDoPerfil$ = new Subject<{ livroId: string; fracao: number }>();

async function versaoDoDicionario() {
  if (!(await verificarDicionario())) return undefined;
  const estado = estadoDicionario$.value;
  return estado.tipo === 'pronto' ? estado.versao : undefined;
}

export async function lerPerfil(livroId: string) {
  return (await db()).get('perfis', livroId);
}

export async function lerPerfis() {
  return (await db()).getAll('perfis');
}

/** Parágrafos do HTML do livro, sem os que contêm outro (li com p dentro contaria duas vezes). */
function paragrafosDoHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.body.querySelectorAll(SELETOR_PARAGRAFO)].filter(
    (p) => !p.querySelector(SELETOR_PARAGRAFO)
  );
}

const emAndamento = new Map<string, Promise<PerfilDoLivro | undefined>>();

/**
 * O perfil do livro, calculado agora se ainda não existe (ou é de outra versão do dicionário).
 * undefined sem dicionário neste aparelho: nada é baixado só para isso.
 */
export function garantirPerfil(livroId: string, html: () => Promise<string | undefined>) {
  let andamento = emAndamento.get(livroId);
  if (!andamento) {
    andamento = calcular(livroId, html).finally(() => emAndamento.delete(livroId));
    emAndamento.set(livroId, andamento);
  }
  return andamento;
}

async function calcular(livroId: string, html: () => Promise<string | undefined>) {
  const versao = await versaoDoDicionario();
  if (!versao) return undefined;
  const guardado = await lerPerfil(livroId);
  if (guardado?.versao === versao) return guardado;

  const texto = await html();
  if (!texto) return undefined;

  const inicio = performance.now();
  const tk = await tokenizador();
  const memo = new Map<string, Promise<PalavraJmdict | null | undefined>>();
  const casar = (p: Pedaco) => {
    const chave = [p.base, p.superficie, p.leitura, p.classe, p.subclasse].join('|');
    let r = memo.get(chave);
    if (!r) {
      r = casarPedaco(consultarPalavra, p).then((c) => (c ? c.palavra : null));
      memo.set(chave, r);
    }
    return r;
  };

  const paragrafos = paragrafosDoHtml(texto);
  const perfil = new PerfilEmConstrucao();
  let fatia = performance.now();

  for (let i = 0; i < paragrafos.length; i += 1) {
    const { texto: doParagrafo } = lerParagrafo(paragrafos[i]);
    if (doParagrafo.trim()) await perfil.acrescentar(tk.tokenizar(doParagrafo), casar);
    if (performance.now() - fatia > FATIA_MS) {
      calculando.set(livroId, i / paragrafos.length);
      progressoDoPerfil$.next({ livroId, fracao: i / paragrafos.length });
      await new Promise((r) => setTimeout(r, 0));
      fatia = performance.now();
    }
  }

  const pronto = perfil.pronto(livroId, versao);
  await (await db()).put('perfis', pronto);
  calculando.delete(livroId);
  ultimaMedida = {
    livroId,
    paragrafos: paragrafos.length,
    palavras: pronto.itens.length,
    ms: Math.round(performance.now() - inicio)
  };
  perfilPronto$.next(livroId);
  return pronto;
}

/** Tempo do último cálculo (para medir no aparelho). */
export let ultimaMedida:
  | { livroId: string; paragrafos: number; palavras: number; ms: number }
  | undefined;

export async function apagarPerfil(livroId: string) {
  await (await db()).delete('perfis', livroId);
}
