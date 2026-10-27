/* Formulário de candidatura — BL Company
 *
 * BL_APPS_SCRIPT_URL (recomendado): URL /exec do Web App do Apps Script (apps-script/Code.gs).
 *   O script salva o currículo na pasta do Drive e repassa os dados + link do arquivo para o Make.
 *   Com ele preenchido, o BL_WEBHOOK_URL abaixo é ignorado (o webhook do Make fica no Apps Script).
 *
 * BL_WEBHOOK_URL (alternativa): envio direto para o Make/n8n em multipart/form-data,
 *   com o arquivo no campo "curriculo".
 *
 * Os dois vazios = só redireciona para a página de obrigado.
 * Cada <form> define: data-vaga (nome da vaga) e data-obrigado (caminho da página de obrigado).
 * Campos obrigatórios usam data-req="mensagem de erro".
 */
var BL_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxkasaBQ4K2nZMov-ATCPvlKEKPwoVfLJ8JPbR9L8JFDY-D3Tgx4MTXe3H05jlF2bo/exec';
var BL_WEBHOOK_URL = 'https://hook.us1.make.com/up9kk4m1oe2k5s56fda3jg3437qypnuy';
var BL_MAX_MB = 5;
var BL_EXT = ['pdf', 'doc', 'docx'];

(function () {
  var form = document.getElementById('bl-form');
  if (!form) return;
  var errorEl = document.getElementById('bl-error');
  var submitBtn = form.querySelector('button[type="submit"]');
  var tel = form.querySelector('input[type="tel"]');
  var cv = form.querySelector('input[type="file"]');
  var cvName = form.querySelector('[data-file-name]');
  var cvDefault = cvName ? cvName.textContent : '';

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

  function fileError(file) {
    if (!file) return 'Anexe seu currículo.';
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (BL_EXT.indexOf(ext) === -1) return 'Envie o currículo em PDF, DOC ou DOCX.';
    if (file.size > BL_MAX_MB * 1024 * 1024) return 'O currículo deve ter até ' + BL_MAX_MB + ' MB.';
    return '';
  }

  if (cv) cv.addEventListener('change', function () {
    var file = cv.files[0];
    var label = cv.closest('.upload');
    if (!file) { cvName.textContent = cvDefault; label.classList.remove('has-file'); return; }
    var err = fileError(file);
    if (err) { cv.value = ''; cvName.textContent = cvDefault; label.classList.remove('has-file'); fail(err); return; }
    errorEl.hidden = true;
    var kb = file.size / 1024;
    cvName.textContent = file.name + ' (' + (kb < 1024 ? Math.max(1, Math.round(kb)) + ' KB' : (kb / 1024).toFixed(1) + ' MB') + ')';
    label.classList.add('has-file');
  });

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
      if (el.type === 'file') { var e = fileError(el.files[0]); if (e) return fail(e, el); continue; }
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

    // Monta o envio: campos de texto (múltiplos valores juntados por vírgula) + arquivo
    var src = new FormData(form), body = new FormData(), seen = {};
    src.forEach(function (val, key) {
      if (val instanceof File) return;
      val = String(val).trim();
      seen[key] = seen[key] ? seen[key] + ', ' + val : val;
    });
    if (tel) seen.whatsapp = '55' + tel.value.replace(/\D/g, '');
    seen.vaga = form.dataset.vaga;
    seen.pagina = location.href;
    seen.enviado_em = new Date().toISOString();
    var u = utms(); for (var k in u) seen[k] = u[k];
    for (var key in seen) body.append(key, seen[key]);
    if (cv && cv.files[0]) body.append('curriculo', cv.files[0], cv.files[0].name);

    function done() {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'form_candidatura_enviado', vaga: form.dataset.vaga });
      try { sessionStorage.setItem('bl_nome', String(seen.nome || '').split(' ')[0]); } catch (err) {}
      window.location.href = form.dataset.obrigado + location.search;
    }

    if (!BL_APPS_SCRIPT_URL && !BL_WEBHOOK_URL) return done();
    submitBtn.disabled = true;
    var label = submitBtn.textContent;
    submitBtn.textContent = 'Enviando…';

    function onError() {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
      fail('Não foi possível enviar agora. Tente novamente em instantes.');
    }

    if (BL_APPS_SCRIPT_URL) {
      // Apps Script: JSON com o arquivo em base64. Sem header Content-Type
      // (vai como text/plain) para não disparar preflight de CORS.
      var file = cv.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = String(reader.result).split(',')[1];
        fetch(BL_APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ dados: seen, curriculo: { nome: file.name, tipo: file.type, base64: base64 } })
        })
          .then(function (r) { return r.json(); })
          .then(function (res) { if (!res.ok) throw new Error(res.erro); done(); })
          .catch(onError);
      };
      reader.onerror = onError;
      reader.readAsDataURL(file);
      return;
    }

    // Webhook direto: multipart/form-data (o navegador define o boundary)
    fetch(BL_WEBHOOK_URL, { method: 'POST', body: body })
      .then(function (r) { if (!r.ok) throw new Error(r.status); done(); })
      .catch(onError);
  });
})();
