<script lang="ts">
  import { onMount } from 'svelte';
  import { vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import { perfilPronto$ } from '$lib/data/vocabulario/perfis';
  import { atualizarPerfisAntigos, palavrasVistasNosLivros } from '$lib/data/vocabulario/servico';

  // Palavras vistas (V3.2): as Palavras que apareceram nos parágrafos que você já leu (antes do
  // Alcance), somando os livros, cada uma uma vez, pelo estado no hub.

  let resumo: Awaited<ReturnType<typeof palavrasVistasNosLivros>> | undefined;
  let atualizando = false;

  async function carregar() {
    resumo = await palavrasVistasNosLivros();
  }

  const numero = (n: number) => n.toLocaleString('pt-BR');

  onMount(() => {
    carregar().then(async () => {
      if (!resumo?.faltam) return;
      atualizando = true;
      await atualizarPerfisAntigos().catch(() => undefined);
      atualizando = false;
      await carregar();
    });
    const assinaturas = [vocabMudou$.subscribe(carregar), perfilPronto$.subscribe(carregar)];
    return () => assinaturas.forEach((a) => a.unsubscribe());
  });
</script>

{#if resumo && (resumo.livros || resumo.faltam)}
  <section class="dokusho-vistas">
    <h2>Palavras vistas</h2>
    <div class="dokusho-vistas__linha">
      <div class="dokusho-vistas__total">{numero(resumo.vistas)}</div>
      <div>
        palavras diferentes nos trechos que você já leu
        {#if resumo.livros}({resumo.livros}
          {resumo.livros === 1 ? 'livro' : 'livros'}){/if}
      </div>
    </div>
    <div class="dokusho-vistas__estados">
      <span><b class="conhecida">{numero(resumo.conhecidas)}</b> conhecidas</span>
      <span><b class="aprendendo">{numero(resumo.aprendendo)}</b> aprendendo</span>
      <span><b class="desconhecida">{numero(resumo.desconhecidas)}</b> desconhecidas</span>
    </div>
    {#if resumo.faltam}
      <small
        >{atualizando ? 'Atualizando' : 'Faltam'}
        {resumo.faltam}
        {resumo.faltam === 1 ? 'livro' : 'livros'}{atualizando ? '…' : ' (abra no Leitor)'}</small
      >
    {/if}
  </section>
{/if}

<style lang="scss">
  .dokusho-vistas {
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;
    color: var(--dk-ink2);

    h2 {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--dk-ink);
    }

    small {
      display: block;
      margin-top: 8px;
      color: var(--dk-ink3);
    }
  }

  .dokusho-vistas__linha {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .dokusho-vistas__total {
    font-size: 30px;
    font-weight: 700;
    color: var(--dk-ink);
  }

  .dokusho-vistas__estados {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin-top: 8px;

    b {
      font-weight: 700;
    }

    .conhecida {
      color: var(--dk-read);
    }

    .aprendendo {
      color: var(--dk-warn);
    }
  }
</style>
