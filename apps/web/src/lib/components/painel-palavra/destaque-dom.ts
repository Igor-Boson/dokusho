/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import { casarPedaco, type Consulta, type PalavraJmdict } from '$lib/data/vocabulario/casamento';
import type { IndiceDoHub } from '$lib/data/vocabulario/indice';
import { lerParagrafo, rangeDoTexto, SELETOR_PARAGRAFO } from './texto-do-dom';

// Destaque das palavras no texto pelo estado (ESCOPO "Hub de vocabulário"): aprendendo e
// desconhecida ganham um realce (CSS Custom Highlight API, sem mexer no DOM do ttu, que conta os
// caracteres pelo layout); conhecida, gramática e palavra fora do dicionário ficam sem nada.
// Só os parágrafos perto da tela são tokenizados, um por vez, para não travar o livro inteiro de
// uma vez no iPhone; cada parágrafo é casado uma vez só e repintado quando o hub muda.

export const DESTAQUE_APRENDENDO = 'dokusho-aprendendo';
export const DESTAQUE_DESCONHECIDA = 'dokusho-desconhecida';

interface PedacoCasado {
  inicio: number;
  fim: number;
  base: string;
  palavra?: PalavraJmdict;
}

type Highlights = Map<string, unknown>;
type HighlightCtor = new (...ranges: Range[]) => { add(r: Range): void; priority: number };

function api() {
  const highlights = (globalThis.CSS as unknown as { highlights?: Highlights })?.highlights;
  const Destaque = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  return highlights && Destaque ? { highlights, Destaque } : undefined;
}

export interface OpcoesDestaque {
  raiz: () => Element | null;
  pedacosDe: (elemento: Element, texto: string) => Promise<Pedaco[]>;
  consultar: Consulta;
  indice: () => Promise<IndiceDoHub>;
}

export class DestaqueNoTexto {
  private readonly casados = new Map<Element, PedacoCasado[]>();

  private readonly fila: Element[] = [];

  private readonly naFila = new Set<Element>();

  private readonly memo = new Map<string, Promise<PalavraJmdict | null | undefined>>();

  private observador: IntersectionObserver | undefined;

  private trabalhando = false;

  private ligado = false;

  private agendado: ReturnType<typeof setTimeout> | undefined;

  /** Tempo gasto casando parágrafos (ms) e quantos; para medir no aparelho. */
  readonly medida = { paragrafos: 0, ms: 0 };

  constructor(private readonly opcoes: OpcoesDestaque) {}

  ligar() {
    if (this.ligado || !api()) return;
    this.ligado = true;
    this.observador = new IntersectionObserver((vistos) => this.aoVer(vistos), {
      rootMargin: '100% 100% 100% 100%'
    });
    this.observarParagrafos();
  }

  desligar() {
    this.ligado = false;
    this.observador?.disconnect();
    this.observador = undefined;
    this.fila.length = 0;
    this.naFila.clear();
    clearTimeout(this.agendado);
    const a = api();
    a?.highlights.delete(DESTAQUE_APRENDENDO);
    a?.highlights.delete(DESTAQUE_DESCONHECIDA);
  }

  /** O ttu trocou o que está na tela (modo de páginas): observa os parágrafos novos. */
  observarParagrafos() {
    const raiz = this.opcoes.raiz();
    if (!this.ligado || !raiz || !this.observador) return;
    for (const p of raiz.querySelectorAll(SELETOR_PARAGRAFO)) {
      if (!this.casados.has(p)) this.observador.observe(p);
    }
    this.repintarDepois();
  }

  /** O hub mudou: repinta tudo o que já foi casado, sem tokenizar de novo. */
  repintarDepois() {
    clearTimeout(this.agendado);
    this.agendado = setTimeout(() => this.repintar(), 50);
  }

  private aoVer(vistos: IntersectionObserverEntry[]) {
    for (const visto of vistos) {
      if (!visto.isIntersecting || this.casados.has(visto.target)) continue;
      if (!this.naFila.has(visto.target)) {
        this.naFila.add(visto.target);
        this.fila.push(visto.target);
      }
    }
    this.trabalhar();
  }

  private async trabalhar() {
    if (this.trabalhando) return;
    this.trabalhando = true;
    try {
      while (this.ligado && this.fila.length) {
        const elemento = this.fila.shift() as Element;
        this.naFila.delete(elemento);
        if (!elemento.isConnected || this.casados.has(elemento)) continue;
        const inicio = performance.now();
        this.casados.set(elemento, await this.casarParagrafo(elemento));
        this.observador?.unobserve(elemento);
        this.medida.paragrafos += 1;
        this.medida.ms += performance.now() - inicio;
        this.repintarDepois();
        // Devolve a vez ao navegador entre um parágrafo e outro.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      this.trabalhando = false;
    }
  }

  private async casarParagrafo(elemento: Element) {
    const { texto } = lerParagrafo(elemento);
    const pedacos = await this.opcoes.pedacosDe(elemento, texto);
    const casados: PedacoCasado[] = [];

    for (const pedaco of pedacos) {
      const palavra = await this.casar(pedaco);
      if (palavra === null) continue;
      casados.push({
        inicio: pedaco.inicio,
        fim: pedaco.inicio + pedaco.superficie.length,
        base: pedaco.base,
        palavra
      });
    }

    return casados;
  }

  /** null: gramática (nunca destacada). */
  private casar(pedaco: Pedaco) {
    const chave = [
      pedaco.base,
      pedaco.superficie,
      pedaco.leitura,
      pedaco.classe,
      pedaco.subclasse
    ].join('|');
    let palavra = this.memo.get(chave);
    if (!palavra) {
      palavra = casarPedaco(this.opcoes.consultar, pedaco).then((r) => (r ? r.palavra : null));
      this.memo.set(chave, palavra);
    }
    return palavra;
  }

  private async repintar() {
    const a = api();
    if (!this.ligado || !a) return;
    const indice = await this.opcoes.indice();
    const aprendendo = new a.Destaque();
    const desconhecida = new a.Destaque();

    for (const [elemento, pedacos] of this.casados) {
      if (!elemento.isConnected) {
        this.casados.delete(elemento);
        continue;
      }
      const paragrafo = lerParagrafo(elemento);
      for (const p of pedacos) {
        const estado = indice.daPedaco(p.palavra, p.base);
        // Fora do dicionário (nomes, onomatopeias) só aparece se o Anki tem a escrita.
        if (estado === 'aprendendo') aprendendo.add(rangeDoTexto(paragrafo, p.inicio, p.fim));
        else if (estado === 'desconhecida' && p.palavra)
          desconhecida.add(rangeDoTexto(paragrafo, p.inicio, p.fim));
      }
    }

    a.highlights.set(DESTAQUE_APRENDENDO, aprendendo);
    a.highlights.set(DESTAQUE_DESCONHECIDA, desconhecida);
  }
}
