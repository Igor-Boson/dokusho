<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { pedirDicionario } from '$lib/components/dicionario/pedir-dicionario';
  import ToqueNaPalavra from '$lib/components/painel-palavra/toque-na-palavra.svelte';
  import { pagePath } from '$lib/data/env';
  import { dataDaNoticia } from '$lib/data/noticias/datas';
  import { proximaDaEdicao } from '$lib/data/noticias/edicao';
  import { fotoDe, garantirFotos } from '$lib/data/noticias/fotos';
  import { origemDaNoticia } from '$lib/data/noticias/origem';
  import {
    escolherFuriganaDasNoticias,
    furiganaDasNoticias$,
    hoje,
    lerNoticia,
    lerNoticias,
    marcarLida,
    type FuriganaDasNoticias
  } from '$lib/data/noticias/servico';
  import { noticiasRecebidas$, sincronizador } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { LinhaNoticia } from '$lib/data/supabase/sincronizacao/regras';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Leitura de uma Notícia (ESCOPO "Notícias da NHK Easy"): foto, data, título e texto, com o
  // toque na palavra, o painel e as Cartas dos livros (ADR 0017). "Lida" abre a próxima da Edição.

  const OPCOES: { valor: FuriganaDasNoticias; rotulo: string }[] = [
    { valor: 'nenhum', rotulo: 'Sem furigana' },
    { valor: 'livro', rotulo: 'Furigana da NHK' },
    { valor: 'adaptativo', rotulo: 'Adaptativo (só o que você não sabe)' }
  ];

  let noticia: LinhaNoticia | undefined;
  let carregado = false;
  let lidaEm: string | undefined;
  let foto: string | undefined;
  let texto: HTMLElement | undefined;
  let toque: ToqueNaPalavra | undefined;
  let menuAberto = false;

  $: id = browser ? ($page.url.searchParams.get('id') ?? '') : '';
  $: doHistorico = browser && $page.url.searchParams.get('de') === 'historico';
  $: voltar = `${pagePath}/noticias${doHistorico ? '/historico' : ''}`;
  $: if (id) abrir(id);

  async function abrir(alvo: string) {
    toque?.fechar();
    menuAberto = false;
    noticia = await lerNoticia(alvo);
    lidaEm = (await sincronizador().ler('noticiasLidas', alvo))?.read_at;
    carregado = true;
    trocarFoto(await fotoDe(alvo));
    await tick();
    toque?.observarParagrafos();

    if (!foto && noticia?.image_url) {
      await garantirFotos([alvo]);
      if (alvo === id) trocarFoto(await fotoDe(alvo));
    }
  }

  function trocarFoto(nova: string | undefined) {
    if (foto) URL.revokeObjectURL(foto);
    foto = nova;
  }

  async function terminar() {
    if (!noticia) return;

    const atual = noticia.news_id;

    await marcarLida(atual);

    const edicao = (await sincronizador().ler('edicoes', hoje()))?.news_ids ?? [];

    if (doHistorico || !edicao.includes(atual)) {
      await goto(voltar);
      return;
    }

    const { idsLidos } = await lerNoticias();
    const proxima = proximaDaEdicao(edicao, idsLidos, atual);

    await goto(proxima ? `${pagePath}/noticias/ler?id=${proxima}` : `${pagePath}/noticias`, {
      replaceState: true
    });
  }

  async function desmarcar() {
    if (!noticia) return;

    await marcarLida(noticia.news_id, false);
    lidaEm = undefined;
  }

  async function escolher(opcao: FuriganaDasNoticias) {
    menuAberto = false;

    // O adaptativo precisa do dicionário e do hub (pede para baixar se faltar).
    if (opcao === 'adaptativo' && !(await pedirDicionario())) return;

    escolherFuriganaDasNoticias(opcao);
  }

  onMount(() => {
    const assinatura = noticiasRecebidas$.subscribe(async () => {
      if (!noticia && id) await abrir(id);
    });

    return () => assinatura.unsubscribe();
  });

  onDestroy(() => trocarFoto(undefined));
</script>

<svelte:head>
  <title>{formatPageTitle(noticia?.title ?? 'Notícia')}</title>
</svelte:head>

<div class="dokusho-barra dokusho-leitura__barra">
  <a href={voltar} aria-label="Voltar">‹</a>
  <span>{doHistorico ? 'Histórico' : 'Notícias'}</span>
  <div class="dokusho-leitura__menu">
    <button
      aria-label="Furigana"
      aria-expanded={menuAberto}
      on:click|stopPropagation={() => (menuAberto = !menuAberto)}>ふ</button
    >
    {#if menuAberto}
      <ul role="menu">
        {#each OPCOES as opcao}
          <li>
            <button
              role="menuitemradio"
              aria-checked={$furiganaDasNoticias$ === opcao.valor}
              on:click={() => escolher(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<main class="dokusho-leitura">
  {#if !carregado}
    <p class="dokusho-leitura__vazio">Carregando…</p>
  {:else if !noticia?.body_html}
    <p class="dokusho-leitura__vazio">Esta notícia ainda não foi baixada neste aparelho.</p>
  {:else}
    {#if foto}
      <img class="dokusho-leitura__foto" src={foto} alt="" />
    {/if}
    <p class="dokusho-leitura__data" lang="ja">{dataDaNoticia(noticia.published_at)}</p>
    <article
      class="dokusho-leitura__texto"
      class:dokusho-leitura__texto--sem-furigana={$furiganaDasNoticias$ === 'nenhum'}
      lang="ja"
      bind:this={texto}
    >
      <!-- HTML limpo pela Coleta: só <p>, <ruby> e <rt>, sem atributos (nhk.ts › limparHtml). -->
      <h1>{@html noticia.title_ruby}</h1>
      {@html noticia.body_html}
    </article>

    <footer class="dokusho-leitura__fim">
      {#if lidaEm}
        <p>Lida.</p>
        <button class="dokusho-leitura__secundario" on:click={desmarcar}>Desmarcar lida</button>
        <a class="dokusho-leitura__secundario" href={voltar}>Voltar</a>
      {:else}
        <button class="dokusho-leitura__lida" on:click={terminar}>Lida</button>
      {/if}
    </footer>
  {/if}
</main>

{#if noticia}
  <ToqueNaPalavra
    bind:this={toque}
    raiz={() => texto ?? null}
    origemDaCarta={async () => origemDaNoticia(noticia?.news_id ?? id)}
    furiganaOpcao={$furiganaDasNoticias$}
    corFundo="var(--dk-surface)"
    corTexto="var(--dk-ink)"
  />
{/if}

<style lang="scss">
  .dokusho-leitura__barra {
    position: sticky;
    top: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    padding: env(safe-area-inset-top, 0px) 8px 0;
    background: var(--dk-surface);
    border-bottom: 1px solid var(--dk-line);
    color: var(--dk-ink);
    font-family: 'Noto Sans JP', system-ui, sans-serif;

    > a,
    .dokusho-leitura__menu > button {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 44px;
      font-size: 22px;
    }

    span {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
    }
  }

  .dokusho-leitura__menu {
    position: relative;

    ul {
      position: absolute;
      right: 0;
      top: 44px;
      min-width: 240px;
      padding: 6px;
      border-radius: 12px;
      background: var(--dk-surface);
      box-shadow: 0 4px 16px var(--dk-shadow);
    }

    li button {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      text-align: left;
      font-size: 14px;

      &[aria-checked='true'] {
        background: var(--dk-accent-soft);
        color: var(--dk-accent);
        font-weight: 700;
      }
    }
  }

  .dokusho-leitura {
    max-width: 680px;
    margin: 0 auto;
    padding: 16px 20px calc(45vh + env(safe-area-inset-bottom, 0px));
    color: var(--dk-ink);
  }

  .dokusho-leitura__foto {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 12px;
    background: var(--dk-sunk);
  }

  .dokusho-leitura__data {
    margin-top: 14px;
    font-size: 13px;
    color: var(--dk-ink2);
  }

  .dokusho-leitura__texto {
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    font-size: 20px;
    line-height: 2.1;

    :global(h1) {
      margin: 6px 0 18px;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.8;
    }

    :global(p) {
      margin-bottom: 1em;
    }

    :global(rt) {
      font-size: 0.5em;
    }
  }

  .dokusho-leitura__texto--sem-furigana :global(rt) {
    display: none;
  }

  .dokusho-leitura__fim {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 28px;
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink2);
  }

  .dokusho-leitura__lida {
    width: 100%;
    max-width: 320px;
    padding: 14px;
    border-radius: 14px;
    background: var(--dk-accent);
    color: var(--dk-accent-ink);
    font-size: 17px;
    font-weight: 700;
  }

  .dokusho-leitura__secundario {
    padding: 8px 14px;
    color: var(--dk-accent);
    font-weight: 700;
  }

  .dokusho-leitura__vazio {
    margin-top: 40px;
    text-align: center;
    color: var(--dk-ink2);
    font-family: 'Noto Sans JP', system-ui, sans-serif;
  }
</style>
