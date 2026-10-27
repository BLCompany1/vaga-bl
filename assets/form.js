/* Formulário de candidatura — BL Company
 * Configure o webhook (Make / n8n) abaixo. Vazio = só redireciona para a página de obrigado.
 * Cada <form> define: data-vaga (nome da vaga) e data-obrigado (caminho da página de obrigado).
 * Campos obrigatórios usam data-req="mensagem de erro".
 */
var BL_WEBHOOK_URL = '';

(function () {
  var form = document.getElementById('bl-form');
  if (!form) return;
  var errorEl = document.getElementById('bl-error');
  var submitBtn = form.querySelector('button[type="submit"]');
  var tel = form.querySelector('input[type="tel"]');

  // Máscara (DDD) 99999-9999 — ignora +55 / 55 antes do DDD
  function maskPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    d = d.slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  if (tel) tel.addEventListener('input', function () { tel.value = maskPhone(tel.value); });

  function utms() {
    var p = new URLSearchParams(location.search), o = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { o[k] = p.get(k) || ''; });
    return o;
  }

  function fail(msg, el) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (el && el.focus) el.focus();
    return false;
  }

  function validate() {
    var fields = form.querySelectorAll('[data-req]');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i], v = String(el.value || '').trim();
      if (el.type === 'tel' && v.replace(/\D/g, '').length < 10) return fail(el.dataset.req, el);
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return fail(el.dataset.req, el);
      if (!v) return fail(el.dataset.req, el);
    }
    return true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    if (!validate()) return;

    var f = new FormData(form), data = {};
    f.forEach(function (val, key) {
      val = String(val).trim();
      data[key] = data[key] ? data[key] + ', ' + val : val;
    });
    if (tel) data.whatsapp = '55' + tel.value.replace(/\D/g, '');
    data.vaga = form.dataset.vaga;
    data.pagina = location.href;
    data.enviado_em = new Date().toISOString();
    Object.assign(data, utms());

    function done() {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'form_candidatura_enviado', vaga: form.dataset.vaga });
      try { sessionStorage.setItem('bl_nome', String(data.nome || '').split(' ')[0]); } catch (err) {}
      window.location.href = form.dataset.obrigado + location.search;
    }

    if (!BL_WEBHOOK_URL) return done();
    submitBtn.disabled = true;
    var label = submitBtn.textContent;
    submitBtn.textContent = 'Enviando…';
    fetch(BL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); done(); })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = label;
        fail('Não foi possível enviar agora. Tente novamente em instantes.');
      });
  });
})();
