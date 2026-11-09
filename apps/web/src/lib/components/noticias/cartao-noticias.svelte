<script lang="ts">
  import { onMount } from 'svelte';
  import { pagePath } from '$lib/data/env';
  import { escolherEdicao, estadoDaEdicao } from '$lib/data/noticias/edicao';
  import { hoje, lerNoticias, porDia$ } from '$lib/data/noticias/servico';
  import { noticiasRecebidas$, sincronizador } from '$lib/data/supabase/sincronizacao/iniciar';

  // Cartão do Início (ESCOPO "Notícias da NHK Easy"): quanto da Edição do dia já foi lido, com um
  // toque até ela. Não escolhe a Edição (isso fica para a primeira abertura das Notícias).

  let lidas = 0;
  let total = 0;
  let acabou = false;
  let carregado = false;

  async function carregar() {
    const { noticias, idsLidos } = await lerNoticias();
    const edicao = (await sincronizador().ler('edicoes', hoje()))?.news_ids;
    const estado = estadoDaEdicao(edicao, idsLidos);

    if (edicao) {
      ({ lidas, total, acabou } = estado);
    } else {
      lidas = 0;
      total = escolherEdicao([...noticias.values()], idsLidos, $porDia$).length;
      acabou = false;
    }

    carregado = true;
  }

  onMount(() => {
    const assinatura = noticiasRecebidas$.subscribe(carregar);

    carregar();

    return () => assinatura.unsubscribe();
  });
</script>

{#if carregado}
  <a class="dokusho-cartao-noticias" href="{pagePath}/noticias">
    <div>
      <small>Notícias de hoje</small>
      {#if acabou}
        <b lang="ja">今日はここまで</b>
      {:else if total}
        <b>{lidas ? `${lidas} de ${total} lidas` : `${total} para ler`}</b>
      {:else}
        <b>Nenhuma por enquanto</b>
      {/if}
    </div>
    {#if total}
      <span class="dokusho-cartao-noticias__pontos" aria-hidden="true">
        {#each Array(total) as _, i}
          <i class:lida={i < lidas} />
        {/each}
      </span>
    {/if}
  </a>
{/if}

<style lang="scss">
  .dokusho-cartao-noticias {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    padding: 14px;
    border-radius: 16px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);

    small {
      display: block;
      font-size: 12px;
      color: var(--dk-ink2);
    }

    b {
      font-size: 16px;
    }
  }

  .dokusho-cartao-noticias__pontos {
    display: flex;
    gap: 5px;

    i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--dk-line);

      &.lida {
        background: var(--dk-read);
      }
    }
  }
</style>
