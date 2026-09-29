#!/usr/bin/env node
// Cifra as credenciais do Turso (URL + token somente-leitura) com uma chave
// derivada da senha do painel, e injeta o resultado em painel/index.html.
//
// Por que: antes o token ia em texto puro para a pagina publicada no GitHub
// Pages - qualquer um com "ver codigo-fonte" lia o banco consolidado inteiro e
// podia queimar a cota gratuita do Turso (ver docs/AUDITORIA.md, SEG-02). Com
// isso, a pagina publica so contem {salt, iv, texto cifrado}; sem a senha
// certa nao ha token nenhum pra extrair. A senha errada simplesmente falha no
// decrypt (AES-GCM autenticado) - nao existe mais hash da senha no arquivo.
//
// Mesmos parametros que painel/index.html usa pra decifrar (WebCrypto nos
// dois lados, sem dependencia): PBKDF2-SHA256 -> AES-GCM 256.
//
// Uso (variaveis de ambiente, nunca argumento - nao aparece em `ps`):
//   PAINEL_SENHA=... TURSO_PAINEL_URL=... TURSO_PAINEL_TOKEN=... \
//     node scripts/cifrar-credenciais-painel.mjs painel/index.html _site/index.html

import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const ITERACOES_PBKDF2 = 600000;
const MARCADOR = '__PAINEL_CREDENCIAIS_CIFRADAS__';
const SENHA_MINIMA = 12;

function falhar(mensagem) {
  console.error(`Erro: ${mensagem}`);
  process.exit(1);
}

const [origem, destino] = process.argv.slice(2);
if (!origem || !destino) falhar('uso: cifrar-credenciais-painel.mjs <template> <saida>');

const senha = process.env.PAINEL_SENHA ?? '';
const url = process.env.TURSO_PAINEL_URL ?? '';
const token = process.env.TURSO_PAINEL_TOKEN ?? '';

// Falha alto em vez de publicar uma pagina quebrada ou sem protecao: no
// workflow de deploy isso aborta o job antes do upload, e a versao anterior
// do painel continua no ar.
if (!url || !token) falhar('TURSO_PAINEL_URL e TURSO_PAINEL_TOKEN precisam estar definidos.');
if (senha.length < SENHA_MINIMA) {
  falhar(`PAINEL_SENHA precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
}

const template = readFileSync(origem, 'utf8');
if (!template.includes(MARCADOR)) falhar(`marcador ${MARCADOR} nao encontrado em ${origem}.`);

const subtle = webcrypto.subtle;
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));

const chaveBase = await subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
  'deriveKey',
]);
const chave = await subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERACOES_PBKDF2, hash: 'SHA-256' },
  chaveBase,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);
const cifrado = await subtle.encrypt(
  { name: 'AES-GCM', iv },
  chave,
  new TextEncoder().encode(JSON.stringify({ url, token }))
);

const base64 = (bytes) => Buffer.from(bytes).toString('base64');
const pacote = JSON.stringify({
  v: 1,
  iteracoes: ITERACOES_PBKDF2,
  salt: base64(salt),
  iv: base64(iv),
  dados: base64(new Uint8Array(cifrado)),
});

const saida = template.replace(`"${MARCADOR}"`, pacote);
if (saida.includes(token) || saida.includes(MARCADOR)) {
  falhar('saida inesperada (token em claro ou marcador nao substituido).');
}
writeFileSync(destino, saida);
console.log(`Credenciais cifradas gravadas em ${destino}.`);
