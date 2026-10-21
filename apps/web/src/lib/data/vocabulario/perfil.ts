/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import type { PalavraJmdict } from './casamento';
import type { IndiceDoHub } from './indice';

// Perfil do livro (V2.3): cada Palavra do livro, sem gramática, com quantas vezes aparece. É
// calculado uma vez por livro (o texto não muda) e guardado no aparelho; a cobertura e a lista de
// desconhecidas saem dele e do hub na hora, então mudam assim que o hub muda.

export interface ItemDoPerfil {
  /** Entrada do JMdict; null quando o pedaço não acha entrada (nome próprio, onomatopeia). */
  seq: number | null;
  leitura: string;
  /** Forma de dicionário como aparece no livro. */
  escrita: string;
  ocorrencias: number;
}

export interface PerfilDoLivro {
  livroId: string;
  /** Versão do dicionário com que foi calculado (outra versão: calcula de novo). */
  versao: string;
  itens: ItemDoPerfil[];
}

/** Casa um pedaço: a Palavra, undefined sem entrada, null para gramática. */
export type CasarPedaco = (pedaco: Pedaco) => Promise<PalavraJmdict | null | undefined>;

export class PerfilEmConstrucao {
  private readonly itens = new Map<string, ItemDoPerfil>();

  async acrescentar(pedacos: Pedaco[], casar: CasarPedaco) {
    for (const pedaco of pedacos) {
      const palavra = await casar(pedaco);
      if (palavra === null) continue;
      const chave = palavra ? `${palavra.seq}|${palavra.leitura}` : `|${pedaco.base}`;
      const item = this.itens.get(chave);
      if (item) item.ocorrencias += 1;
      else
        this.itens.set(chave, {
          seq: palavra?.seq ?? null,
          leitura: palavra?.leitura ?? '',
          escrita: pedaco.base,
          ocorrencias: 1
        });
    }
  }

  pronto(livroId: string, versao: string): PerfilDoLivro {
    return { livroId, versao, itens: [...this.itens.values()] };
  }
}

/**
 * Cobertura: porcentagem das ocorrências de Palavras conhecidas no livro (sem gramática). Pedaços
 * sem entrada no dicionário (quase sempre nomes) só contam quando o Anki tem a escrita.
 */
export function cobertura(perfil: PerfilDoLivro, indice: IndiceDoHub) {
  let ocorrencias = 0;
  let conhecidas = 0;
  let palavras = 0;
  let palavrasConhecidas = 0;
  let aprendendo = 0;
  let desconhecidasDistintas = 0;

  for (const item of perfil.itens) {
    if (item.seq === null && !indice.temEscrita(item.escrita)) continue;
    const estado = indice.daPedaco(
      item.seq === null ? undefined : { seq: item.seq, leitura: item.leitura },
      item.escrita
    );
    ocorrencias += item.ocorrencias;
    palavras += 1;
    if (estado === 'conhecida') {
      conhecidas += item.ocorrencias;
      palavrasConhecidas += 1;
    } else if (estado === 'aprendendo') aprendendo += 1;
    else desconhecidasDistintas += 1;
  }

  return {
    porcentagem: ocorrencias ? Math.round((100 * conhecidas) / ocorrencias) : 0,
    ocorrencias,
    conhecidas,
    palavras,
    palavrasConhecidas,
    aprendendo,
    desconhecidas: desconhecidasDistintas
  };
}

/** Palavras desconhecidas do livro (com entrada), da mais frequente no livro para a menos. */
export function desconhecidas(perfil: PerfilDoLivro, indice: IndiceDoHub) {
  return perfil.itens
    .filter(
      (item) =>
        item.seq !== null &&
        indice.daPedaco({ seq: item.seq, leitura: item.leitura }, item.escrita) === 'desconhecida'
    )
    .sort((a, b) => b.ocorrencias - a.ocorrencias);
}
