// Service worker do Painel Ecoviva (PWA instalavel). So cacheia o "shell"
// estatico da pagina (HTML/manifest/icones) - nunca os dados do Turso
// (`/v2/pipeline`, outra origem), pra nunca arriscar mostrar um numero
// desatualizado num painel que existe justamente pra mostrar dado ao vivo.
// Sobe a versao do nome do cache (`CACHE_NOME`) quando o shell mudar, pra
// forcar a limpeza do cache antigo no proximo `activate`.
var CACHE_NOME = "ecoviva-painel-v2";
var ARQUIVOS_SHELL = ["./", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(CACHE_NOME).then(function (cache) {
      return cache.addAll(ARQUIVOS_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(
        nomes
          .filter(function (nome) { return nome !== CACHE_NOME; })
          .map(function (nome) { return caches.delete(nome); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (evento) {
  var requisicao = evento.request;

  // So GET, e so mesma origem - `/v2/pipeline` do Turso (outra origem) e
  // qualquer outra requisicao cross-origin passam direto pro navegador,
  // nunca pro cache. Isso e o que garante que o painel nunca fique preso
  // mostrando um numero antigo.
  if (requisicao.method !== "GET" || new URL(requisicao.url).origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    fetch(requisicao)
      .then(function (resposta) {
        var copia = resposta.clone();
        caches.open(CACHE_NOME).then(function (cache) { cache.put(requisicao, copia); });
        return resposta;
      })
      .catch(function () {
        return caches.match(requisicao);
      })
  );
});
