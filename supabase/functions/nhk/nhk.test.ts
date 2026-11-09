import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENDERECOS,
  ErroNhk,
  cookiesPara,
  fotoPedeLogin,
  idValido,
  guardarCookies,
  limparHtml,
  lerArtigo,
  lerLista,
  quaisBaixar,
  type ItemDaLista
} from './nhk.ts';

const AQUI = join(__dirname, 'amostras');
// Amostras reais da NHK, fora do git (repositório público): nhk-amostras/ na raiz.
const REAIS = join(__dirname, '..', '..', '..', 'nhk-amostras');

const ler = (arquivo: string) => readFileSync(arquivo, 'utf8');
const listaInventada = () => JSON.parse(ler(join(AQUI, 'lista-inventada.json')));

function erroDe(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('não lançou');
}

describe('lerLista', () => {
  it('lê o formato da news-list (dia → itens), pula id e data inválidos e ordena do mais novo', () => {
    const itens = lerLista(listaInventada());
    expect(itens.map((i) => i.id)).toEqual([
      '20261109ne00002',
      '20261109ne00001',
      '20261106ne00003'
    ]);
  });

  it('converte o horário do Japão para UTC', () => {
    const [, primeiro] = lerLista(listaInventada());
    expect(primeiro.publicadaEm).toBe('2026-11-09T10:30:00.000Z');
  });

  it('prefere a foto da versão fácil, cai para a da notícia normal e aceita sem foto', () => {
    const porId = new Map(lerLista(listaInventada()).map((i) => [i.id, i]));
    expect(porId.get('20261109ne00001')!.foto).toBe(
      'https://news.web.nhk/news/easy/ogp/20261109ne00001/abcDEF123.jpg'
    );
    expect(porId.get('20261109ne00002')!.foto).toBe(
      'https://news.web.nhk/news/nd/kiji/20261109xx00002/foto_l.jpg'
    );
    expect(porId.get('20261106ne00003')!.foto).toBeNull();
  });

  it('guarda a voz quando existe', () => {
    const porId = new Map(lerLista(listaInventada()).map((i) => [i.id, i]));
    expect(porId.get('20261109ne00001')!.voz).toBe('20261109ne00001_vozInventada.m4a');
    expect(porId.get('20261109ne00002')!.voz).toBeNull();
  });

  it('lê o formato da top-list (lista simples) e tira itens repetidos', () => {
    const dia = listaInventada()[0]['2026-11-09'];
    const itens = lerLista([...dia, dia[0]]);
    expect(itens.map((i) => i.id)).toEqual(['20261109ne00002', '20261109ne00001']);
  });

  it('título com ruby fica só com <ruby> e <rt>, e o título sem ruby é o texto', () => {
    const lista = listaInventada();
    lista[0]['2026-11-09'][1].title_with_ruby =
      '<span class="colorL"><ruby>雨<rt>あめ</rt></ruby></span><a href="x" onclick="y">の</a><ruby>日<rt>ひ</rt></ruby>';
    const item = lerLista(lista).find((i) => i.id === '20261109ne00002')!;
    expect(item.tituloRuby).toBe('<ruby>雨<rt>あめ</rt></ruby>の<ruby>日<rt>ひ</rt></ruby>');
    expect(item.titulo).toBe('雨の日');
  });

  it('recusa foto fora dos servidores da NHK', () => {
    const lista = listaInventada();
    lista[0]['2026-11-09'][1].news_web_image_uri = 'https://exemplo.com/foto.jpg';
    lista[0]['2026-11-09'][0].news_easy_image_uri = 'http://news.web.nhk/news/easy/ogp/x.jpg';
    const porId = new Map(lerLista(lista).map((i) => [i.id, i]));
    expect(porId.get('20261109ne00002')!.foto).toBeNull();
    expect(porId.get('20261109ne00001')!.foto).toBe(
      'https://news.web.nhk/news/nd/kiji/20261109xx00001/foto_l.jpg'
    );
  });

  it('a resposta de erro do login vira ErroNhk na etapa login', () => {
    const e = erroDe(() => lerLista({ error: { status: 401, id: 'missing_token' } }));
    expect(e).toBeInstanceOf(ErroNhk);
    expect((e as ErroNhk).etapa).toBe('login');
  });

  it('formato desconhecido ou lista sem nenhum item válido vira ErroNhk na etapa lista', () => {
    for (const lixo of [null, 'texto', {}, [], [{}], [{ '2026-11-09': [{ title: 'x' }] }]]) {
      const e = erroDe(() => lerLista(lixo));
      expect((e as ErroNhk).etapa).toBe('lista');
    }
  });
});

describe('lerArtigo', () => {
  const artigo = () => lerArtigo(ler(join(AQUI, 'artigo-inventado.html')), '20261109ne00001');

  it('o corpo fica só com <p>, <ruby> e <rt>, sem atributos, sem parágrafo vazio', () => {
    expect(artigo().corpo).toBe(
      '<p><ruby>東京<rt>とうきょう</rt></ruby>の<ruby>公園<rt>こうえん</rt></ruby>で、' +
        '<ruby>3<rt>みっ</rt></ruby><ruby>日<rt>か</rt></ruby>に<ruby>猫<rt>ねこ</rt></ruby>が' +
        '<ruby>寝<rt>ね</rt></ruby>ていました。</p>' +
        '<p><ruby>近<rt>ちか</rt></ruby>くのＡ&amp;Ｂという<ruby>店<rt>みせ</rt></ruby>の' +
        '<ruby>人<rt>ひと</rt></ruby>は「かわいいです」と<ruby>話<rt>はな</rt></ruby>しました。</p>' +
        '<p>&lt;おわり&gt;</p>'
    );
  });

  it('a foto do corpo vira endereço completo', () => {
    expect(artigo().foto).toBe('https://news.web.nhk/news/easy/ogp/20261109ne00001/abcDEF123.jpg');
  });

  it('conta os caracteres do texto sem a leitura', () => {
    // 東京の公園で、3日に猫が寝ていました。(19) 近くのＡ&Ｂという店の人は「かわいいです」と話しました。(28) <おわり>(5)
    expect(artigo().caracteres).toBe(52);
  });

  it('a página de consentimento vira ErroNhk na etapa consentimento', () => {
    const html = '<html><body><h1>ご利用にあたって</h1><input type="checkbox"></body></html>';
    expect((erroDe(() => lerArtigo(html, 'x')) as ErroNhk).etapa).toBe('consentimento');
  });

  it('página sem o corpo, ou com o corpo vazio, vira ErroNhk na etapa artigo', () => {
    const semCorpo = '<html><body><p>outra coisa</p></body></html>';
    const vazio = '<div id="js-article-body"><p> </p><div><img src="a.jpg"></div></div>';
    expect((erroDe(() => lerArtigo(semCorpo, 'x')) as ErroNhk).etapa).toBe('artigo');
    expect((erroDe(() => lerArtigo(vazio, 'x')) as ErroNhk).etapa).toBe('artigo');
  });
});

describe('limparHtml', () => {
  it('tira script, comentário e atributos, e o recuo com quebra de linha', () => {
    expect(
      limparHtml('\n   <p class="a" onclick="x()">犬<!-- c --><script>alert(1)</script>\n  が</p>')
    ).toBe('<p>犬が</p>');
  });

  it('mantém o espaço japonês e um espaço entre palavras latinas', () => {
    expect(limparHtml('<p>地震　1週間  NHK   News</p>')).toBe('<p>地震　1週間 NHK News</p>');
  });

  it('fecha o que ficou aberto e ignora fechamento solto', () => {
    expect(limparHtml('</rt><p><ruby>漢<rt>かん')).toBe('<p><ruby>漢<rt>かん</rt></ruby></p>');
  });

  it('não deixa <p> dentro de <p> nem <rt> fora de <ruby>', () => {
    expect(limparHtml('<p>一<p>二</p><rt>x</rt>')).toBe('<p>一</p><p>二</p>x');
  });

  it('decodifica entidades e escapa de novo só o necessário', () => {
    expect(limparHtml('<p>&#x3042;&#12354;&quot;&amp;&lt;b&gt;&nbsp;</p>')).toBe(
      '<p>ああ"&amp;&lt;b&gt;</p>'
    );
  });
});

describe('cookies', () => {
  it('guarda por domínio, apaga com max-age=0 e só manda para o servidor certo', () => {
    const pote = guardarCookies(new Map(), 'https://news.web.nhk/tix/build_authorize', [
      '__HOST-bff-code=abc; max-age=15552000; path=/; HttpOnly; secure',
      'z_at=tok; max-age=43200; domain=web.nhk; path=/; secure'
    ]);
    expect(cookiesPara(pote, 'https://news.web.nhk/news/easy/top-list.json')).toBe(
      '__HOST-bff-code=abc; z_at=tok'
    );
    expect(cookiesPara(pote, 'https://a.authz.ac1.nhk/idp/authorize')).toBe('');
    expect(cookiesPara(pote, 'https://outro.web.nhk/')).toBe('z_at=tok');

    guardarCookies(pote, 'https://news.web.nhk/tix/idpresponse', [
      '__HOST-bff-code=; max-age=0; path=/',
      'z_at=novo; max-age=43200; domain=web.nhk; path=/'
    ]);
    expect(cookiesPara(pote, 'https://news.web.nhk/')).toBe('z_at=novo');
  });
});

describe('endereços', () => {
  it('o login é o de fora do Japão e volta para a página do Easy', () => {
    const u = new URL(ENDERECOS.entrar);
    expect(u.searchParams.get('profileType')).toBe('abroad');
    expect(u.searchParams.get('redirect_uri')).toBe('https://news.web.nhk/news/easy/');
    expect(ENDERECOS.artigo('20261109de72841')).toBe(
      'https://news.web.nhk/news/easy/20261109de72841/20261109de72841.html'
    );
  });

  it('só a foto da notícia normal pede login', () => {
    expect(fotoPedeLogin('https://news.web.nhk/news/easy/ogp/x/y.jpg')).toBe(false);
    expect(fotoPedeLogin('https://news.web.nhk/news/nd/kiji/x/y_l.jpg')).toBe(true);
  });

  it('id da NHK: letras minúsculas e números, nada de caminho', () => {
    expect(idValido('20261109de72841')).toBe(true);
    expect(idValido('../x')).toBe(false);
    expect(idValido('k10014871861')).toBe(true);
  });
});

describe('quaisBaixar', () => {
  const item = (id: string, publicadaEm: string): ItemDaLista => ({
    id,
    publicadaEm,
    titulo: id,
    tituloRuby: id,
    foto: null,
    voz: null
  });

  it('as mais novas que ainda não têm texto, até o limite', () => {
    const lista = [
      item('a', '2026-11-09T10:00:00.000Z'),
      item('b', '2026-11-08T10:00:00.000Z'),
      item('c', '2026-11-07T10:00:00.000Z'),
      item('d', '2026-11-06T10:00:00.000Z')
    ];
    expect(quaisBaixar(lista, new Set(['a', 'c']), 1)).toEqual(['b']);
    expect(quaisBaixar(lista, new Set(['a']), 5)).toEqual(['b', 'c', 'd']);
  });
});

describe.skipIf(!existsSync(REAIS))('amostras reais da NHK (nhk-amostras/)', () => {
  it('news-list: um ano de Notícias, todas com foto da NHK', () => {
    const itens = lerLista(JSON.parse(ler(join(REAIS, 'news-list.json'))));
    expect(itens.length).toBeGreaterThan(500);
    expect(itens.every((i) => i.foto?.startsWith('https://news.web.nhk/'))).toBe(true);
    expect(itens.every((i) => !i.tituloRuby.includes('class='))).toBe(true);
  });

  it('top-list: 20 Notícias', () => {
    expect(lerLista(JSON.parse(ler(join(REAIS, 'top-list.json'))))).toHaveLength(20);
  });

  const artigos = existsSync(REAIS)
    ? readdirSync(REAIS).filter((f) => /^\d{8}[a-z]{2}\d+\.html$/.test(f))
    : [];
  it.each(artigos)('artigo %s: parágrafos limpos e tamanho de notícia', (arquivo) => {
    const id = arquivo.replace('.html', '');
    const a = lerArtigo(ler(join(REAIS, arquivo)), id);
    expect(a.corpo.match(/<p>/g)!.length).toBeGreaterThanOrEqual(3);
    expect(a.corpo).not.toMatch(/<(span|a|img|div)\b|class=/);
    expect(a.caracteres).toBeGreaterThan(100);
    expect(a.caracteres).toBeLessThan(1000);
    if (a.foto) expect(a.foto).toMatch(/^https:\/\/news\.web\.nhk\/news\/easy\/ogp\//);
  });

  it('a página de consentimento real vira ErroNhk', () => {
    const e = erroDe(() => lerArtigo(ler(join(REAIS, 'consentimento.html')), 'x'));
    expect((e as ErroNhk).etapa).toBe('consentimento');
  });
});
