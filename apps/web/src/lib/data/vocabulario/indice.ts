/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { LinhaVocab } from '$lib/data/supabase/sincronizacao/regras';
import { indexarAnki, noAnki, type IndiceAnki, type PalavraJmdict } from './casamento';
import { maisAvancado, type Estado } from './estados';
import { estadoDaLinha } from './hub';

// O hub em memória para o texto (ADR 0008, 0013): uma palavra do texto tem o estado das linhas que
// caem na mesma entrada do JMdict, com qualquer leitura; o "Já sei" também vale para a entrada.
// Linha sem entrada (Card que não casou) vale pela escrita.

export interface InfoDaPalavra {
  estado: Estado;
  /** Estado só pelos Cards do Anki. */
  estadoNoAnki: Estado;
  noAnki: boolean;
  jaSei: boolean;
  /** Leitura do Card quando nenhuma é a do texto ("no Anki como <leitura>"). */
  comoNoAnki?: string;
}

export class IndiceDoHub {
  private readonly porEntrada = new Map<number, LinhaVocab[]>();

  private readonly porEscrita = new Map<string, Estado>();

  private readonly anki: IndiceAnki;

  constructor(linhas: LinhaVocab[]) {
    const doAnki: PalavraJmdict[] = [];

    for (const linha of linhas) {
      if (linha.deleted_at) continue;
      const entradas = linha.jmdict_ids ?? (linha.jmdict_id ? [linha.jmdict_id] : []);

      if (!entradas.length) {
        const atual = this.porEscrita.get(linha.word) ?? 'desconhecida';
        this.porEscrita.set(linha.word, maisAvancado(atual, estadoDaLinha(linha)));
        continue;
      }

      for (const seq of entradas) {
        this.porEntrada.set(seq, [...(this.porEntrada.get(seq) ?? []), linha]);
        if (linha.source === 'anki') {
          for (const leitura of linha.reading.split('・')) doAnki.push({ seq, leitura });
        }
      }
    }

    this.anki = indexarAnki(doAnki);
  }

  daPalavra(palavra: PalavraJmdict): InfoDaPalavra {
    const linhas = this.porEntrada.get(palavra.seq) ?? [];
    const doAnki = linhas.filter((l) => l.source === 'anki');
    const estadoNoAnki = maisAvancado(...doAnki.map((l) => l.state as Estado));
    const jaSei = linhas.some((l) => l.ja_sei_at);
    const anki = noAnki(this.anki, palavra);

    return {
      estado: maisAvancado(estadoNoAnki, jaSei ? 'conhecida' : 'desconhecida'),
      estadoNoAnki,
      noAnki: doAnki.length > 0,
      jaSei,
      comoNoAnki: anki?.outraLeitura ? anki.leituras[0] : undefined
    };
  }

  /** Estado de um pedaço do texto: pela entrada; sem entrada, pela forma de dicionário. */
  daPedaco(palavra: PalavraJmdict | undefined, base: string): Estado {
    if (palavra) {
      const estado = this.daPalavra(palavra).estado;
      if (estado !== 'desconhecida') return estado;
    }
    return this.porEscrita.get(base) ?? 'desconhecida';
  }

  /** O hub tem uma Palavra sem entrada com esta escrita (Card que não casou com o JMdict). */
  temEscrita(escrita: string) {
    return this.porEscrita.has(escrita);
  }

  /** Sem nenhuma linha (o Anki nunca foi sincronizado e não há "Já sei"). */
  get vazio() {
    return !this.porEntrada.size && !this.porEscrita.size;
  }

  linhasDaEntrada(seq: number) {
    return this.porEntrada.get(seq) ?? [];
  }

  entradasNoAnki() {
    return new Set(this.anki.keys());
  }
}
