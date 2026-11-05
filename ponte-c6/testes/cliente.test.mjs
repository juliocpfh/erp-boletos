// Cliente do site (docs/js/banco-fase2.js): valida os parâmetros antes de chamar a ponte e monta os caminhos certos.
// Usa o banco.js que estiver na pasta (o stub lança "ponte não configurada"; o real tenta a rede e falha sem ponte): o que
// importa aqui é que a validação local acontece ANTES e que as chamadas válidas chegam a chamarPonte.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../../docs/js/banco-fase2.js';

const chegouNaPonte = (e) => e instanceof Error && !/AAAA-MM-DD|Informe/.test(e.message);

test('cliente: datas e parâmetros são conferidos antes de ir à ponte', async () => {
  await assert.rejects(B.extratoDaConta('ank', '01/11/2026', '2026-11-30'), /AAAA-MM-DD/);
  await assert.rejects(B.boletosPagos('ank', '2026-11-01', 'ontem'), /AAAA-MM-DD/);
  await assert.rejects(B.decodificarPagamentos('ank', []), /pelo menos um/);
  await assert.rejects(B.itensDoGrupo('ank', ''), /Informe o grupo/);
  await assert.rejects(B.removerItensDoGrupo('ank', 'G1', []), /Informe os itens/);
  await assert.rejects(B.enviarGrupoParaAprovacao('ank', 'G1', '  '), /Informe o nome/);
  await assert.rejects(B.baixarComprovantePonte('ank', ''), /referência/);
});

test('cliente: com parâmetros válidos a chamada chega a chamarPonte', async () => {
  await assert.rejects(B.extratoDaConta('ank', '2026-11-01', '2026-11-30'), chegouNaPonte);
  await assert.rejects(B.saldoDaConta('jck'), chegouNaPonte);
  await assert.rejects(B.boletosPagos('ank', '2026-11-01', '2026-11-30', 'credit_date'), chegouNaPonte);
  await assert.rejects(B.ddaDaConta('ank'), chegouNaPonte);
  await assert.rejects(B.decodificarPagamentos('ank', [{ content: '1', amount: 1 }]), chegouNaPonte);
  await assert.rejects(B.itensDoGrupo('ank', 'G1'), chegouNaPonte);
  await assert.rejects(B.removerItensDoGrupo('ank', 'G1', ['a']), chegouNaPonte);
  await assert.rejects(B.enviarGrupoParaAprovacao('ank', 'G1', 'Dono'), chegouNaPonte);
  await assert.rejects(B.baixarComprovantePonte('ank', 'ref-1', '2026-11-03'), chegouNaPonte);
});

test('bytesDoBase64 devolve os bytes certos (PDF começa com %PDF-)', () => {
  const bytes = B.bytesDoBase64(Buffer.from('%PDF-1.4 olá').toString('base64'));
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).toString(), '%PDF-1.4 olá');
  const blob = new Blob([bytes], { type: 'application/pdf' });
  assert.equal(blob.type, 'application/pdf');
  assert.equal(blob.size, bytes.length);
});
