/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Entrada } from '$lib/data/dicionario/formato';
import { paraHiragana } from '$lib/data/dicionario/tokenizador';
import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { desfazerJaSei, marcarJaSei, type NovaLinhaVocab } from './hub';

// Importação inicial do "Já sei" (ADR 0007): marca como conhecidas as entradas do JMdict até a
// posição N do JPDB, menos as que estão no Anki (o Anki manda nelas) e a gramática (não conta na
// cobertura). Todas as linhas de uma importação têm o mesmo ja_sei_at, o que permite desfazê-la.

/** Etiquetas do JMdict de gramática: partícula, auxiliar, cópula, conjunção. */
const GRAMATICA = new Set(['prt', 'aux', 'aux-v', 'aux-adj', 'cop', 'conj']);

export function posicaoNaFrequencia(entrada: Entrada) {
  let melhor = Infinity;
  for (const f of entrada.formas) melhor = Math.min(melhor, f.f ?? Infinity, f.fk ?? Infinity);
  return melhor;
}

function ehGramatica(entrada: Entrada) {
  return (
    entrada.sentidos.length > 0 &&
    entrada.sentidos.every((s) => s.t.some((etiqueta) => GRAMATICA.has(etiqueta)))
  );
}

/** A forma que o JPDB mais vê: a escrita, ou a leitura quando ela é mais vista em kana. */
function formaMaisVista(entrada: Entrada) {
  let melhor = { word: entrada.formas[0].e, reading: entrada.formas[0].l, f: Infinity };
  for (const forma of entrada.formas) {
    if ((forma.f ?? Infinity) < melhor.f) melhor = { word: forma.e, reading: forma.l, f: forma.f! };
    if ((forma.fk ?? Infinity) < melhor.f)
      melhor = { word: forma.l, reading: forma.l, f: forma.fk! };
  }
  return { word: melhor.word, reading: paraHiragana(melhor.reading) };
}

export function jaSeiPorFrequencia(
  entradas: Iterable<Entrada>,
  limite: number,
  noAnki: Set<number>,
  atuais: LinhaVocab[],
  agora: string
) {
  const vivas = new Set(atuais.filter((l) => !l.deleted_at).map((l) => `${l.word}|${l.reading}`));
  const novas = new Map<string, NovaLinhaVocab>();

  for (const entrada of entradas) {
    if (noAnki.has(entrada.seq) || !entrada.formas.length) continue;
    if (posicaoNaFrequencia(entrada) > limite || ehGramatica(entrada)) continue;

    const { word, reading } = formaMaisVista(entrada);
    const chave = `${word}|${reading}`;
    if (vivas.has(chave)) continue;

    const ja = novas.get(chave);
    if (ja) ja.jmdict_ids = [...(ja.jmdict_ids ?? []), entrada.seq];
    else novas.set(chave, marcarJaSei(undefined, { word, reading, seq: entrada.seq }, agora));
  }

  return [...novas.values()];
}

/** Importações feitas: "Já sei" vivos só do app, agrupados pelo horário. */
export function importacoes(linhas: LinhaVocab[], minimo = 50) {
  const grupos = new Map<string, number>();
  for (const l of linhas) {
    if (l.deleted_at || l.source !== 'ja_sei' || !l.ja_sei_at) continue;
    grupos.set(l.ja_sei_at, (grupos.get(l.ja_sei_at) ?? 0) + 1);
  }
  return [...grupos]
    .filter(([, palavras]) => palavras >= minimo)
    .map(([quando, palavras]) => ({ quando, palavras }))
    .sort((a, b) => (a.quando < b.quando ? 1 : -1));
}

export function desfazerImportacao(linhas: LinhaVocab[], quando: string, agora: string) {
  return linhas
    .filter((l) => !l.deleted_at && l.source === 'ja_sei' && l.ja_sei_at === quando)
    .map((l) => desfazerJaSei(l, agora));
}
