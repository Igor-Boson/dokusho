<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import AvisoColeta from '$lib/components/noticias/aviso-coleta.svelte';
  import { pagePath } from '$lib/data/env';
  import { estadoDaEdicao } from '$lib/data/noticias/edicao';
  import { fotoDe, garantirFotos } from '$lib/data/noticias/fotos';
  import {
    coberturasDasNoticias,
    coletando$,
    coletar,
    definirPorDia,
    edicaoDeHoje,
    hoje,
    lerNoticias,
    porDia$
  } from '$lib/data/noticias/servico';
  import { dataDaNoticia } from '$lib/data/noticias/datas';
  import {
    noticiasRecebidas$,
    sincronizador,
    sincronizarAgora,
    vocabMudou$
  } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { LinhaColeta, LinhaNoticia } from '$lib/data/supabase/sincronizacao/regras';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Edição do dia (ESCOPO "Notícias da NHK Easy"): as N Notícias de hoje, que somem ao serem lidas;
  // com todas lidas, 今日はここまで e mais nada para rolar.

  let carregado = false;
  let edicao: string[] | undefined;
  let noticias = new Map<string, LinhaNoticia>();
  let idsLidos = new Set<string>();
  let coleta: LinhaColeta | undefined;
  let fotos = new Map<string, string>();
  /** "92% · 6 desconhecidas" de cada Notícia da Edição (com dicionário e hub neste aparelho). */
  let coberturas = new Map<string, string>();
  let erroDaBusca = '';
  /** Antes da primeira rodada de sincronização, só mostra a Edição já gravada (não escolhe outra). */
  let podeEscolher = false;

  $: estado = estadoDaEdicao(edicao, idsLidos);
  $: pendentes = estado.pendentes
    .map((id) => noticias.get(id))
    .filter((n): n is LinhaNoticia => !!n);

  async function carregar() {
    const lido = await lerNoticias();

    noticias = lido.noticias;
    idsLidos = lido.idsLidos;
    coleta = lido.coleta;
    edicao = podeEscolher
      ? await edicaoDeHoje()
      : (await sincronizador().ler('edicoes', hoje()))?.news_ids;
    carregado = true;
    await Promise.all([carregarFotos(), carregarCoberturas()]);
  }

  async function carregarCoberturas() {
    const daEdicao = (edicao ?? [])
      .map((id) => noticias.get(id))
      .filter((n): n is LinhaNoticia => !!n);

    coberturas = await coberturasDasNoticias(daEdicao).catch(() => coberturas);
  }

  async function carregarFotos() {
    const ids = edicao ?? [];
    const novas = new Map(fotos);

    for (const id of ids) {
      if (!novas.has(id)) {
        const url = await fotoDe(id);

        if (url) novas.set(id, url);
      }
    }

    fotos = novas;
  }

  async function buscarAgora() {
    erroDaBusca = (await coletar(true)) ?? '';
    await carregar();
  }

  async function prepararEmSegundoPlano() {
    // Sincroniza antes de escolher a Edição, para não escolher outra quando o outro aparelho já
    // escolheu a de hoje (ou já leu alguma). Sem rede (ou demorando), segue com o que tem.
    if (navigator.onLine) {
      await Promise.race([sincronizarAgora(), new Promise((r) => setTimeout(r, 6000))]);
    }

    podeEscolher = true;
    await carregar();

    const erro = await coletar();

    if (erro) erroDaBusca = erro;
    await carregar();

    if (edicao?.length) {
      await garantirFotos(edicao);
      await carregarFotos();
    }
  }

  onMount(() => {
    const assinaturas = [
      noticiasRecebidas$.subscribe(() => carregar()),
      vocabMudou$.subscribe(() => carregarCoberturas())
    ];

    carregar().then(prepararEmSegundoPlano);

    return () => assinaturas.forEach((assinatura) => assinatura.unsubscribe());
  });

  onDestroy(() => fotos.forEach((url) => URL.revokeObjectURL(url)));
</script>

<svelte:head>
  <title>{formatPageTitle('Notícias')}</title>
</svelte:head>

<main class="dokusho-noticias">
  <header>
    <h1>Notícias</h1>
    {#if estado.total}
      <span class="dokusho-noticias__progresso">{estado.lidas} de {estado.total}</span>
    {/if}
  </header>

  <AvisoColeta {coleta} erro={erroDaBusca} />

  {#if !carregado}
    <p class="dokusho-noticias__vazio">Carregando…</p>
  {:else if estado.acabou}
    <section class="dokusho-noticias__fim">
      <p class="dokusho-noticias__fim-jp" lang="ja">今日はここまで</p>
      <p>
        Você leu {estado.total === 1 ? 'a notícia' : `as ${estado.total} notícias`} de hoje. As próximas
        chegam amanhã.
      </p>
    </section>
  {:else if pendentes.length}
    <ol class="dokusho-noticias__lista">
      {#each pendentes as noticia (noticia.news_id)}
        <li>
          <a href="{pagePath}/noticias/ler?id={noticia.news_id}">
            {#if fotos.get(noticia.news_id)}
              <img src={fotos.get(noticia.news_id)} alt="" />
            {:else}
              <span class="dokusho-noticias__sem-foto" />
            {/if}
            <div>
              <b lang="ja">{noticia.title}</b>
              <small lang="ja">{dataDaNoticia(noticia.published_at)}</small>
              {#if coberturas.get(noticia.news_id)}
                <small class="dokusho-noticias__cobertura">{coberturas.get(noticia.news_id)}</small>
              {/if}
            </div>
          </a>
        </li>
      {/each}
    </ol>
  {:else if $coletando$}
    <p class="dokusho-noticias__vazio">Buscando as notícias da NHK…</p>
  {:else}
    <section class="dokusho-noticias__vazio">
      <p>Nenhuma notícia baixada ainda.</p>
      <button class="dokusho-noticias__botao" on:click={buscarAgora}>Buscar agora</button>
    </section>
  {/if}

  <footer class="dokusho-noticias__rodape">
    <a href="{pagePath}/noticias/historico">Histórico de notícias</a>
    <div class="dokusho-noticias__por-dia">
      <span>Notícias por dia</span>
      <button
        aria-label="Menos notícias por dia"
        disabled={$porDia$ <= 1}
        on:click={() => definirPorDia($porDia$ - 1)}>−</button
      >
      <b>{$porDia$}</b>
      <button
        aria-label="Mais notícias por dia"
        disabled={$porDia$ >= 10}
        on:click={() => definirPorDia($porDia$ + 1)}>+</button
      >
    </div>
    <small>Vale a partir da próxima Edição do dia.</small>
  </footer>
</main>

<NavegacaoInferior />

<style lang="scss">
  .dokusho-noticias {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 18px calc(120px + env(safe-area-inset-bottom, 0px));
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink);

    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 22px 0 10px;
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
    }
  }

  .dokusho-noticias__progresso {
    font-size: 15px;
    font-weight: 700;
    color: var(--dk-accent);
  }

  .dokusho-noticias__lista {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 6px;

    a {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 14px;
      align-items: center;
      padding: 12px;
      border-radius: 16px;
      background: var(--dk-surface);
      box-shadow: 0 1px 3px var(--dk-shadow);
    }

    img,
    .dokusho-noticias__sem-foto {
      width: 96px;
      height: 54px;
      border-radius: 8px;
      object-fit: cover;
      background: var(--dk-sunk);
    }

    b {
      display: block;
      font-size: 16px;
      line-height: 1.5;
    }

    small {
      font-size: 12px;
      color: var(--dk-ink2);
    }
  }

  .dokusho-noticias__lista .dokusho-noticias__cobertura {
    display: block;
    margin-top: 2px;
    color: var(--dk-read);
    font-weight: 700;
  }

  .dokusho-noticias__fim {
    margin-top: 48px;
    text-align: center;
    color: var(--dk-ink2);
    line-height: 1.6;

    .dokusho-noticias__fim-jp {
      margin-bottom: 12px;
      font-size: 32px;
      font-weight: 700;
      color: var(--dk-ink);
    }
  }

  .dokusho-noticias__vazio {
    margin-top: 40px;
    text-align: center;
    color: var(--dk-ink2);
  }

  .dokusho-noticias__botao {
    margin-top: 14px;
    padding: 10px 18px;
    border-radius: 12px;
    background: var(--dk-accent);
    color: var(--dk-accent-ink);
    font-weight: 700;
  }

  .dokusho-noticias__rodape {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 48px;
    font-size: 14px;
    color: var(--dk-ink2);

    > a {
      color: var(--dk-accent);
      font-weight: 700;
    }

    small {
      font-size: 12px;
      color: var(--dk-ink3);
    }
  }

  .dokusho-noticias__por-dia {
    display: flex;
    align-items: center;
    gap: 10px;

    button {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--dk-surface);
      box-shadow: 0 1px 3px var(--dk-shadow);
      font-size: 18px;

      &:disabled {
        opacity: 0.35;
      }
    }

    b {
      min-width: 1.5em;
      text-align: center;
      color: var(--dk-ink);
    }
  }
</style>
