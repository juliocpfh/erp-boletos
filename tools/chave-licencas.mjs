// Gera o par de chaves Ed25519 que assina os certificados de licença (nuvem/licencas.mjs).
// Uso: node tools/chave-licencas.mjs  → mostra a PRIVADA (vai só para o segredo LICENCA_CHAVE_PRIVADA do Worker, no painel
// do Cloudflare) e a PÚBLICA (vai para o código do sistema, que confere os certificados). Nada é gravado em arquivo.
// Gerar de novo invalida todos os certificados já emitidos: só faça uma vez (ou se a privada vazar).
import { gerarParDeChaves } from '../nuvem/licencas.mjs';

const { privada, publica } = await gerarParDeChaves();
console.log('PRIVADA (cole no segredo LICENCA_CHAVE_PRIVADA; não guarde em arquivo):');
console.log(JSON.stringify(privada));
console.log('\nPÚBLICA (vai para o código do sistema e, se quiser, para a variável LICENCA_CHAVE_PUBLICA):');
console.log(JSON.stringify(publica));
