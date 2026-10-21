<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AvisoNovaVersao from '$lib/components/navegacao/aviso-nova-versao.svelte';
  import AvisoServidor from '$lib/components/navegacao/aviso-servidor.svelte';
  import { pagePath } from '$lib/data/env';
  import { cartasRecebidas$, sincronizador } from '$lib/data/supabase/sincronizacao/iniciar';

  // Navegação inferior (ESCOPO "Interface"): Início, Biblioteca, Fila de cartas e Vocabulário.

  let naFila = 0;

  const itens = [
    {
      rotulo: 'Início',
      caminho: '/inicio',
      icone: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'
    },
    {
      rotulo: 'Biblioteca',
      caminho: '/manage',
      icone: 'M4 4h5v16H4zM10 4h4v16h-4zM15.4 5.2l3.8-1 2.8 15.4-3.8 1z'
    },
    { rotulo: 'Fila', caminho: '/fila', icone: 'M8 3h11a1 1 0 0 1 1 1v12M4 7h13v14H4z' },
    {
      rotulo: 'Vocabulário',
      caminho: '/vocabulario',
      icone:
        'M6.5 3.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3zM8 9h8M12 7v10M8.5 13.5c2 2.5 5 2.5 7 0'
    }
  ];

  async function contar() {
    const cartas = await sincronizador().listar('cartas');

    naFila = cartas.filter((carta) => carta.state !== 'exportada').length;
  }

  onMount(() => {
    contar();

    const assinatura = cartasRecebidas$.subscribe(contar);

    return () => assinatura.unsubscribe();
  });

  $: atual = $page.url.pathname.replace(pagePath, '');
</script>

<div class="dokusho-avisos">
  <AvisoNovaVersao />
  <AvisoServidor />
</div>

<nav class="dokusho-nav writing-horizontal-tb">
  {#each itens as item}
    <a
      href="{pagePath}{item.caminho}"
      class:dokusho-nav--atual={atual.startsWith(item.caminho)}
      aria-current={atual.startsWith(item.caminho) ? 'page' : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icone} /></svg>
      {item.rotulo}
      {#if item.caminho === '/fila' && naFila}
        <span class="dokusho-nav__contador">{naFila}</span>
      {/if}
    </a>
  {/each}
</nav>

<style lang="scss">
  .dokusho-avisos {
    position: fixed;
    top: calc(8px + env(safe-area-inset-top, 0px));
    left: 12px;
    right: 12px;
    z-index: 35;
    max-width: 616px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;

    > :global(*) {
      pointer-events: auto;
    }
  }

  .dokusho-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--dk-line);
    background: var(--dk-surface);
    color: var(--dk-ink3);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    font-family: 'Noto Sans JP', system-ui, sans-serif;

    a {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 0 6px;
      font-size: 11px;

      // iPhone: 15% mais alta (56 → 64 px) para o polegar.
      @media (pointer: coarse) and (max-width: 767px) {
        padding: 12px 0 10px;
      }
    }

    svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }

  .dokusho-nav--atual {
    color: var(--dk-accent);
  }

  .dokusho-nav__contador {
    position: absolute !important;
    top: 4px;
    left: calc(50% + 6px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px !important;
    border-radius: 9px;
    background: var(--dk-accent);
    color: var(--dk-accent-ink);
    font-size: 11px !important;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
