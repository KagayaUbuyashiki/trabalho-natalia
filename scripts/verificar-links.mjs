import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const arquivos = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['index.html'];

const TAGS_VERIFICADAS = {
  a: ['href'],
  link: ['href'],
  img: ['src'],
  script: ['src'],
  source: ['src'],
};

const ATRIBUTO_OBRIGATORIO = {
  a: 'href',
  link: 'href',
  img: 'src',
};

const TEMPO_LIMITE_MS = 20000;
const TENTATIVAS = 3;
const CABECALHOS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function lerAtributos(trecho) {
  const atributos = {};
  const regex = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = regex.exec(trecho)) !== null) {
    atributos[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return atributos;
}

function extrairReferencias(html) {
  const semComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
  const referencias = [];
  const regexTag = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  while ((m = regexTag.exec(semComentarios)) !== null) {
    const tag = m[1].toLowerCase();
    const linha = semComentarios.slice(0, m.index).split('\n').length;
    const atributos = lerAtributos(m[2]);
    const obrigatorio = ATRIBUTO_OBRIGATORIO[tag];
    if (obrigatorio && !(obrigatorio in atributos)) {
      referencias.push({ tag, atributo: obrigatorio, valor: null, linha });
    }
    for (const atributo of TAGS_VERIFICADAS[tag] ?? []) {
      if (atributo in atributos) {
        referencias.push({ tag, atributo, valor: atributos[atributo], linha });
      }
    }
  }
  return referencias;
}

function extrairIds(html) {
  const ids = new Set();
  const regex = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    ids.add(m[1] ?? m[2] ?? m[3]);
  }
  return ids;
}

async function existe(caminho) {
  try {
    const info = await stat(caminho);
    if (info.isDirectory()) {
      await stat(path.join(caminho, 'index.html'));
    }
    return true;
  } catch {
    return false;
  }
}

async function requisitar(url, metodo) {
  const resposta = await fetch(url, {
    method: metodo,
    redirect: 'follow',
    headers: CABECALHOS,
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (resposta.body) {
    await resposta.body.cancel().catch(() => {});
  }
  return resposta.status;
}

async function verificarUrlExterna(url) {
  let ultimoErro = '';
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      let status = await requisitar(url, 'HEAD');
      if (status >= 400) {
        status = await requisitar(url, 'GET');
      }
      if (status < 400) {
        return { ok: true, detalhe: `HTTP ${status}` };
      }
      ultimoErro = `HTTP ${status}`;
      if (status !== 429 && status < 500) {
        break;
      }
    } catch (erro) {
      ultimoErro = erro.cause?.code ?? erro.name ?? String(erro);
    }
    await new Promise((r) => setTimeout(r, 1500 * tentativa));
  }
  return { ok: false, detalhe: ultimoErro };
}

const cacheExterno = new Map();

async function validar(ref, arquivoHtml, ids) {
  const { valor } = ref;
  if (valor === null) {
    return { ok: false, detalhe: `atributo ${ref.atributo} ausente` };
  }
  const v = valor.trim();
  if (v === '') {
    return { ok: false, detalhe: 'valor vazio' };
  }
  if (/^javascript:/i.test(v)) {
    return { ok: false, detalhe: 'uso de javascript: não é permitido' };
  }
  if (v.startsWith('#')) {
    const alvo = decodeURIComponent(v.slice(1));
    if (alvo === '') {
      return { ok: false, detalhe: 'âncora vazia (#)' };
    }
    return ids.has(alvo) ? { ok: true, detalhe: 'âncora encontrada' } : { ok: false, detalhe: `id "${alvo}" não existe na página` };
  }
  if (/^mailto:/i.test(v)) {
    return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v) ? { ok: true, detalhe: 'e-mail válido' } : { ok: false, detalhe: 'e-mail inválido' };
  }
  if (/^tel:/i.test(v)) {
    return /^tel:\+?[0-9-]{8,}$/.test(v) ? { ok: true, detalhe: 'telefone válido' } : { ok: false, detalhe: 'telefone inválido' };
  }
  if (/^data:image\//i.test(v)) {
    return { ok: true, detalhe: 'imagem embutida' };
  }
  const url = v.startsWith('//') ? `https:${v}` : v;
  if (/^https?:\/\//i.test(url)) {
    try {
      new URL(url);
    } catch {
      return { ok: false, detalhe: 'URL malformada' };
    }
    if (!cacheExterno.has(url)) {
      cacheExterno.set(url, verificarUrlExterna(url));
    }
    return cacheExterno.get(url);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    return { ok: false, detalhe: 'protocolo não suportado' };
  }
  if (v.startsWith('/')) {
    return { ok: false, detalhe: 'caminho absoluto quebra no GitHub Pages; use caminho relativo' };
  }
  const semSufixo = v.split(/[?#]/)[0];
  let relativo;
  try {
    relativo = decodeURIComponent(semSufixo);
  } catch {
    return { ok: false, detalhe: 'caminho com codificação inválida' };
  }
  const destino = path.resolve(path.dirname(arquivoHtml), relativo);
  return (await existe(destino)) ? { ok: true, detalhe: 'arquivo encontrado' } : { ok: false, detalhe: `arquivo "${relativo}" não encontrado` };
}

let falhas = 0;
let total = 0;

for (const arquivo of arquivos) {
  let html;
  try {
    html = await readFile(arquivo, 'utf8');
  } catch {
    console.error(`::error file=${arquivo}::Arquivo ${arquivo} não encontrado`);
    falhas++;
    continue;
  }
  const ids = extrairIds(html);
  const referencias = extrairReferencias(html);
  console.log(`\nVerificando ${referencias.length} links/imagens em ${arquivo}\n`);
  const resultados = await Promise.all(referencias.map((ref) => validar(ref, arquivo, ids)));
  referencias.forEach((ref, i) => {
    total++;
    const { ok, detalhe } = resultados[i];
    const descricao = `<${ref.tag} ${ref.atributo}="${ref.valor ?? ''}">`;
    if (ok) {
      console.log(`  OK    linha ${ref.linha}: ${descricao} (${detalhe})`);
    } else {
      falhas++;
      console.log(`  ERRO  linha ${ref.linha}: ${descricao} (${detalhe})`);
      console.log(`::error file=${arquivo},line=${ref.linha}::${descricao} inválido: ${detalhe}`);
    }
  });
}

console.log(`\n${total} referências verificadas, ${falhas} com problema.`);
if (falhas > 0) {
  process.exit(1);
}
