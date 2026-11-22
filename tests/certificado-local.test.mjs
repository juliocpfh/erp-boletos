// Certificado digital anexado pelo sistema (pedido do dono de 22/11/2026): o site entrega o .pfx e a senha direto ao programa
// do PC em 127.0.0.1. Nada é registrado nem agendado no Windows aqui; certificado e senha são inventados.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as A from '../atualizador-pc/assinar-pdf.mjs';
import * as CL from '../atualizador-pc/certificado-local.mjs';
import * as CT from '../atualizador-pc/certificado.mjs';
import { NOME_BAIXAR, URL_RELEASE } from '../atualizador-pc/se-atualizar.mjs';
import * as P from '../atualizador-pc/programa.mjs';
import * as CP from '../docs/js/certificado-pc.js';

const SITE = 'https://erp.exemplo.com.br';
const LIGACAO = { site: SITE, cracha: 'ap1_x' };
const DADOS = { nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', validade: '2099-01-01' };
const PFX = Buffer.from('arquivo de mentira').toString('base64');
const temp = () => ({ IMOVEIS_CONFIG: fs.mkdtempSync(path.join(os.tmpdir(), 'certificado-local-')) });

/** Pedido cru: o fetch do Node não deixa trocar o Host. */
const pedir = (porta, { metodo = 'GET', caminho = '/estado', cab = {}, corpo = '' } = {}) => new Promise((ok, falha) => {
  const headers = { Host: `127.0.0.1:${porta}`, Origin: SITE, ...cab };
  for (const k of Object.keys(headers)) if (headers[k] === null) delete headers[k];
  if (corpo) headers['Content-Length'] = Buffer.byteLength(corpo);
  const r = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers, agent: false }, (res) => {
    let t = '';
    res.setEncoding('utf8');
    res.on('data', (x) => { t += x; });
    res.on('end', () => ok({ status: res.statusCode, cab: res.headers, dados: t ? JSON.parse(t) : null }));
  });
  r.on('error', falha);
  r.end(corpo);
});
const instalar = (porta, extra = {}) => pedir(porta, { metodo: 'POST', caminho: '/instalar', corpo: JSON.stringify({ pfx: PFX, senha: 's' }), ...extra, cab: { 'Content-Type': 'application/json', ...extra.cab } });

async function abrir(opcoes = {}) {
  let aberto;
  const porta = new Promise((ok) => { aberto = ok; });
  const fim = CL.receberDoSistema({ env: temp(), ligacao: LIGACAO, resumo: () => null, guardar: () => DADOS, porta: 0, parado: 5000, aoAbrir: aberto, ...opcoes });
  return { porta: await porta, fim };
}

test('a porta e a identidade são as mesmas no site e no programa; o CSP deixa o site falar com 127.0.0.1', () => {
  assert.equal(CP.PORTA, CL.PORTA);
  assert.equal(CP.IDENTIDADE, CL.IDENTIDADE);
  assert.equal(CP.MAX_PFX, CT.MAX_PFX);
  assert.equal(CP.URL_PROGRAMA, `${URL_RELEASE}${NOME_BAIXAR}`, 'o link de baixar é o arquivo que está na release');
  assert.equal(CP.PROTOCOLO, P.PROTOCOLO_CERTIFICADO);
  assert.match(fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8'), /connect-src[^;]*http:\/\/127\.0\.0\.1:\*/);
});

test('só a origem exata do sistema e o Host deste computador: outro site não lê nem grava', async () => {
  let gravou = 0;
  const { porta, fim } = await abrir({ guardar: () => { gravou += 1; return DADOS; } });
  const recusados = [{ Origin: 'https://site-malicioso.example' }, { Origin: `${SITE}.atacante.example` }, { Origin: 'http://erp.exemplo.com.br' },
    { Origin: 'null' }, { Origin: null }, { Host: `atacante.example:${porta}` }, { Host: `localhost:${porta}` }];
  for (const cab of recusados) {
    for (const r of [await pedir(porta, { cab }), await instalar(porta, { cab }), await pedir(porta, { metodo: 'OPTIONS', caminho: '/instalar', cab })]) {
      assert.equal(r.status, 403, JSON.stringify(cab));
      assert.equal(r.cab['access-control-allow-origin'], undefined);
      assert.equal(r.cab['access-control-allow-private-network'], undefined);
    }
  }
  assert.equal((await instalar(porta, { cab: { 'Content-Type': 'text/plain' } })).status, 404, 'só JSON (obriga a checagem do navegador)');
  assert.equal((await instalar(porta, { corpo: 'x'.repeat(CT.MAX_PFX * 2 + 10) })).status, 400, 'grande demais');
  assert.equal((await instalar(porta, { corpo: 'null' })).status, 400);
  assert.equal(gravou, 0);
  const pre = await pedir(porta, { metodo: 'OPTIONS', caminho: '/instalar' });
  assert.equal(pre.status, 204);
  assert.equal(pre.cab['access-control-allow-origin'], SITE);
  assert.equal(pre.cab['access-control-allow-private-network'], 'true');
  assert.equal((await instalar(porta)).status, 200);
  assert.deepEqual(await fim, { situacao: 'instalado' });
});

test('instala uma vez: devolve os dados sem a senha, cria a tarefa e fecha a porta', async () => {
  const recebidos = [];
  let tarefas = 0;
  const { porta, fim } = await abrir({ guardar: (d) => { recebidos.push(d); return DADOS; }, aoInstalar: () => { tarefas += 1; return true; } });
  assert.deepEqual((await pedir(porta)).dados, { programa: CL.IDENTIDADE, ligado: true, atual: null });
  const r = await instalar(porta, { corpo: JSON.stringify({ pfx: PFX, senha: ' çã segredo ' }) });
  assert.deepEqual(r.dados, { ...DADOS, tarefa: true });
  assert.deepEqual(recebidos, [{ pfx: PFX, senha: ' çã segredo ' }]);
  assert.equal(tarefas, 1);
  await fim;
  await assert.rejects(pedir(porta), 'a porta fechou');
});

test('tarefa recusada pelo Windows é avisada; computador não ligado não recebe certificado', async () => {
  const a = await abrir({ aoInstalar: () => false });
  assert.equal((await instalar(a.porta)).dados.tarefa, false);
  await a.fim;
  let gravou = false;
  const b = await abrir({ ligacao: null, parado: 400, guardar: () => { gravou = true; } });
  const cab = { Origin: 'https://erp.ankjck.com.br' }; // sem ligação vale o site padrão
  assert.equal((await pedir(b.porta, { cab })).dados.ligado, false);
  assert.equal((await instalar(b.porta, { cab })).status, 409);
  assert.equal(gravou, false);
  assert.deepEqual(await b.fim, { situacao: 'tempo' });
});

test('tentativas erradas têm limite; segundo clique não derruba quem já espera', async () => {
  const { porta, fim } = await abrir({ guardar: () => { throw new Error('A senha do certificado não confere.'); } });
  assert.deepEqual(await CL.receberDoSistema({ env: temp(), ligacao: LIGACAO, porta }), { situacao: 'ocupado' });
  for (let i = 1; i <= CL.MAX_TENTATIVAS; i += 1) {
    const r = await instalar(porta);
    assert.equal(r.status, 400);
    assert.equal(r.dados.acabou, i === CL.MAX_TENTATIVAS);
    assert.match(r.dados.erro, /senha do certificado não confere/);
  }
  assert.deepEqual(await fim, { situacao: 'tentativas' });
});

test('site: o arquivo e a senha vão só para 127.0.0.1, sem cookie e sem seguir redirecionamento', async () => {
  const chamadas = [];
  const buscar = async (url, op) => { chamadas.push({ url, op }); return Response.json({ programa: CP.IDENTIDADE, ligado: true, ...DADOS, tarefa: true }); };
  assert.deepEqual(await CP.programaEsperando({ buscar }), { ligado: true, atual: null });
  await CP.entregarCertificado(new File([Buffer.from([0, 255, 128, 7])], 'empresa.PFX'), 'ção', { buscar });
  for (const { url, op } of chamadas) {
    assert.ok(url.startsWith(`http://127.0.0.1:${CL.PORTA}/`), url);
    assert.equal(op.credentials, 'omit');
    assert.equal(op.redirect, 'error');
  }
  assert.deepEqual(JSON.parse(chamadas[1].op.body), { pfx: Buffer.from([0, 255, 128, 7]).toString('base64'), senha: 'ção' });
  assert.equal(await CP.programaEsperando({ buscar: async () => Response.json({ programa: 'outro' }) }), null, 'outro programa na porta');
  assert.throws(() => CP.conferirEscolha({ name: 'contrato.pdf', size: 100 }, 's'), /\.pfx ou \.p12/);
  assert.throws(() => CP.conferirEscolha({ name: 'a.pfx', size: CP.MAX_PFX + 1 }, 's'), /A1/);
  assert.throws(() => CP.conferirEscolha({ name: 'a.p12', size: 100 }, ''), /senha/);
});

test('protocolo imoveis-certificado: registrado para o usuário, sem nada do endereço, e sai ao desinstalar', () => {
  const pasta = 'C:\\Users\\Teste\\AppData\\Local\\Administracao de Imoveis\\programa';
  const env = { SystemRoot: 'C:\\Windows' };
  const cmds = P.comandosDoProtocoloCertificado(pasta, env);
  for (const a of cmds) {
    assert.ok(a[1].startsWith('HKCU\\Software\\Classes\\imoveis-certificado'));
    assert.ok(!a.join(' ').includes('%'), 'sem %1');
  }
  assert.equal(cmds.at(-1)[cmds.at(-1).indexOf('/d') + 1], `"C:\\Windows\\System32\\wscript.exe" "${pasta}\\certificado.vbs"`);
  const vbs = P.textoVbsCertificado();
  assert.ok(/^[\x00-\x7f]*$/.test(vbs), 'sem acento');
  assert.ok(vbs.includes(`\\${P.NOME_EXE}"" --certificado-sistema", 0, False`));
  assert.ok(!/WScript\.Arguments/.test(vbs));
  const todos = P.comandosDoRegistro(pasta, env).map((a) => a[1]);
  assert.ok(todos.includes(P.CHAVE_PROTOCOLO_CERTIFICADO));
  assert.ok(P.CHAVES_DO_PROGRAMA.includes(P.CHAVE_PROTOCOLO_CERTIFICADO));
  assert.ok(P.ARQUIVOS_DO_PROGRAMA.includes(P.NOME_VBS_CERTIFICADO));
  const feitos = [];
  assert.equal(P.criarTarefaDaAssinatura({ IMOVEIS_CONFIG: 'C:\\Teste' }, { rodar: (a) => { feitos.push(a); return { status: 0 }; } }), true);
  assert.ok(feitos[0].includes(P.TAREFA_ASSINATURA.nome));
});

test('--certificado-sistema: instalou, assina a fila na hora; não instalou, não vai à internet', async () => {
  for (const situacao of ['instalado', 'tempo']) {
    const env = temp();
    fs.writeFileSync(path.join(env.IMOVEIS_CONFIG, CT.ARQUIVO_CERTIFICADO), JSON.stringify(DADOS));
    let assinou = false;
    const codigo = await P.executar(['--certificado-sistema'], { env, dizer: () => {}, lerLig: () => LIGACAO, lerCert: () => DADOS,
      receberCert: async (op) => { assert.equal(op.ligacao, LIGACAO); return { situacao }; }, assinarFilaFn: async () => { assinou = true; return { assinados: 0, erros: [] }; } });
    assert.equal(codigo, 0);
    assert.equal(assinou, situacao === 'instalado');
  }
});

test('senha guardada volta igual (espaço e acento); o certificado guardado no formato antigo continua abrindo', () => {
  const env = temp();
  const proteger = (t) => `#${t.trim()}`; // o PowerShell tira os espaços das pontas
  const abrir = (t) => t.slice(1);
  CT.guardarCertificado({ pfx: PFX, senha: ' senha çã€ ' }, env, { proteger, dados: () => ({ ...DADOS, emissor: 'AC TESTE' }) });
  const c = CT.lerCertificado(env, { abrir });
  assert.equal(c.senha, ' senha çã€ ');
  assert.equal(c.emissor, 'AC TESTE', 'o selo do PDF diz quem emitiu');
  fs.writeFileSync(path.join(env.IMOVEIS_CONFIG, CT.ARQUIVO_CERTIFICADO), JSON.stringify({ ...DADOS, pfx: `#${PFX}`, senha: '#antiga' }));
  assert.equal(CT.lerCertificado(env, { abrir }).senha, 'antiga');
});

test('razão social com qualquer letra cabe no cabeçalho ao devolver o assinado', async () => {
  let cabecalho = '';
  const buscar = async (url, op) => {
    if (url.endsWith('/assinaturas')) return Response.json({ pendentes: [{ id: 'abcdefgh', titulo: 'Recibo' }] });
    if (url.endsWith('.pdf')) return new Response('pdf');
    cabecalho = new Headers(op.headers).get('X-Certificado');
    return Response.json({ ok: true });
  };
  const r = await CT.assinarFila(LIGACAO, { ...DADOS, nome: 'ADMINISTRAÇÃO – JOÃO', pfx: PFX, senha: 's' }, { buscar, assinar: () => Buffer.from('assinado') });
  assert.equal(r.assinados, 1);
  assert.equal(cabecalho, 'ADMINISTRACAO   JOAO:11222333000181');
});

test('Windows de verdade: senha com acento e espaço, razão social com acento, arquivo errado e cifra do Windows', { skip: process.platform !== 'win32' && 'só no Windows' }, () => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$rsa = [System.Security.Cryptography.RSA]::Create(2048);
$cn = 'ADMINISTRA' + [char]0xC7 + [char]0xC3 + 'O TESTE:11222333000181';
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest("CN=$cn, O=TESTE", $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1);
$c = $req.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(1));
$senha = ' a' + [char]0xE7 + [char]0xE3 + 'o ';
[Convert]::ToBase64String($c.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $senha))`], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  const pfx = r.stdout.trim();
  const senha = ' ação ';
  const env = temp();
  assert.equal(CT.guardarCertificado({ pfx, senha }, env).nome, 'ADMINISTRAÇÃO TESTE');
  const c = CT.lerCertificado(env);
  assert.equal(c.senha, senha);
  assert.ok(A.assinarCms(Buffer.from('documento'), c).length > 500, 'assina com a senha que voltou da cifra');
  assert.ok(!fs.readFileSync(path.join(env.IMOVEIS_CONFIG, CT.ARQUIVO_CERTIFICADO), 'utf8').includes(pfx.slice(0, 40)), 'no disco, só cifrado');
  assert.throws(() => A.dadosDoCertificado(pfx, 'errada'), /senha do certificado não confere/);
  assert.throws(() => A.dadosDoCertificado(Buffer.from('não é certificado'), 'x'), /não é um certificado/);
});

// Defeitos achados na bateria de 22/11/2026: cada um com o seu teste.
test('computador ligado depois do 1º clique: o programa que já esperava passa a ver', async () => {
  let lig = null;
  const { porta, fim } = await abrir({ ligacao: null, relerLigacao: () => lig, parado: 500 });
  assert.equal((await pedir(porta, { cab: { Origin: 'https://erp.ankjck.com.br' } })).dados.ligado, false);
  lig = LIGACAO;
  assert.equal((await pedir(porta)).dados.ligado, true);
  await fim;
});

test('endereço do site estragado em config.json: vale o site padrão, sem cair', async () => {
  const { porta, fim } = await abrir({ ligacao: { site: 'isto não é endereço' }, parado: 300 });
  assert.equal((await pedir(porta, { cab: { Origin: 'https://erp.ankjck.com.br' } })).status, 200);
  await fim;
});

test('certificado.json estragado conta como "não instalado"; gravação que falha não perde o anterior', (t) => {
  const env = temp();
  const arq = path.join(env.IMOVEIS_CONFIG, CT.ARQUIVO_CERTIFICADO);
  fs.writeFileSync(arq, '{quebrado');
  assert.equal(CT.resumoDoCertificado(env), null);
  fs.writeFileSync(arq, JSON.stringify({ nome: 'ANTERIOR' }));
  t.mock.method(fs, 'renameSync', () => { throw new Error('sem espaço'); });
  assert.throws(() => CT.guardarCertificado({ pfx: PFX, senha: 's' }, env, { dados: () => DADOS, proteger: (x) => x }), /sem espaço/);
  assert.equal(CT.resumoDoCertificado(env).nome, 'ANTERIOR');
});

test('validade pelo dia deste computador: vale até o fim do último dia e não antes do primeiro', () => {
  // 22h do dia 30/06 no relógio daqui (em UTC já pode ser dia 1º)
  assert.equal(CT.diaDaqui(new Date(2027, 5, 30, 22, 0)), '2027-06-30');
  const guardar = (dados, hoje) => CT.guardarCertificado({ pfx: PFX, senha: 's' }, temp(), { dados: () => ({ ...DADOS, ...dados }), proteger: (x) => x, hoje });
  assert.ok(guardar({ validade: '2027-06-30' }, '2027-06-30'));
  assert.throws(() => guardar({ inicio: '2026-12-02' }, '2026-11-22'), /só vale a partir de 02\/12\/2026/);
});

test('botão do certificado pelo mouse, não pela largura (zoom de 200% no computador)', () => {
  const caixa = fs.readFileSync(new URL('../docs/js/telas/admin.js', import.meta.url), 'utf8').match(/function caixaCertificado\(\) \{[^]*?\n\}/)[0];
  assert.match(caixa, /pointer: coarse/);
  assert.doesNotMatch(caixa, /noComputador\(\)|max-width/);
});

test('Windows de verdade: assina com certificado de certificadora que o Windows não conhece (cadeia de A1)', { skip: process.platform !== 'win32' && 'só no Windows' }, () => {
  const criar = (junto) => {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$H = [System.Security.Cryptography.HashAlgorithmName]::SHA256; $P = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
$ka = [System.Security.Cryptography.RSA]::Create(2048)
$qa = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest('CN=AC DE TESTE DESCONHECIDA', $ka, $H, $P)
$qa.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension($true, $false, 0, $true)))
$ac = $qa.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-5), [DateTimeOffset]::Now.AddYears(3))
$k = [System.Security.Cryptography.RSA]::Create(2048)
$q = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest('CN=ANK TESTE LTDA:11222333000181', $k, $H, $P)
$f = $q.Create($ac, [DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(1), [byte[]](1,2,3,4))
$f = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($f, $k)
$col = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
[void]$col.Add($f)
${junto ? '[void]$col.Add((New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,$ac.RawData)))' : ''}
[Convert]::ToBase64String($col.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, 'teste123'))`], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  for (const junto of [true, false]) {
    const pfx = criar(junto);
    assert.equal(A.conferirCertificado(pfx, 'teste123').nome, 'ANK TESTE LTDA', `emissora junto: ${junto}`);
  }
});
