<script lang="ts">
  import { onMount } from 'svelte';
  import { pagePath } from '$lib/data/env';
  import { sincronizador, vocabMudou$ } from '$lib/data/supabase/sincronizacao/iniciar';
  import { perfilPronto$ } from '$lib/data/vocabulario/perfis';
  import { coberturasPorTitulo } from '$lib/data/vocabulario/servico';

  // Cobertura de cada livro (V2.3); cada um abre a lista de desconhecidas.

  let livros: { livroId: string; titulo: string; porcentagem?: number }[] = [];

  async function carregar() {
    const [titulos, coberturas] = await Promise.all([
      sincronizador().livrosAtivos(),
      coberturasPorTitulo()
    ]);
    livros = [...titulos]
      .map(([livroId, titulo]) => ({
        livroId,
        titulo,
        porcentagem: coberturas.get(titulo)?.porcentagem
      }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'ja'));
  }

  onMount(() => {
    carregar();
    const assinaturas = [vocabMudou$.subscribe(carregar), perfilPronto$.subscribe(carregar)];
    return () => assinaturas.forEach((a) => a.unsubscribe());
  });
</script>

{#if livros.length}
  <section class="dokusho-livros">
    <h2>Livros</h2>
    {#each livros as livro (livro.livroId)}
      <a href="{pagePath}/vocabulario/livro?id={encodeURIComponent(livro.livroId)}">
        <span lang="ja">{livro.titulo}</span>
        {#if livro.porcentagem !== undefined}
          <b>{livro.porcentagem}%</b>
        {:else}
          <small>abra no Leitor para calcular</small>
        {/if}
      </a>
    {/each}
  </section>
{/if}

<style lang="scss">
  .dokusho-livros {
    margin-top: 12px;
    padding: 14px 16px 6px;
    border-radius: 14px;
    background: var(--dk-surface);
    box-shadow: 0 1px 3px var(--dk-shadow);
    font-size: 14px;

    h2 {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    a {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-top: 1px solid var(--dk-line);
    }

    b {
      color: var(--dk-read);
    }

    small {
      color: var(--dk-ink3);
      flex: none;
    }
  }
</style>
