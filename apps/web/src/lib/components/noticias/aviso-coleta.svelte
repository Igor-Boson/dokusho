<script lang="ts">
  import { avisoDaColeta } from '$lib/data/noticias/edicao';
  import { dataEHora } from '$lib/data/noticias/datas';
  import type { LinhaColeta } from '$lib/data/supabase/sincronizacao/regras';

  // Quando a NHK muda o site, a Coleta falha: a tela segue com o que já foi baixado e avisa desde
  // quando (ESCOPO "Notícias da NHK Easy"). `erro`: a busca pedida agora por este aparelho.

  export let coleta: LinhaColeta | undefined;
  export let erro = '';

  $: aviso = avisoDaColeta(coleta, Date.now());
</script>

{#if aviso || erro}
  <div class="dokusho-aviso-coleta" role="status">
    {#if aviso}
      <b>A busca das notícias está falhando.</b>
      {#if aviso.ultimaBoa}
        A última que deu certo foi em {dataEHora(aviso.ultimaBoa)}.
      {/if}
      Você continua lendo o que já foi baixado.
      {#if aviso.motivo}<small>{aviso.motivo}</small>{/if}
    {:else}
      <b>Não deu para buscar as notícias agora.</b>
      <small>{erro}</small>
    {/if}
  </div>
{/if}

<style lang="scss">
  .dokusho-aviso-coleta {
    margin: 4px 0 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--dk-warn-soft);
    color: var(--dk-ink);
    font-size: 14px;
    line-height: 1.5;

    b {
      display: block;
      color: var(--dk-warn);
    }

    small {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--dk-ink2);
      word-break: break-word;
    }
  }
</style>
