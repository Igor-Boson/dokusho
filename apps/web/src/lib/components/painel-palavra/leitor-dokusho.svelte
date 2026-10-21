<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { pagePath } from '$lib/data/env';
  import { hideFurigana$, isOnline$ } from '$lib/data/store';
  import { escolherModoFurigana, furiganaModo$, type OpcaoFurigana } from '$lib/data/furigana/modo';
  import { pedirDicionario } from '$lib/components/dicionario/pedir-dicionario';
  import { ajustarSelecao, selecionar, type Selecao } from '$lib/data/dicionario/busca';
  import type { Entrada } from '$lib/data/dicionario/formato';
  import { consultarPalavra, tokenizador, verificarDicionario } from '$lib/data/dicionario/servico';
  import { paraHiragana, type Pedaco } from '$lib/data/dicionario/tokenizador';
  import { contextoDaFrase, fraseEm } from '$lib/data/cartas/frase';
  import { formaDaEntrada, montarCarta, ordenarEntradas } from '$lib/data/cartas/palavra';
  import { gerarPendentes } from '$lib/data/cartas/fila';
  import { traducaoEmCache, traduzirFrase } from '$lib/data/cartas/traduzir';
  import {
    cartasRecebidas$,
    sincronizador,
    sincronizarEmBreve,
    vocabMudou$
  } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { InfoDaPalavra } from '$lib/data/vocabulario/indice';
  import {
    alternarDestaque,
    desfazerJaSeiNaEntrada,
    destaqueLigado$,
    indiceDoHub,
    marcarJaSeiNaEntrada
  } from '$lib/data/vocabulario/servico';
  import { DestaqueNoTexto } from './destaque-dom';
  import { FuriganaNoTexto } from './furigana-dom';
  import { cobertura as calcularCobertura } from '$lib/data/vocabulario/perfil';
  import {
    garantirPerfil,
    lerPerfil,
    perfilPronto$,
    progressoDoPerfil$
  } from '$lib/data/vocabulario/perfis';
  import type { LinhaCarta } from '$lib/data/supabase/sincronizacao/regras';
  import { marcarLidos, mapearLivro, type MapaDoLivro } from './alcance-dom';
  import PainelPalavra from './painel-palavra.svelte';
  import {
    caractereNoPonto,
    lerParagrafo,
    paragrafoDe,
    posicaoNoParagrafo,
    rangeDoTexto,
    rubiDaSelecao,
    SELETOR_PARAGRAFO,
    type ParagrafoDoLivro
  } from './texto-do-dom';

  // O que o Dokusho põe no leitor do ttu (V1.3): toque na palavra e painel (ADR 0003, 0005), a
  // barra verde dos parágrafos lidos pelo Alcance e a barra do topo que aparece ao rolar para cima.
  // V2.2: destaque das palavras pelo estado do hub, o estado no painel e o "Já sei".
  // V3.1: furigana gerado e adaptativo (ADR 0015), escolhido no ふ da barra.

  export let titulo: string;
  export let htmlContent: string;
  export let exploredCharCount: number;
  export let verticalMode: boolean;
  export let isPaginated: boolean;
  export let corFundo: string;
  export let corTexto: string;
  /** A barra do topo do ttu (showHeader). */
  export let mostrarBarra = false;
  /** Para a barra do topo: "cobertura 87%" (V2.3), ou o progresso do cálculo. */
  export let cobertura = '';
  /** Hash do EPUB (ADR 0001), para "Palavras do livro". */
  export let livroId = '';

  const REALCE = 'dokusho-selecao';

  let aberto = false;
  let paragrafo: ParagrafoDoLivro | undefined;
  let pedacos: Pedaco[] = [];
  let selecao: Selecao | undefined;
  let entradas: Entrada[] = [];
  let indiceEntrada = 0;
  let rubi: string | undefined;
  let carregando = '';
  let cartas: LinhaCarta[] = [];
  let traducao: { frase: string; texto: string; cache: boolean } | undefined;
  let traduzindo = false;
  let erro = '';
  let confirmar: 'exportada' | 'anki' | undefined;
  let info: InfoDaPalavra | undefined;
  let mapa: MapaDoLivro | undefined;
  let alcance = 0;
  let ultimaRolagem: number | undefined;
  let toque = 0;
  let aEsquerda = false;

  const tokenizados = new WeakMap<Element, Pedaco[]>();

  async function pedacosDe(elemento: Element, texto: string) {
    let pedacosDoElemento = tokenizados.get(elemento);

    if (!pedacosDoElemento) {
      pedacosDoElemento = (await tokenizador()).tokenizar(texto);
      tokenizados.set(elemento, pedacosDoElemento);
    }

    return pedacosDoElemento;
  }

  const destaque = new DestaqueNoTexto({
    raiz: conteudo,
    consultar: consultarPalavra,
    indice: indiceDoHub,
    pedacosDe
  });

  const furigana = new FuriganaNoTexto({
    raiz: conteudo,
    consultar: consultarPalavra,
    indice: indiceDoHub,
    pedacosDe,
    aoMudar: (elemento) => {
      // Os nós de texto mudaram: o destaque e a seleção aberta são refeitos com os nós novos.
      destaque.repintarDepois();

      if (paragrafo?.elemento === elemento) {
        paragrafo = lerParagrafo(elemento);
        if (selecao) pintar(rangeDoTexto(paragrafo, selecao.inicio, selecao.fim));
      }
    }
  });

  /** Aplica o modo do furigana: o CSS mostra ou esconde, e o cálculo só roda nos modos gerados. */
  async function atualizarFurigana() {
    const modo = $furiganaModo$;
    const opcao: OpcaoFurigana = $hideFurigana$ ? 'nenhum' : modo;

    document.documentElement.dataset.dkFurigana = opcao;

    if (opcao === 'nenhum' || opcao === 'livro' || !(await verificarDicionario())) {
      furigana.desligar();
      return;
    }

    furigana.ligar();
    await furigana.atualizarEstados();
  }

  /** Menu ふ da barra. Os modos gerados precisam do dicionário (pede para baixar se faltar). */
  export async function escolherFurigana(opcao: OpcaoFurigana) {
    if (opcao === 'nenhum') {
      hideFurigana$.next(true);
      return;
    }

    if (opcao !== 'livro' && !(await pedirDicionario())) return;

    escolherModoFurigana(opcao);
    hideFurigana$.next(false);
  }

  /** Liga o destaque quando há dicionário e hub; sem eles, não baixa nada só para isso. */
  async function atualizarDestaque() {
    if (!$destaqueLigado$ || !(await verificarDicionario()) || (await indiceDoHub()).vazio) {
      destaque.desligar();
      return;
    }

    destaque.ligar();
    destaque.repintarDepois();
  }

  async function atualizarCobertura() {
    if (!livroId) return;

    const perfil = await lerPerfil(livroId);

    if (perfil)
      cobertura = `cobertura ${calcularCobertura(perfil, await indiceDoHub()).porcentagem}%`;
  }

  /** Perfil do livro em segundo plano, depois de a primeira tela se acomodar (V2.3). */
  async function prepararCobertura() {
    livroId = (await sincronizador().idDoLivro(titulo)) ?? titulo;
    await atualizarCobertura();
    await new Promise((r) => setTimeout(r, 3000));
    await garantirPerfil(livroId, async () => htmlContent);
    await atualizarCobertura();
  }

  /** Menu ⋯ da barra: liga ou desliga o destaque. */
  export function alternarDestaqueDoLeitor() {
    alternarDestaque();
    atualizarDestaque();
  }
  $: podeEncurtar = !!selecao && selecao.ultimo > selecao.primeiro;
  $: podeAlongar = !!selecao && selecao.ultimo + 1 < pedacos.length;
  $: if (exploredCharCount) atualizarAlcance(exploredCharCount);

  function conteudo() {
    return document.querySelector('.book-content');
  }

  /** Parágrafo do realce da seleção, para redesenhar quando ele sai. */
  let pintado: Element | undefined;

  function paragrafoDoRange(range: Range) {
    const no = range.startContainer;
    const elemento = no instanceof Element ? no : no.parentElement;

    return elemento?.closest(SELETOR_PARAGRAFO) ?? elemento ?? undefined;
  }

  /**
   * O Safari do iPhone deixa um resto do realce na tela quando ele sai de um trecho com o furigana
   * gerado (span com position: relative): só redesenha a área do kanji. Mexer na opacidade do
   * parágrafo por um quadro faz o Safari pintar o parágrafo inteiro de novo.
   */
  function redesenhar(elemento: Element | undefined) {
    if (!(elemento instanceof HTMLElement) || !elemento.isConnected) return;

    const antes = elemento.style.opacity;

    elemento.style.opacity = '0.999';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        elemento.style.opacity = antes;
      })
    );
  }

  function pintar(range?: Range) {
    const css = globalThis.CSS as unknown as {
      highlights?: Map<string, unknown>;
    };
    const Destaque = (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight;

    if (!css?.highlights || !Destaque) return;

    // Esvaziar antes de tirar: o Safari às vezes não redesenha só com o delete.
    (css.highlights.get(REALCE) as { clear?: () => void } | undefined)?.clear?.();
    redesenhar(pintado);
    pintado = range ? paragrafoDoRange(range) : undefined;

    if (range) {
      const realce = new Destaque(range) as { priority: number };

      // Acima do destaque das palavras.
      realce.priority = 1;
      css.highlights.set(REALCE, realce);
    } else css.highlights.delete(REALCE);
  }

  // No iOS, tocar num lugar sem nada clicável (margem, fim da tela) não gera "click"; o toque é
  // reconhecido pelo pointerdown/pointerup (sem arrastar), só para fechar o painel.
  let inicioDoToque: { x: number; y: number; quando: number } | undefined;

  function aoApertar(evento: PointerEvent) {
    inicioDoToque = { x: evento.clientX, y: evento.clientY, quando: Date.now() };
  }

  function aoSoltar(evento: PointerEvent) {
    const inicio = inicioDoToque;

    inicioDoToque = undefined;

    if (!inicio || !selecao) return;

    const arrastou =
      Math.abs(evento.clientX - inicio.x) > 10 || Math.abs(evento.clientY - inicio.y) > 10;

    if (arrastou || Date.now() - inicio.quando > 600) return;

    const alvo = evento.target as Element | null;

    if (!alvo || alvo.closest('.dokusho-painel, .dokusho-barra, button, a, input, textarea'))
      return;

    // Toque num caractere do livro: o click que vem depois troca a palavra.
    if (caractereNoPonto(evento.clientX, evento.clientY)) return;

    fechar();
  }

  export function fechar() {
    aberto = false;
    selecao = undefined;
    traducao = undefined;
    confirmar = undefined;
    erro = '';
    pintar();
  }

  async function aoTocar(evento: MouseEvent) {
    const alvo = evento.target as Element | null;

    if (!alvo || alvo.closest('.dokusho-painel')) return;

    const raiz = conteudo();

    if (!raiz || !raiz.contains(alvo)) {
      // Fora do texto: só fecha o painel (regra B). Botões do leitor seguem com o ttu.
      if (!alvo.closest('button, a, input, textarea, .dokusho-barra')) fechar();
      return;
    }

    if (alvo.closest('a, img, svg, button')) return;

    const ponto = caractereNoPonto(evento.clientX, evento.clientY);
    const elemento = ponto && paragrafoDe(ponto.no, raiz);

    if (!ponto || !elemento) {
      fechar();
      return;
    }

    const lido = lerParagrafo(elemento);
    const posicao = posicaoNoParagrafo(lido, ponto.no, ponto.deslocamento);

    if (posicao < 0) return;

    const meu = (toque += 1);

    if (!(await pedirDicionario())) return;

    let tk;

    if (!tokenizados.has(elemento)) {
      carregando = 'Carregando o tokenizador…';
      aberto = true;
      selecao = undefined;

      try {
        tk = await tokenizador();
      } catch (e) {
        carregando = '';
        erro = e instanceof Error ? e.message : String(e);
        return;
      }

      tokenizados.set(elemento, tk.tokenizar(lido.texto));
      carregando = '';
    }

    const pedacosDoParagrafo = tokenizados.get(elemento) as Pedaco[];
    const achada = await selecionar(consultarPalavra, pedacosDoParagrafo, posicao);

    if (meu !== toque) return;

    if (!achada) {
      // Pontuação: só fecha o painel.
      fechar();
      return;
    }

    paragrafo = lido;
    pedacos = pedacosDoParagrafo;
    aEsquerda = evento.clientX > window.innerWidth / 2;
    await mostrar(achada);
    mostrarBarra = false;
  }

  async function mostrar(nova: Selecao) {
    if (!paragrafo) return;

    selecao = nova;
    rubi = rubiDaSelecao(paragrafo, nova.inicio, nova.fim);

    const leituraDoTexto =
      rubi ||
      (nova.primeiro === nova.ultimo && pedacos[nova.primeiro].superficie === nova.termo
        ? pedacos[nova.primeiro].leitura
        : undefined);

    entradas = ordenarEntradas(nova.entradas, leituraDoTexto && paraHiragana(leituraDoTexto));
    indiceEntrada = 0;
    traducao = undefined;
    confirmar = undefined;
    erro = '';
    aberto = true;
    pintar(rangeDoTexto(paragrafo, nova.inicio, nova.fim));
    await atualizarCartas();
    await atualizarInfo();
    await mostrarTraducaoEmCache();
    rolarParaVer();
  }

  function rolarParaVer() {
    if (!paragrafo || !selecao || verticalMode || isPaginated || window.innerWidth >= 768) return;

    requestAnimationFrame(() => {
      if (!paragrafo || !selecao) return;

      const caixa = rangeDoTexto(paragrafo, selecao.inicio, selecao.fim).getBoundingClientRect();
      const painel = document.querySelector('.dokusho-painel')?.getBoundingClientRect();
      const limite = (painel?.top ?? window.innerHeight) - 24;

      if (caixa.bottom > limite)
        window.scrollBy({ top: caixa.bottom - limite, behavior: 'smooth' });
    });
  }

  function palavraAtual() {
    const entrada = entradas[indiceEntrada];

    return entrada && selecao ? formaDaEntrada(entrada, selecao.termo, rubi) : undefined;
  }

  /** Estado da entrada aberta no hub (ADR 0013: pela entrada, com qualquer leitura). */
  async function atualizarInfo() {
    const entrada = entradas[indiceEntrada];
    const palavra = palavraAtual();

    info =
      entrada && palavra && !selecao?.gramatica
        ? (await indiceDoHub()).daPalavra({
            seq: entrada.seq,
            leitura: paraHiragana(palavra.leitura)
          })
        : undefined;
  }

  async function jaSei() {
    const entrada = entradas[indiceEntrada];
    const palavra = palavraAtual();

    if (!entrada || !palavra) return;

    erro = '';

    try {
      if (info?.jaSei) await desfazerJaSeiNaEntrada(entrada.seq);
      else
        await marcarJaSeiNaEntrada({
          word: palavra.escrita,
          reading: paraHiragana(palavra.leitura),
          seq: entrada.seq
        });
    } catch (e) {
      erro = `Já sei: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function atualizarCartas() {
    const palavra = palavraAtual();

    cartas = palavra ? await sincronizador().cartasDaPalavra(palavra.escrita, palavra.leitura) : [];
  }

  function fraseAtual() {
    if (!paragrafo || !selecao) return undefined;

    const frase = fraseEm(paragrafo.texto, selecao.inicio, selecao.fim);
    const vizinhos = vizinhosDoParagrafo(paragrafo.elemento);

    return { frase, contexto: contextoDaFrase(paragrafo.texto, frase, ...vizinhos), vizinhos };
  }

  function vizinhosDoParagrafo(elemento: Element): [string, string] {
    const todos = [...(conteudo()?.querySelectorAll(SELETOR_PARAGRAFO) ?? [])];
    const i = todos.indexOf(elemento);
    const texto = (e?: Element) => (e ? lerParagrafo(e).texto : '');

    return [texto(todos[i - 1]), texto(todos[i + 1])];
  }

  async function mostrarTraducaoEmCache() {
    const atual = fraseAtual();

    if (!atual) return;

    const emCache = await traducaoEmCache(atual.frase.frase).catch(() => undefined);

    if (emCache) traducao = { frase: atual.frase.frase, texto: emCache, cache: true };
  }

  async function traduzir() {
    const atual = fraseAtual();

    if (!atual) return;

    traduzindo = true;
    erro = '';

    try {
      const { traducao: texto, cache } = await traduzirFrase(
        atual.frase.frase,
        atual.contexto.antes,
        atual.contexto.depois
      );

      traducao = { frase: atual.frase.frase, texto, cache };
      sincronizarEmBreve();
    } catch (e) {
      erro = `Tradução: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      traduzindo = false;
    }
  }

  async function criarCarta(mesmoAssim: boolean) {
    if (!paragrafo || !selecao) return;

    if (!mesmoAssim && cartas.some((carta) => carta.state === 'exportada')) {
      confirmar = 'exportada';
      return;
    }

    // Palavra que já está no Anki só entra na fila se você confirmar (ESCOPO "Regras da fila").
    if (!mesmoAssim && info?.noAnki) {
      confirmar = 'anki';
      return;
    }

    erro = '';

    try {
      const tk = await tokenizador();
      const [anterior, seguinte] = vizinhosDoParagrafo(paragrafo.elemento);
      const entrada = entradas[indiceEntrada];
      const carta = await montarCarta({
        id: crypto.randomUUID(),
        agora: new Date().toISOString(),
        livroId: (await sincronizador().idDoLivro(titulo)) ?? '',
        entrada,
        termo: entrada ? selecao.termo : selecao.texto,
        leituraPreferida: rubi,
        paragrafo: paragrafo.texto,
        inicio: selecao.inicio,
        fim: selecao.fim,
        paragrafoAnterior: anterior,
        paragrafoSeguinte: seguinte,
        tokenizar: (texto) => tk.tokenizar(texto),
        furiganaDoDicionario: async (superficie, leitura) =>
          (await consultarPalavra(superficie))
            .flatMap((e) => e.formas)
            .find((f) => f.e === superficie && paraHiragana(f.l) === leitura && f.fu)?.fu
      });

      await sincronizador().salvar('cartas', { ...carta, book_id: carta.book_id || null });
      confirmar = undefined;
      // Sobe a carta e pede a parte do Gemini (ADR 0010); offline, fica pendente.
      gerarPendentes();
      await atualizarCartas();
    } catch (e) {
      erro = `Criar carta: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function ajustar(delta: -1 | 1) {
    if (!selecao) return;

    await mostrar(await ajustarSelecao(consultarPalavra, pedacos, selecao, delta));
  }

  async function escolherEntrada(i: number) {
    indiceEntrada = i;
    confirmar = undefined;
    await atualizarCartas();
    await atualizarInfo();
  }

  let marcando: ReturnType<typeof setTimeout> | undefined;

  function marcarDepois() {
    clearTimeout(marcando);
    marcando = setTimeout(() => {
      const raiz = conteudo();

      if (!raiz || !htmlContent) return;
      if (!mapa) mapa = mapearLivro(htmlContent);

      marcarLidos(raiz, mapa, alcance);
      destaque.observarParagrafos();
      furigana.observarParagrafos();
    }, 300);
  }

  async function atualizarAlcance(explorado: number) {
    if (!titulo) return;

    alcance = await sincronizador().registrarAlcance(titulo, explorado);
    marcarDepois();
  }

  /** "Desmarcar a partir daqui" (menu do leitor): o Alcance volta para o ponto atual. */
  export async function desmarcarAPartirDaqui() {
    await sincronizador().desmarcarAPartirDe(titulo, exploredCharCount);
    alcance = exploredCharCount;
    marcarDepois();
  }

  function aoRolar() {
    if (isPaginated || aberto) {
      ultimaRolagem = undefined;
      return;
    }

    // Avanço da leitura: para baixo no horizontal, para a esquerda no vertical (vertical-rl).
    const posicao = verticalMode ? -window.scrollX : window.scrollY;

    if (ultimaRolagem === undefined) {
      ultimaRolagem = posicao;
      return;
    }

    const delta = posicao - ultimaRolagem;

    if (Math.abs(delta) < 12) return;

    mostrarBarra = delta < 0;
    ultimaRolagem = posicao;
  }

  let observador: MutationObserver | undefined;

  onMount(() => {
    window.addEventListener('click', aoTocar);
    window.addEventListener('pointerdown', aoApertar, { passive: true });
    window.addEventListener('pointerup', aoSoltar, { passive: true });
    window.addEventListener('scroll', aoRolar, { passive: true });

    const assinaturas = [
      cartasRecebidas$.subscribe(() => atualizarCartas()),
      vocabMudou$.subscribe(() => {
        atualizarInfo();
        atualizarDestaque();
        atualizarCobertura();
        furigana.atualizarEstados();
      }),
      furiganaModo$.subscribe(() => atualizarFurigana()),
      hideFurigana$.subscribe(() => atualizarFurigana()),
      perfilPronto$.subscribe((id) => id === livroId && atualizarCobertura()),
      progressoDoPerfil$.subscribe(({ livroId: id, fracao }) => {
        if (id === livroId) cobertura = `cobertura… ${Math.round(fracao * 100)}%`;
      })
    ];

    atualizarDestaque();
    prepararCobertura().catch(() => undefined);

    sincronizador()
      .alcanceDe(titulo)
      .then((valor) => {
        alcance = Math.max(valor, alcance);
        marcarDepois();
      });

    // No modo de páginas o ttu troca a seção na tela: marca de novo.
    observador = new MutationObserver(marcarDepois);

    const raiz = conteudo();

    if (raiz) observador.observe(raiz, { childList: true, subtree: true });

    return () => assinaturas.forEach((assinatura) => assinatura.unsubscribe());
  });

  onDestroy(() => {
    if (typeof window === 'undefined') return;

    window.removeEventListener('click', aoTocar);
    window.removeEventListener('pointerdown', aoApertar);
    window.removeEventListener('pointerup', aoSoltar);
    window.removeEventListener('scroll', aoRolar);
    observador?.disconnect();
    clearTimeout(marcando);
    destaque.desligar();
    furigana.desligar();
    delete document.documentElement.dataset.dkFurigana;
    pintar();
  });
</script>

{#if aberto}
  <PainelPalavra
    {selecao}
    {entradas}
    {indiceEntrada}
    {rubi}
    {carregando}
    {cartas}
    {info}
    {traducao}
    {traduzindo}
    {erro}
    {podeEncurtar}
    {podeAlongar}
    {confirmar}
    {corFundo}
    {corTexto}
    {aEsquerda}
    online={$isOnline$}
    on:encurtar={() => ajustar(-1)}
    on:alongar={() => ajustar(1)}
    on:entrada={(e) => escolherEntrada(e.detail)}
    on:fechar={fechar}
    on:traduzir={traduzir}
    on:criarCarta={(e) => criarCarta(e.detail.mesmoAssim)}
    on:jaSei={jaSei}
    on:abrirCarta={(e) => goto(`${pagePath}/fila?carta=${e.detail}`)}
  />
{/if}

<style lang="scss">
  // Furigana gerado (ADR 0015): a leitura num ::after que não ocupa lugar nem entra no texto.
  :global(html[data-dk-furigana='todos'] .dk-fg),
  :global(html[data-dk-furigana='adaptativo'] .dk-fg:not(.dk-fg--conhecida)) {
    position: relative;
  }

  // Sobre o kanji: o lado block-start, que é em cima no horizontal e à direita no vertical-rl
  // (o ::after herda o writing-mode do texto, então serve aos dois sem olhar a classe do ttu).
  // Centrada numa caixa mais larga que o kanji, para a leitura longa passar dos dois lados.
  :global(html[data-dk-furigana='todos'] .dk-fg::after),
  :global(html[data-dk-furigana='adaptativo'] .dk-fg:not(.dk-fg--conhecida)::after) {
    content: attr(data-r);
    position: absolute;
    inset-block-end: 100%;
    inset-inline: -4em;
    display: flex;
    justify-content: center;
    font-size: 0.5em;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }

  // Adaptativo também esconde o furigana do EPUB nas conhecidas (sem tirar o lugar dele).
  :global(html[data-dk-furigana='adaptativo'] ruby.dk-fg--conhecida rt) {
    visibility: hidden;
  }
</style>
