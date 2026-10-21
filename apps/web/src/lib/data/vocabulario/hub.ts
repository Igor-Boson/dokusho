/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { CardAnki } from '$lib/functions/anki/anki-connect';
import type { LinhaCarta, LinhaLote, LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { paraHiragana } from '$lib/data/dicionario/tokenizador';
import { casarCard, leiturasDoCampo, limparCampo, type Consulta } from './casamento';
import { estadoDaPalavra, maisAvancado, type Estado } from './estados';

// Hub de vocabulário (ESCOPO "Hub de vocabulário"; ADR 0007, 0008, 0013). Uma linha de vocab por
// Palavra (Word, Word Reading). Nas linhas do Anki, `state` é o estado dos Cards; a marca "Já sei"
// fica à parte em `ja_sei_at`, e o estado da Palavra é o mais avançado dos dois (estadoDaLinha).

export type NovaLinhaVocab = Omit<LinhaVocab, 'user_id' | 'updated_at'>;

/** Uma Palavra do Anki, com o estado dos Cards dela. */
export interface PalavraDoAnki {
  word: string;
  /** Leituras do Word Reading em hiragana, juntas com ・ (何 → なに・なん). */
  reading: string;
  /** Entradas do JMdict; vazio: o Card fica guardado pela escrita. */
  jmdictIds: number[];
  estado: Exclude<Estado, 'desconhecida'>;
  /** Maior intervalo entre os Cards, em dias (aprendizado e novo contam 0). */
  intervalo: number;
  /** Todos os Cards suspensos. */
  suspensa: boolean;
  /** Algum Card com a etiqueta leech. */
  leech: boolean;
}

const chave = (word: string, reading: string) => `${word}|${reading}`;

export function leituraDoCard(card: Pick<CardAnki, 'word' | 'wordReading'>) {
  const leituras = leiturasDoCampo(card.wordReading);
  return leituras.length ? leituras.join('・') : paraHiragana(limparCampo(card.word));
}

/** Agrupa os Cards por Palavra e liga cada uma às entradas do JMdict. */
export async function palavrasDoAnki(cards: CardAnki[], consultar: Consulta) {
  const grupos = new Map<string, CardAnki[]>();

  for (const card of cards) {
    const word = limparCampo(card.word);
    if (!word) continue;
    const k = chave(word, leituraDoCard(card));
    grupos.set(k, [...(grupos.get(k) ?? []), card]);
  }

  const palavras: PalavraDoAnki[] = [];

  for (const [k, doGrupo] of grupos) {
    const [word, reading] = k.split('|');
    const { palavras: ligadas } = await casarCard(consultar, word, doGrupo[0].wordReading);

    palavras.push({
      word,
      reading,
      jmdictIds: [...new Set(ligadas.map((p) => p.seq))],
      estado: estadoDaPalavra(doGrupo, false) as PalavraDoAnki['estado'],
      intervalo: Math.max(...doGrupo.map((c) => Math.max(c.intervalo, 0))),
      suspensa: doGrupo.every((c) => c.suspenso),
      leech: doGrupo.some((c) => c.leech)
    });
  }

  return palavras;
}

/** Estado da Palavra a partir da linha do hub (sem linha: desconhecida). */
export function estadoDaLinha(
  linha: Pick<LinhaVocab, 'state' | 'ja_sei_at' | 'deleted_at'> | undefined
): Estado {
  if (!linha || linha.deleted_at) return 'desconhecida';
  return maisAvancado(linha.state as Estado, linha.ja_sei_at ? 'conhecida' : 'desconhecida');
}

const semServidor = ({ user_id: _, updated_at: __, ...resto }: LinhaVocab): NovaLinhaVocab => resto;

const mesmasEntradas = (a: number[] | null, b: number[]) =>
  (a ?? []).length === b.length && b.every((seq, i) => a?.[i] === seq);

/**
 * Linhas a gravar depois de ler o Anki: Palavras novas ou que mudaram; as que sumiram do Anki são
 * apagadas (soft delete), salvo as com "Já sei", que voltam a ser só ja_sei.
 */
export function atualizarHub(atuais: LinhaVocab[], doAnki: PalavraDoAnki[], agora: string) {
  const porChave = new Map(atuais.map((l) => [chave(l.word, l.reading), l]));
  const vistas = new Set<string>();
  const gravar: NovaLinhaVocab[] = [];

  for (const p of doAnki) {
    const k = chave(p.word, p.reading);
    const atual = porChave.get(k);
    vistas.add(k);

    const jaSei = atual && !atual.deleted_at ? atual.ja_sei_at : null;
    const igual =
      atual &&
      !atual.deleted_at &&
      atual.source === 'anki' &&
      atual.state === p.estado &&
      atual.interval_days === p.intervalo &&
      atual.suspended === p.suspensa &&
      atual.leech === p.leech &&
      atual.jmdict_id === (p.jmdictIds[0] ?? null) &&
      mesmasEntradas(atual.jmdict_ids, p.jmdictIds);

    if (igual) continue;

    gravar.push({
      word: p.word,
      reading: p.reading,
      jmdict_id: p.jmdictIds[0] ?? null,
      jmdict_ids: p.jmdictIds,
      source: 'anki',
      state: p.estado,
      interval_days: p.intervalo,
      suspended: p.suspensa,
      leech: p.leech,
      synced_at: agora,
      ja_sei_at: jaSei,
      modified_at: agora,
      deleted_at: null
    });
  }

  for (const atual of atuais) {
    if (atual.deleted_at || atual.source !== 'anki' || vistas.has(chave(atual.word, atual.reading)))
      continue;

    gravar.push(
      atual.ja_sei_at
        ? {
            ...semServidor(atual),
            source: 'ja_sei',
            state: 'conhecida',
            interval_days: null,
            suspended: false,
            leech: false,
            synced_at: agora,
            modified_at: agora
          }
        : { ...semServidor(atual), synced_at: agora, modified_at: agora, deleted_at: agora }
    );
  }

  return gravar;
}

/** Retrato para vocab_history: conhecidas (com "Já sei") e aprendendo. */
export function contarRetrato(linhas: LinhaVocab[]) {
  let known_count = 0;
  let learning_count = 0;

  for (const l of linhas) {
    const estado = estadoDaLinha(l);
    if (estado === 'conhecida') known_count += 1;
    else if (estado === 'aprendendo') learning_count += 1;
  }

  return { known_count, learning_count };
}

/** "Já sei" na entrada `seq`, gravado na forma (word, reading) que o painel mostra. */
export function marcarJaSei(
  atual: LinhaVocab | undefined,
  { word, reading, seq }: { word: string; reading: string; seq: number },
  agora: string
): NovaLinhaVocab {
  if (atual && !atual.deleted_at) {
    return { ...semServidor(atual), ja_sei_at: agora, modified_at: agora };
  }

  return {
    word,
    reading,
    jmdict_id: seq,
    jmdict_ids: [seq],
    source: 'ja_sei',
    state: 'conhecida',
    interval_days: null,
    suspended: false,
    leech: false,
    synced_at: null,
    ja_sei_at: agora,
    modified_at: agora,
    deleted_at: null
  };
}

/** Desfaz o "Já sei": a linha só ja_sei é apagada; a do Anki volta ao estado dos Cards. */
export function desfazerJaSei(atual: LinhaVocab, agora: string): NovaLinhaVocab {
  return {
    ...semServidor(atual),
    ja_sei_at: null,
    modified_at: agora,
    deleted_at: atual.source === 'ja_sei' ? agora : atual.deleted_at
  };
}

/** Lotes ainda não confirmados cujas cartas estão todas no Anki (Word e Word Reading). */
export function lotesConfirmados(lotes: LinhaLote[], cartas: LinhaCarta[], cards: CardAnki[]) {
  const noAnki = new Set<string>();

  for (const card of cards) {
    const word = limparCampo(card.word);
    for (const leitura of leiturasDoCampo(card.wordReading)) noAnki.add(chave(word, leitura));
  }

  return lotes
    .filter((lote) => !lote.deleted_at && !lote.confirmed_in_anki_at)
    .filter((lote) => {
      const doLote = cartas.filter((c) => c.lote_id === lote.id && !c.deleted_at);
      return (
        doLote.length > 0 &&
        doLote.every((c) => noAnki.has(chave(c.word, paraHiragana(c.word_reading))))
      );
    })
    .map((lote) => lote.id);
}
