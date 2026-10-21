/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Pedaco } from '$lib/data/dicionario/tokenizador';
import { furiganaDoParagrafo, type LeituraGerada } from '$lib/data/furigana/gerado';
import { casarPedaco, type Consulta, type PalavraJmdict } from '$lib/data/vocabulario/casamento';
import type { IndiceDoHub } from '$lib/data/vocabulario/indice';
import { esquecerParagrafo, lerParagrafo, SELETOR_PARAGRAFO } from './texto-do-dom';

// Furigana gerado no texto do leitor (ADR 0015): cada trecho de kanji vira um
// <span class="dk-fg" data-r="leitura">, e a leitura aparece por um ::after (CSS no
// leitor-dokusho.svelte), sem entrar no texto que o ttu conta. Como o destaque, só os parágrafos
// perto da tela são calculados, um por vez; o resultado fica em memória pelo texto do parágrafo
// (a seção que o modo de páginas desenha de novo não é recalculada). O adaptativo é uma classe em
// cada span (`dk-fg--conhecida`), trocada quando o hub muda. O mesmo vale para o <ruby> que o EPUB
// já traz: no adaptativo, o furigana do livro também some nas palavras conhecidas.

export const CLASSE_FURIGANA = 'dk-fg';
export const CLASSE_CONHECIDA = 'dk-fg--conhecida';

/** Um trecho com furigana e a Palavra do pedaço (null: gramática). */
interface TrechoCalculado extends LeituraGerada {
  palavra: PalavraJmdict | null | undefined;
  base: string;
}

interface PalavraDoPedaco {
  palavra: PalavraJmdict | null | undefined;
  base: string;
}

/** Pedaço que cai dentro de um <ruby> do EPUB. */
interface PedacoNoRubi extends PalavraDoPedaco {
  inicio: number;
  fim: number;
}

interface Calculado {
  trechos: TrechoCalculado[];
  noRubi: PedacoNoRubi[];
}

/** Span do furigana gerado (um pedaço) ou <ruby> do EPUB (os pedaços que ele cobre). */
interface Envolvido {
  span: HTMLElement;
  itens: PalavraDoPedaco[];
}

export interface OpcoesFurigana {
  raiz: () => Element | null;
  pedacosDe: (elemento: Element, texto: string) => Promise<Pedaco[]>;
  consultar: Consulta;
  indice: () => Promise<IndiceDoHub>;
  /** O parágrafo ganhou spans: os nós de texto mudaram (seleção, destaque). */
  aoMudar: (elemento: Element) => void;
}

const LIMITE_DO_CACHE = 4000;

export class FuriganaNoTexto {
  private readonly feitos = new Map<Element, Envolvido[]>();

  private readonly calculados = new Map<string, Promise<Calculado>>();

  private readonly memo = new Map<string, Promise<PalavraJmdict | null | undefined>>();

  private readonly fila: Element[] = [];

  private readonly naFila = new Set<Element>();

  private observador: IntersectionObserver | undefined;

  private trabalhando = false;

  private ligado = false;

  /** Tempo gasto por parágrafo (ms) e quantos; para medir no aparelho. */
  readonly medida = { paragrafos: 0, ms: 0 };

  constructor(private readonly opcoes: OpcoesFurigana) {}

  ligar() {
    if (this.ligado) return;
    this.ligado = true;
    this.observador = new IntersectionObserver((vistos) => this.aoVer(vistos), {
      rootMargin: '100% 100% 100% 100%'
    });
    this.observarParagrafos();
  }

  /** Para de calcular; os spans que já existem ficam (o CSS esconde a leitura). */
  desligar() {
    this.ligado = false;
    this.observador?.disconnect();
    this.observador = undefined;
    this.fila.length = 0;
    this.naFila.clear();
  }

  /** O ttu trocou o que está na tela (modo de páginas): observa os parágrafos novos. */
  observarParagrafos() {
    const raiz = this.opcoes.raiz();
    if (!this.ligado || !raiz || !this.observador) return;
    for (const p of raiz.querySelectorAll(SELETOR_PARAGRAFO)) {
      if (!this.feitos.has(p)) this.observador.observe(p);
    }
  }

  /** O hub mudou: troca a classe das conhecidas, sem calcular nada de novo. */
  async atualizarEstados() {
    const indice = await this.opcoes.indice();
    for (const [elemento, envolvidos] of this.feitos) {
      if (!elemento.isConnected) {
        this.feitos.delete(elemento);
        continue;
      }
      for (const envolvido of envolvidos) this.marcarEstado(envolvido, indice);
    }
  }

  private marcarEstado({ span, itens }: Envolvido, indice: IndiceDoHub) {
    // Gramática (null) não está no hub. Conhecida só quando todas as palavras do trecho são; sem
    // nenhuma palavra (só gramática), o furigana aparece.
    const palavras = itens.filter((item) => item.palavra !== null);
    const conhecida =
      palavras.length > 0 &&
      palavras.every(
        ({ palavra, base }) => indice.daPedaco(palavra ?? undefined, base) === 'conhecida'
      );
    span.classList.toggle(CLASSE_CONHECIDA, conhecida);
  }

  private aoVer(vistos: IntersectionObserverEntry[]) {
    for (const visto of vistos) {
      if (!visto.isIntersecting || this.feitos.has(visto.target)) continue;
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
        if (!elemento.isConnected || this.feitos.has(elemento)) continue;
        // Parágrafo dentro de outro (li > p, blockquote > p): o de dentro faz o trabalho.
        if (elemento.querySelector(SELETOR_PARAGRAFO)) {
          this.feitos.set(elemento, []);
          this.observador?.unobserve(elemento);
          continue;
        }
        const inicio = performance.now();
        const { trechos, noRubi } = await this.calcular(elemento);
        if (!this.ligado) break;
        const envolvidos = elemento.isConnected
          ? [...this.rubisDoLivro(elemento, noRubi), ...this.envolver(elemento, trechos)]
          : [];
        this.feitos.set(elemento, envolvidos);
        this.observador?.unobserve(elemento);
        if (envolvidos.length) {
          const indice = await this.opcoes.indice();
          for (const envolvido of envolvidos) this.marcarEstado(envolvido, indice);
          if (envolvidos.some((e) => e.span.classList.contains(CLASSE_FURIGANA)))
            this.opcoes.aoMudar(elemento);
        }
        this.medida.paragrafos += 1;
        this.medida.ms += performance.now() - inicio;
        // Devolve a vez ao navegador entre um parágrafo e outro.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      this.trabalhando = false;
    }
  }

  private calcular(elemento: Element) {
    const { texto, rubis } = lerParagrafo(elemento);
    const chave = `${texto}\u0000${rubis.map((r) => `${r.inicio}-${r.fim}`).join(',')}`;
    let calculado = this.calculados.get(chave);
    if (!calculado) {
      if (this.calculados.size > LIMITE_DO_CACHE) this.calculados.clear();
      calculado = this.calcularTexto(elemento, texto, rubis);
      this.calculados.set(chave, calculado);
    }
    return calculado;
  }

  private async calcularTexto(
    elemento: Element,
    texto: string,
    rubis: { inicio: number; fim: number }[]
  ) {
    const pedacos = await this.opcoes.pedacosDe(elemento, texto);
    const trechos: TrechoCalculado[] = [];
    const noRubi: PedacoNoRubi[] = [];
    for (const pedaco of pedacos) {
      const fim = pedaco.inicio + pedaco.superficie.length;
      if (rubis.some((r) => r.inicio < fim && pedaco.inicio < r.fim))
        noRubi.push({
          inicio: pedaco.inicio,
          fim,
          palavra: await this.casar(pedaco),
          base: pedaco.base
        });
    }
    for (const { pedaco, leituras } of await furiganaDoParagrafo(
      this.opcoes.consultar,
      pedacos,
      rubis
    )) {
      const palavra = await this.casar(pedacos[pedaco]);
      for (const leitura of leituras)
        trechos.push({ ...leitura, palavra, base: pedacos[pedaco].base });
    }
    return { trechos, noRubi };
  }

  /** Cada <ruby> do EPUB com as palavras que ele cobre (para o adaptativo esconder o <rt>). */
  private rubisDoLivro(elemento: Element, noRubi: PedacoNoRubi[]): Envolvido[] {
    if (!noRubi.length) return [];
    const { trechos } = lerParagrafo(elemento);
    const envolvidos: Envolvido[] = [];
    for (const ruby of elemento.querySelectorAll('ruby')) {
      const dentro = trechos.filter((t) => ruby.contains(t.no));
      if (!dentro.length) continue;
      const inicio = dentro[0].inicio;
      const ultimo = dentro[dentro.length - 1];
      const fim = ultimo.inicio + ultimo.no.length;
      const itens = noRubi
        .filter((p) => p.inicio < fim && inicio < p.fim)
        .map(({ palavra, base }) => ({ palavra, base }));
      if (itens.length) envolvidos.push({ span: ruby as HTMLElement, itens });
    }
    return envolvidos;
  }

  /** null: gramática. */
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

  /**
   * Põe cada trecho num span. Do fim para o começo, para que o nó de texto original continue no
   * DOM (com o começo do texto, ou dentro do primeiro span): o ttu guarda referências a ele.
   */
  private envolver(elemento: Element, trechos: TrechoCalculado[]) {
    const { trechos: nos } = lerParagrafo(elemento);
    const comprimentos = nos.map((t) => t.no.length);
    const envolvidos: Envolvido[] = [];

    for (const trecho of [...trechos].sort((a, b) => b.inicio - a.inicio)) {
      const i = nos.findIndex(
        (t, j) => t.inicio <= trecho.inicio && trecho.fim <= t.inicio + comprimentos[j]
      );
      // Trecho que atravessa dois nós (palavra cortada por uma marca do livro): sem furigana.
      if (i < 0) continue;
      const { no, inicio } = nos[i];
      if (!no.isConnected || no.parentElement?.closest(`ruby, rt, .${CLASSE_FURIGANA}`)) continue;

      let alvo: Text = no;
      const a = trecho.inicio - inicio;
      const b = trecho.fim - inicio;
      if (b < alvo.length) alvo.splitText(b);
      if (a > 0) alvo = alvo.splitText(a);

      const span = document.createElement('span');
      span.className = CLASSE_FURIGANA;
      span.dataset.r = trecho.leitura;
      alvo.parentNode?.insertBefore(span, alvo);
      span.appendChild(alvo);
      envolvidos.push({ span, itens: [{ palavra: trecho.palavra, base: trecho.base }] });
    }

    if (envolvidos.length) esquecerParagrafo(elemento);

    return envolvidos;
  }
}
