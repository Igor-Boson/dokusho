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
// desconhecidas saem dele e do hub na hora, então mudam assim que o hub muda. Na V3.2 cada ocorrência
// guarda o fim do seu parágrafo, contado como o Alcance: o cruzamento com a leitura (palavras vistas,
// cobertura do que já leu) sai dele e do Alcance, também na hora.

/** Perfis de outro formato (sem posições) são calculados de novo. */
export const FORMATO_DO_PERFIL = 2;

export interface ItemDoPerfil {
  /** Entrada do JMdict; null quando o pedaço não acha entrada (nome próprio, onomatopeia). */
  seq: number | null;
  leitura: string;
  /** Forma de dicionário como aparece no livro. */
  escrita: string;
  ocorrencias: number;
  /** Fim do parágrafo de cada ocorrência, em caracteres desde o começo do livro (como o Alcance). */
  posicoes?: number[];
}

export interface PerfilDoLivro {
  livroId: string;
  /** Versão do dicionário com que foi calculado (outra versão: calcula de novo). */
  versao: string;
  /** Ausente nos perfis da V2.3, que não têm posições. */
  formato?: number;
  /** Caracteres do livro, contados como o Alcance. */
  total?: number;
  itens: ItemDoPerfil[];
}

/** Casa um pedaço: a Palavra, undefined sem entrada, null para gramática. */
export type CasarPedaco = (pedaco: Pedaco) => Promise<PalavraJmdict | null | undefined>;

export class PerfilEmConstrucao {
  private readonly itens = new Map<string, ItemDoPerfil>();

  /** Pedaços de um parágrafo; `fim` é onde ele termina, contado como o Alcance. */
  async acrescentar(pedacos: Pedaco[], casar: CasarPedaco, fim = 0) {
    for (const pedaco of pedacos) {
      const palavra = await casar(pedaco);
      if (palavra === null) continue;
      const chave = palavra ? `${palavra.seq}|${palavra.leitura}` : `|${pedaco.base}`;
      const item = this.itens.get(chave);
      if (item) {
        item.ocorrencias += 1;
        item.posicoes!.push(fim);
      } else
        this.itens.set(chave, {
          seq: palavra?.seq ?? null,
          leitura: palavra?.leitura ?? '',
          escrita: pedaco.base,
          ocorrencias: 1,
          posicoes: [fim]
        });
    }
  }

  pronto(livroId: string, versao: string, total = 0): PerfilDoLivro {
    return { livroId, versao, formato: FORMATO_DO_PERFIL, total, itens: [...this.itens.values()] };
  }
}

/** O perfil tem as posições (V3.2): dá para cruzar com o Alcance. */
export const temPosicoes = (perfil: PerfilDoLivro) => perfil.formato === FORMATO_DO_PERFIL;

/**
 * Estado da Palavra para as contas, ou undefined quando ela não conta: pedaço sem entrada no
 * dicionário (quase sempre nome) que o Anki não tem pela escrita.
 */
function estadoQueConta(item: ItemDoPerfil, indice: IndiceDoHub) {
  if (item.seq === null && !indice.temEscrita(item.escrita)) return undefined;
  return indice.daPedaco(
    item.seq === null ? undefined : { seq: item.seq, leitura: item.leitura },
    item.escrita
  );
}

/** Ocorrências em parágrafos que o Alcance já passou (a mesma regra da barra verde). */
const vezesLidas = (item: ItemDoPerfil, alcance: number) =>
  (item.posicoes ?? []).filter((fim) => fim <= alcance).length;

const porcento = (parte: number, todo: number) => (todo ? Math.round((100 * parte) / todo) : 0);

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
    const estado = estadoQueConta(item, indice);
    if (!estado) continue;
    ocorrencias += item.ocorrencias;
    palavras += 1;
    if (estado === 'conhecida') {
      conhecidas += item.ocorrencias;
      palavrasConhecidas += 1;
    } else if (estado === 'aprendendo') aprendendo += 1;
    else desconhecidasDistintas += 1;
  }

  return {
    porcentagem: porcento(conhecidas, ocorrencias),
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

/**
 * Quanto do livro já foi lido (pelo Alcance) e a cobertura separada em antes e depois dele: mostra se
 * o que falta ler é mais fácil ou mais difícil que o que já foi.
 */
export function leituraDoLivro(perfil: PerfilDoLivro, indice: IndiceDoHub, alcance: number) {
  const lida = { conhecidas: 0, ocorrencias: 0 };
  const restante = { conhecidas: 0, ocorrencias: 0 };

  for (const item of perfil.itens) {
    const estado = estadoQueConta(item, indice);
    if (!estado) continue;
    const lidas = vezesLidas(item, alcance);
    const conhecida = estado === 'conhecida';
    lida.ocorrencias += lidas;
    restante.ocorrencias += item.ocorrencias - lidas;
    if (conhecida) {
      lida.conhecidas += lidas;
      restante.conhecidas += item.ocorrencias - lidas;
    }
  }

  const total = perfil.total ?? 0;

  return {
    lido: porcento(Math.min(alcance, total), total),
    lida: {
      porcentagem: porcento(lida.conhecidas, lida.ocorrencias),
      ocorrencias: lida.ocorrencias
    },
    restante: {
      porcentagem: porcento(restante.conhecidas, restante.ocorrencias),
      ocorrencias: restante.ocorrencias
    }
  };
}

/** Desconhecidas (com entrada) que já apareceram no trecho lido, das vistas mais vezes para as menos. */
export function desconhecidasVistas(perfil: PerfilDoLivro, indice: IndiceDoHub, alcance: number) {
  return desconhecidas(perfil, indice)
    .map((item) => ({ item, vezes: vezesLidas(item, alcance) }))
    .filter((vista) => vista.vezes > 0)
    .sort((a, b) => b.vezes - a.vezes || b.item.ocorrencias - a.item.ocorrencias);
}

/** Palavras vistas em todos os livros (cada uma uma vez), pelo estado no hub. */
export function palavrasVistas(
  livros: { perfil: PerfilDoLivro; alcance: number }[],
  indice: IndiceDoHub
) {
  const estados = new Map<string, string>();

  for (const { perfil, alcance } of livros) {
    for (const item of perfil.itens) {
      const chave = item.seq === null ? `|${item.escrita}` : `${item.seq}|${item.leitura}`;
      if (estados.has(chave) || !vezesLidas(item, alcance)) continue;
      const estado = estadoQueConta(item, indice);
      if (estado) estados.set(chave, estado);
    }
  }

  const contar = (estado: string) => [...estados.values()].filter((e) => e === estado).length;

  return {
    vistas: estados.size,
    conhecidas: contar('conhecida'),
    aprendendo: contar('aprendendo'),
    desconhecidas: contar('desconhecida')
  };
}
