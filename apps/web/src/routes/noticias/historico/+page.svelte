<script lang="ts">
  import { onMount } from 'svelte';
  import NavegacaoInferior from '$lib/components/navegacao/navegacao-inferior.svelte';
  import { pagePath } from '$lib/data/env';
  import { dataDaNoticia } from '$lib/data/noticias/datas';
  import { historico } from '$lib/data/noticias/edicao';
  import { diaDe, lerNoticias } from '$lib/data/noticias/servico';
  import { noticiasRecebidas$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import type { LinhaNoticia } from '$lib/data/supabase/sincronizacao/regras';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  // Histórico de notícias: as lidas, pelo dia da leitura; fora da Edição do dia.

  let dias: { dia: string; itens: { noticia: LinhaNoticia; lidaEm: string }[] }[] = [];
  let carregado = false;

  const nomeDoDia = (dia: string) =>
    new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

  async function carregar() {
    const { noticias, lidas } = await lerNoticias();

    dias = historico(lidas, noticias, diaDe);
    carregado = true;
  }

  onMount(() => {
    const assinatura = noticiasRecebidas$.subscribe(carregar);

    carregar();

    return () => assinatura.unsubscribe();
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Histórico de notícias')}</title>
</svelte:head>

<main class="dokusho-historico">
  <header>
    <a href="{pagePath}/noticias" aria-label="Voltar">‹</a>
    <h1>Histórico</h1>
  </header>

  {#if carregado && !dias.length}
    <p class="dokusho-historico__vazio">Nenhuma notícia lida ainda.</p>
  {/if}

  {#each dias as { dia, itens } (dia)}
    <section>
      <h2>{nomeDoDia(dia)}</h2>
      <ul>
        {#each itens as { noticia } (noticia.news_id)}
          <li>
            <a href="{pagePath}/noticias/ler?id={noticia.news_id}&de=historico">
              <b lang="ja">{noticia.title}</b>
              <small lang="ja">{dataDaNoticia(noticia.published_at)}</small>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</main>

<NavegacaoInferior />

<style lang="scss">
  .dokusho-historico {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 18px calc(120px + env(safe-area-inset-bottom, 0px));
    font-family: 'Noto Sans JP', system-ui, sans-serif;
    color: var(--dk-ink);

    header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 22px 0 10px;

      a {
        padding: 0 8px 0 0;
        font-size: 28px;
        color: var(--dk-ink2);
      }
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
    }

    h2 {
      margin: 22px 0 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--dk-ink2);
    }

    ul {
      border-radius: 16px;
      background: var(--dk-surface);
      box-shadow: 0 1px 3px var(--dk-shadow);
    }

    li + li {
      border-top: 1px solid var(--dk-line);
    }

    a {
      display: block;
      padding: 12px 14px;
    }

    b {
      display: block;
      font-size: 15px;
      line-height: 1.5;
    }

    small {
      font-size: 12px;
      color: var(--dk-ink2);
    }
  }

  .dokusho-historico__vazio {
    margin-top: 40px;
    text-align: center;
    color: var(--dk-ink2);
  }
</style>
