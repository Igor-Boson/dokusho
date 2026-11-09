<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { hideFurigana$ } from '$lib/data/store';
  import { escolherModoFurigana, furiganaModo$, type OpcaoFurigana } from '$lib/data/furigana/modo';
  import { pedirDicionario } from '$lib/components/dicionario/pedir-dicionario';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import { indiceDoHub } from '$lib/data/vocabulario/servico';
  import { cobertura as calcularCobertura } from '$lib/data/vocabulario/perfil';
  import {
    garantirPerfil,
    lerPerfil,
    perfilPronto$,
    progressoDoPerfil$
  } from '$lib/data/vocabulario/perfis';
  import { marcarLidos, mapearLivro, type MapaDoLivro } from './alcance-dom';
  import ToqueNaPalavra from './toque-na-palavra.svelte';

  // O que o Dokusho põe no leitor do ttu (V1.3): o toque na palavra com o painel, o destaque e o
  // furigana (toque-na-palavra.svelte, comum com as Notícias; ADR 0017), a barra verde dos
  // parágrafos lidos pelo Alcance, a cobertura e a barra do topo que aparece ao rolar para cima.

  export let titulo: string;
  export let htmlContent: string;
  export let exploredCharCount: number;
  export let verticalMode: boolean;
  export let isPaginated: boolean;
  export let corFundo: string;
  export let corTexto: string;
  /** A barra do topo do ttu (showHeader). */
  export let mostrarBarra = false;
  /** Para a barra do topo: 'cobertura 87%' (V2.3), ou o progresso do cálculo. */
  export let cobertura = '';
  /** Hash do EPUB (ADR 0001), para 'Palavras do livro'. */
  export let livroId = '';

  let toque: ToqueNaPalavra | undefined;
  let aberto = false;
  let mapa: MapaDoLivro | undefined;
  let alcance = 0;
  let ultimaRolagem: number | undefined;

  $: opcaoFurigana = ($hideFurigana$ ? 'nenhum' : $furiganaModo$) as OpcaoFurigana;

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
    toque?.alternarDestaqueDoTexto();
  }

  $: if (exploredCharCount) atualizarAlcance(exploredCharCount);

  function conteudo() {
    return document.querySelector('.book-content');
  }

  let marcando: ReturnType<typeof setTimeout> | undefined;

  function marcarDepois() {
    clearTimeout(marcando);
    marcando = setTimeout(() => {
      const raiz = conteudo();

      if (!raiz || !htmlContent) return;
      if (!mapa) mapa = mapearLivro(htmlContent);

      marcarLidos(raiz, mapa, alcance);
      toque?.observarParagrafos();
    }, 300);
  }

  async function atualizarAlcance(explorado: number) {
    if (!titulo) return;

    alcance = await sincronizador().registrarAlcance(titulo, explorado);
    marcarDepois();
  }

  /** 'Desmarcar a partir daqui' (menu do leitor): o Alcance volta para o ponto atual. */
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
    window.addEventListener('scroll', aoRolar, { passive: true });

    const assinaturas = [
      vocabMudou$.subscribe(() => atualizarCobertura()),
      perfilPronto$.subscribe((id) => id === livroId && atualizarCobertura()),
      progressoDoPerfil$.subscribe(({ livroId: id, fracao }) => {
        if (id === livroId) cobertura = `cobertura… ${Math.round(fracao * 100)}%`;
      })
    ];

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

    window.removeEventListener('scroll', aoRolar);
    observador?.disconnect();
    clearTimeout(marcando);
  });
</script>

<ToqueNaPalavra
  bind:this={toque}
  bind:aberto
  raiz={conteudo}
  origemDaCarta={async () => (await sincronizador().idDoLivro(titulo)) ?? ''}
  furiganaOpcao={opcaoFurigana}
  {corFundo}
  {corTexto}
  rolarAtePalavra={!verticalMode && !isPaginated}
  on:abriu={() => (mostrarBarra = false)}
/>
