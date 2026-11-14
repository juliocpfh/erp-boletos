// Gera o par de chaves VAPID do aviso no celular (nuvem/push.mjs). Uso: node tools/gerar-vapid.mjs
// Cadastre as duas no Worker (Cloudflare → Workers & Pages → erp-boletos → Settings → Variables and secrets, tipo Secret):
// VAPID_PUBLICA e VAPID_PRIVADA; e VAPID_CONTATO = mailto:<e-mail da empresa>. Guarde a privada só lá (não no git).
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const b64 = (b) => Buffer.from(b).toString('base64url');
const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
console.log(`VAPID_PUBLICA=${b64(publica)}`);
console.log(`VAPID_PRIVADA=${jwk.d}`);
