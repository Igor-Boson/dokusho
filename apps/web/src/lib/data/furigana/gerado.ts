/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { alinharLeitura } from '$lib/data/cartas/furigana';
import type { PedacoFurigana } from '$lib/data/dicionario/formato';
import { paraHiragana, type Pedaco } from '$lib/data/dicionario/tokenizador';
import type { Consulta } from '$lib/data/vocabulario/casamento';
import type { Estado } from '$lib/data/vocabulario/estados';

// Furigana gerado para o texto do leitor (v3, ADR 0015): a leitura de cada pedaço com kanji vem do
// tokenizador, conferida com o JMdict; kanji por kanji pelo JmdictFurigana e, fora dele, sobre o
// grupo de kanji (o mesmo alinhamento do Word Furigana da carta).

/** Do livro: só o furigana do EPUB (como na v1). Todos: gerado em tudo. Adaptativo: gerado, menos nas conhecidas. */
export type ModoFurigana = 'livro' | 'todos' | 'adaptativo';

const KANJI = /[\p{Script=Han}々〆ヶ]/u;

/** Furigana gerado aparece? `estado` undefined: o hub não conhece (gramática, fora do JMdict). */
export function mostrarFurigana(modo: ModoFurigana, estado: Estado | undefined) {
  if (modo === 'livro') return false;
  if (modo === 'todos') return true;
  return estado !== 'conhecida';
}

// Regras de reserva para os palpites do IPADIC em homógrafos (teste das 30 frases do R5, em
// docs/historico/TESTES-DE-RISCO.md). A leitura do tokenizador vale quando nenhuma se aplica.
// - 何 é sempre なに; antes de だ/で/の/と/て e de contador (何人, 何回) é なん.
// - 行っ (行った, 行って) sai de 行う (おこなっ); num romance é quase sempre 行く.
// - 色 sozinho sai しょく (sufixo); クリーム色 é いろ. 後 sai のち; o comum é あと (その後 já vem ご).
// - 他 sozinho sai た; 他の, 他に são ほか.
// - 風 depois de verbo ou こんな/そんな e antes de な/に (知った風な, こんな風に) é ふう.
const ANTES_DE_NAN = /^[だでのとて]/;
const TROCAS: Record<string, string> = { '色|しょく': 'いろ', '後|のち': 'あと', '他|た': 'ほか' };

function leituraDoTokenizador(pedaco: Pedaco, seguinte?: Pedaco, anterior?: Pedaco) {
  const leitura = paraHiragana(pedaco.leitura);
  const { superficie } = pedaco;
  const colado = seguinte && pedaco.inicio + superficie.length === seguinte.inicio;
  const coladoAntes = anterior && anterior.inicio + anterior.superficie.length === pedaco.inicio;

  if (
    superficie === '何' &&
    leitura === 'なに' &&
    colado &&
    (ANTES_DE_NAN.test(seguinte.superficie) || seguinte.subclasse === '接尾')
  )
    return 'なん';

  if (superficie === '行っ' && pedaco.base === '行う') return 'いっ';

  if (
    superficie === '風' &&
    leitura === 'かぜ' &&
    colado &&
    coladoAntes &&
    /^[なに]$/.test(seguinte.superficie) &&
    ['動詞', '助動詞', '連体詞'].includes(anterior.classe)
  )
    return 'ふう';

  return TROCAS[`${superficie}|${leitura}`] ?? leitura;
}

const lerFurigana = (pedacos: PedacoFurigana[]) =>
  pedacos.map((p) => (typeof p === 'string' ? paraHiragana(p) : p[1])).join('');

/** O JmdictFurigana da forma de dicionário aplicado à superfície conjugada (見詰める → 見詰め). */
function furiganaDaSuperficie(fu: PedacoFurigana[], superficie: string) {
  const saida: PedacoFurigana[] = [];
  let texto = '';

  for (const pedaco of fu) {
    const trecho = typeof pedaco === 'string' ? pedaco : pedaco[0];

    if (!superficie.startsWith(texto + trecho)) break;
    saida.push(pedaco);
    texto += trecho;
  }

  const resto = superficie.slice(texto.length);

  if (KANJI.test(resto)) return undefined;
  if (resto) saida.push(resto);

  return saida;
}

/**
 * Furigana de um pedaço do tokenizador (kanji com leitura; kana sem), ou undefined quando não tem
 * kanji ou leitura. `seguinte` e `anterior` são os vizinhos (何 + だ → なん; た + 風 + な → ふう).
 */
export async function leituraDoPedaco(
  consultar: Consulta,
  pedaco: Pedaco,
  seguinte?: Pedaco,
  anterior?: Pedaco
): Promise<PedacoFurigana[] | undefined> {
  const { superficie, base } = pedaco;

  if (!KANJI.test(superficie)) return undefined;

  const leitura = leituraDoTokenizador(pedaco, seguinte, anterior);

  if (superficie === base || !leitura) {
    const formas = (await consultar(superficie))
      .flatMap((entrada) => entrada.formas)
      .filter((forma) => forma.e === superficie);
    // A leitura do tokenizador escolhe a forma (方 かた × ほう); se o JMdict não tem essa leitura
    // para a escrita (入り口 いりくち), vale a da entrada mais frequente.
    const forma = formas.find((f) => paraHiragana(f.l) === leitura) ?? formas[0];

    if (forma) return forma.fu ?? alinharLeitura(superficie, paraHiragana(forma.l));
    if (!leitura) return undefined;

    return alinharLeitura(superficie, leitura);
  }

  // Conjugado: a leitura da superfície; kanji por kanji quando o JmdictFurigana da forma de
  // dicionário separa e bate com ela.
  for (const entrada of await consultar(base)) {
    for (const forma of entrada.formas) {
      if (forma.e !== base || !forma.fu) continue;

      const fu = furiganaDaSuperficie(forma.fu, superficie);

      if (fu && lerFurigana(fu) === leitura) return fu;
    }
  }

  return alinharLeitura(superficie, leitura);
}

export interface LeituraGerada {
  /** [inicio, fim) no texto do parágrafo (sem o furigana do EPUB). */
  inicio: number;
  fim: number;
  leitura: string;
}

export interface FuriganaDoPedaco {
  /** Índice do pedaço na lista do tokenizador. */
  pedaco: number;
  leituras: LeituraGerada[];
}

/**
 * Furigana gerado de um parágrafo tokenizado. `rubis` são os trechos que o EPUB já cobre com
 * <ruby>: ali não se gera nada (o kanji vizinho, fora do <ruby>, ainda ganha o seu).
 */
export async function furiganaDoParagrafo(
  consultar: Consulta,
  pedacos: Pedaco[],
  rubis: { inicio: number; fim: number }[]
) {
  const saida: FuriganaDoPedaco[] = [];

  for (let i = 0; i < pedacos.length; i += 1) {
    const pedaco = pedacos[i];
    const fu = await leituraDoPedaco(consultar, pedaco, pedacos[i + 1], pedacos[i - 1]);

    if (!fu) continue;

    const leituras: LeituraGerada[] = [];
    let posicao = pedaco.inicio;

    for (const parte of fu) {
      if (typeof parte === 'string') {
        posicao += parte.length;
        continue;
      }

      const [kanji, leitura] = parte;
      const trecho = { inicio: posicao, fim: posicao + kanji.length, leitura };

      posicao = trecho.fim;

      if (rubis.some((r) => r.inicio < trecho.fim && trecho.inicio < r.fim)) continue;
      leituras.push(trecho);
    }

    if (leituras.length) saida.push({ pedaco: i, leituras });
  }

  return saida;
}
