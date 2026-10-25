/* Révision DEMS — application locale (aucune connexion requise) */
(function () {
  'use strict';
  var D = window.DEMS;
  if (!D) { document.body.textContent = 'Le fichier de données est introuvable (fichiers/donnees.js).'; return; }

  /* ------------------------------------------------------------------ données dérivées */
  var F = D.fiches, ORDER = D.order;
  var THEMES = {}, CATS = {};
  D.cats.forEach(function (c) {
    CATS[c.id] = c;
    c.themes.forEach(function (t) { t.cat = c.id; THEMES[t.id] = t; t.all = []; t.groups.forEach(function (g) { t.all = t.all.concat(g.fiches); }); });
  });
  var CARD = {}; D.cards.forEach(function (c) { CARD[c.id] = c; });
  var NORM = {}; // texte normalisé pour la recherche (calculé à la demande)
  var TREE_ORDER = []; D.cats.forEach(function (c) { c.themes.forEach(function (t) { TREE_ORDER = TREE_ORDER.concat(t.all); }); });

  /* ------------------------------------------------------------------ stockage */
  var KEY = 'revision-dems-v1', mem = null, canStore = true, EXAM = '2026-12-06';
  function blank() {
    return { v: 1, exam: EXAM, examSet: false, start: today(), fiches: {}, cards: {}, clozes: {}, chks: {}, devs: {}, log: {}, qcm: {}, sujets: {}, exams: [], theme: 'auto' };
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { canStore = false; return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { canStore = false; return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  function memKey(id) { id = id === undefined ? (me && me.id) : id; return id ? KEY + ':' + id : KEY; }
  function normMem(o) {
    var m = Object.assign(blank(), o || {});
    if (!m.examSet) m.exam = EXAM; // date officielle tant qu'elle n'a pas été modifiée à la main
    ['fiches', 'cards', 'clozes', 'chks', 'devs', 'log', 'qcm', 'sujets'].forEach(function (k) { m[k] = m[k] || {}; }); m.exams = m.exams || [];
    return m;
  }
  function load() {
    var s = null;
    try { s = JSON.parse(lsGet(memKey()) || 'null'); } catch (e) { s = null; }
    mem = normMem(s);
  }
  function save() {
    mem.savedAt = Date.now();
    lsSet(memKey(), JSON.stringify(mem));
    if (me && me.last !== today()) { me.last = today(); saveProfils(); }
  }

  /* ------------------------------------------------------------------ profils : comptes personnels gardés sur cet appareil (aucun serveur) */
  var PKEY = 'revision-dems-profils', profils = { v: 1, list: [], current: null }, me = null;
  function loadProfils() {
    var o = null; try { o = JSON.parse(lsGet(PKEY) || 'null'); } catch (e) { o = null; }
    profils = o && o.list ? o : { v: 1, list: [], current: null };
  }
  function saveProfils() { lsSet(PKEY, JSON.stringify(profils)); }
  function profById(id) { for (var i = 0; i < profils.list.length; i++) if (profils.list[i].id === id) return profils.list[i]; return null; }
  function profByName(n) { n = normalize(n.trim()); for (var i = 0; i < profils.list.length; i++) if (normalize(profils.list[i].nom) === n) return profils.list[i]; return null; }
  function initials(n) { var w = n.trim().split(/\s+/); return ((w[0] || '?').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase(); }
  function rndHex(n) { var a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); }); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function hashPwd(salt, pwd) {
    var txt = salt + ':' + pwd;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (b) { return 'sha256:' + Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    }
    var h1 = 0x811c9dc5, h2 = 0x01000193; // repli sans WebCrypto (page ouverte hors contexte sécurisé)
    for (var i = 0; i < txt.length; i++) { h1 = Math.imul(h1 ^ txt.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ txt.charCodeAt(i), 2246822519) >>> 0; }
    return Promise.resolve('fnv:' + h1.toString(16) + h2.toString(16));
  }
  function legacyInfo() { // progression enregistrée avant les profils (une seule par navigateur)
    var o = null; try { o = JSON.parse(lsGet(KEY) || 'null'); } catch (e) { o = null; }
    if (!o) return null;
    var nf = Object.keys(o.fiches || {}).filter(function (f) { return (o.fiches[f] || {}).learned; }).length, nq = Object.keys(o.qcm || {}).length, nc = Object.keys(o.cards || {}).length;
    return nf || nq || nc ? { mem: o, txt: plural(nf, 'fiche apprise', 'fiches apprises') + ', ' + plural(nq, 'QCM fait', 'QCM faits') } : null;
  }

  /* ------------------------------------------------------------------ dates */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return iso(new Date()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fdate(s) { var d = parse(s); return d.getDate() + ' ' + MOIS[d.getMonth()]; }
  function phases() {
    // phases proportionnelles au temps restant depuis le début des révisions : 55 % / 25 % / 20 %
    var e = mem.exam, total = Math.max(21, diff(mem.start, e));
    var p3 = addDays(e, -Math.max(7, Math.round(total * .2))), p2 = addDays(p3, -Math.max(7, Math.round(total * .25)));
    return [
      { n: 1, name: 'Premier passage', from: mem.start < p2 ? mem.start : today(), to: addDays(p2, -1), what: 'Apprendre toutes les fiches une première fois, gros thèmes d’abord.' },
      { n: 2, name: 'Deuxième passage', from: p2, to: addDays(p3, -1), what: 'Repasser vite sur tout, insister sur les fiches ratées, rédiger des plans chronométrés.' },
      { n: 3, name: 'Consolidation', from: p3, to: e, what: 'Encadrés « À retenir », questions et examens blancs. Rien de nouveau.' }
    ];
  }
  function currentPhase() { var t = today(), ps = phases(); for (var i = 0; i < ps.length; i++) if (t <= ps[i].to) return ps[i]; return ps[2]; }

  /* ------------------------------------------------------------------ outils */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var ISO = /\b(\d{2,3}m?)(Tc|In|Ga|Ge|Lu|Tl|Xe|Kr|Rb|Sr|Sm|Re|Ra|Ac|Bi|Er|Cr|Co|Cu|Zr|Mo|Te|Tb|At|Ho|Cs|Ba|Gd|Se|Fe|Na|Ca|Br|Zn|Ru|Rh|Pb|Sn|Yb|Dy|Y|I|F|C|N|O|P|K|U)(?![a-z])/g;
  function qt(x) { return esc(x).replace(ISO, '<sup>$1</sup>$2'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function strip(s) { var d = document.createElement('div'); d.innerHTML = s; return d.textContent; }
  function normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function plural(n, a, b) { return n + ' ' + (n > 1 ? (b || a + 's') : a); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function link(fid) { return '#/fiche/' + fid; }
  function fpages(fid) { return F[fid].np || 1; } // pages manuscrites couvertes par la fiche
  function logToday(k, n) { var t = today(); mem.log[t] = mem.log[t] || {}; mem.log[t][k] = (mem.log[t][k] || 0) + (n || 1); }

  /* ------------------------------------------------------------------ maîtrise (carte de fixation) */
  var LUT = ['--lut0', '--lut1', '--lut2', '--lut3', '--lut4', '--lut5'];
  var lutRGB = null;
  function readLut() {
    var cs = getComputedStyle(document.documentElement);
    lutRGB = LUT.map(function (v) { var h = cs.getPropertyValue(v).trim(); return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; });
  }
  function lut(x) {
    if (!lutRGB) readLut();
    x = Math.max(0, Math.min(1, x)) * (lutRGB.length - 1);
    var i = Math.min(lutRGB.length - 2, Math.floor(x)), f = x - i, a = lutRGB[i], b = lutRGB[i + 1];
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(',') + ')';
  }
  function mastery(fid) {
    var st = mem.fiches[fid]; if (!st || !st.learned) return -1;
    var cs = F[fid].cards; if (!cs.length) return .5;
    var s = 0;
    cs.forEach(function (c) { var k = mem.cards[c]; s += k ? Math.min(1, (k.int || 0) / 30) : 0; });
    return .08 + .92 * (s / cs.length);
  }
  function dotColor(fid) { var m = mastery(fid); return m < 0 ? '' : lut(m); }

  /* ------------------------------------------------------------------ répétition espacée (SM-2 simplifié) */
  function dueCards() {
    var t = today(), out = [];
    Object.keys(mem.cards).forEach(function (cid) { var k = mem.cards[cid]; if (CARD[cid] && k.due <= t) out.push(cid); });
    out.sort(function (a, b) { return mem.cards[a].due < mem.cards[b].due ? -1 : 1; });
    return out;
  }
  function schedule(cid, g, dry) {
    var k = Object.assign({ int: 0, ease: 2.5, reps: 0, lapses: 0 }, mem.cards[cid] || {});
    var iv;
    if (g === 1) { k.lapses++; k.reps = 0; k.ease = Math.max(1.3, k.ease - .2); iv = 0; }
    else if (g === 2) { k.ease = Math.max(1.3, k.ease - .15); iv = k.reps === 0 ? 1 : Math.max(1, Math.round(k.int * 1.2)); k.reps++; }
    else if (g === 3) { iv = k.reps === 0 ? 1 : k.reps === 1 ? 4 : Math.round(k.int * k.ease); k.reps++; }
    else { k.ease += .15; iv = k.reps === 0 ? 4 : Math.round(Math.max(k.int, 1) * k.ease * 1.3); k.reps++; }
    iv = Math.min(iv, Math.max(1, diff(today(), mem.exam))); // inutile de reporter après l'examen
    if (g !== 1 && iv < 1) iv = 1;
    if (dry) return iv;
    k.int = iv; k.due = addDays(today(), iv); k.last = today();
    mem.cards[cid] = k;
    return iv;
  }
  function ivLabel(n) { return n === 0 ? 'tout de suite' : n === 1 ? 'demain' : 'dans ' + n + ' j'; }
  function learnFiche(fid) {
    var t = today();
    mem.fiches[fid] = Object.assign(mem.fiches[fid] || {}, { learned: t, rereads: [] });
    F[fid].cards.forEach(function (cid) { if (!mem.cards[cid]) mem.cards[cid] = { int: 0, ease: 2.5, reps: 0, lapses: 0, due: addDays(t, 1) }; });
    logToday('learned'); save();
  }
  function rereadsDue() { // relectures J+1, J+7, J+21
    var t = today(), out = [];
    Object.keys(mem.fiches).forEach(function (fid) {
      var st = mem.fiches[fid]; if (!st.learned || !F[fid]) return;
      var done = st.rereads || [];
      [1, 7, 21].forEach(function (d, i) { if (done.length === i && addDays(st.learned, d) <= t) out.push({ f: fid, step: d }); });
    });
    return out;
  }

  /* ------------------------------------------------------------------ rendu général */
  var app = $('#app'), main = $('#main');
  function setTheme() {
    if (mem.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mem.theme);
    lutRGB = null;
  }
  function renderSide(route) {
    var due = dueCards().length, chkOpen = D.chks.filter(function (c) { return !(mem.chks[c.id] || {}).done; }).length;
    var errN = Object.keys(mem.qcm).filter(function (id) { return QCM[id] && mem.qcm[id].lastOk === false; }).length;
    var nav = [
      ['#/', 'Aujourd’hui', ''],
      ['#/defi', 'Défi du jour', (mem.defi || {})[today()] ? 'fait' : (defiStreak() ? 'série ' + defiStreak() : '')],
    ].concat((function () { var fp = featuredProg(); if (!fp) return []; var i = progDayIdx(fp.p); return [['#/programme/' + fp.p.id, fp.p.court || fp.p.titre, fp.st === 0 ? 'jour ' + (i + 1) + '/' + fp.p.jours.length : fp.st === 1 ? 'bientôt' : 'fini']]; })(), [
      ['#/revision', 'Réviser les questions', due ? due : ''],
      ['#/qcm', 'QCM', D.qcm.length],
      ['#/ouvertes', 'Questions ouvertes', (D.ouvertes || []).length || ''],
      ['#/cas', 'Cas cliniques', (D.cas || []).length || ''],
      ['#/oral', 'Oral blanc', ''],
      ['#/carte', 'Cartes mentales', ''],
      ['#/examen', 'Examen blanc', exam && !exam.done ? 'en cours' : ''],
      ['#/sujets', 'Sujets rédactionnels', Object.keys(SUJ).length],
      ['#/chiffres', 'Chiffres', ''],
      ['#/erreurs', 'Carnet d’erreurs', errN || ''],
      ['#/stats', 'Statistiques', ''],
      ['#/a-verifier', 'À vérifier', chkOpen],
      ['#/planning', 'Planning', ''],
      ['#/pdf', 'Fiches en PDF', ''],
      ['#/donnees', 'Réglages et sauvegarde', '']
    ]);
    $('#nav').innerHTML = nav.map(function (n) {
      var on = (route.name === '' && n[0] === '#/') || (n[0] !== '#/' && (n[0].slice(2) === route.name || n[0].slice(2) === route.name + '/' + route.arg || (route.name === 'sujet' && n[0] === '#/sujets')));
      return '<a href="' + n[0] + '"' + (on ? ' class="on" aria-current="page"' : '') + '><span>' + n[1] + '</span><span class="count">' + n[2] + '</span></a>';
    }).join('');
    var cur = route.name === 'fiche' ? route.arg : null;
    var curTheme = cur && F[cur] ? F[cur].theme : (route.name === 'theme' ? route.arg : null);
    $('#tree').innerHTML = D.cats.map(function (c) {
      var openC = curTheme && THEMES[curTheme].cat === c.id;
      return '<details class="cat"' + (openC ? ' open' : '') + '><summary>' + esc(c.name) + '</summary>' +
        c.themes.map(function (t) {
          var inner = t.groups.map(function (g) {
            return (g.name ? '<div class="grp">' + esc(g.name) + '</div>' : '') + g.fiches.map(function (fid) {
              var col = dotColor(fid);
              return '<a class="f' + (fid === cur ? ' on' : '') + '" href="' + link(fid) + '"><span class="dot"' + (col ? ' style="background:' + col + '"' : '') + '></span><span>' + F[fid].th + '</span></a>';
            }).join('');
          }).join('');
          if (c.themes.length === 1) return '<div class="th">' + inner + '</div>';
          return '<details class="th"' + (t.id === curTheme ? ' open' : '') + '><summary>' + esc(t.short) + '</summary>' + inner + '</details>';
        }).join('') + '</details>';
    }).join('');
    var d = diff(today(), mem.exam);
    $('#examline').textContent = d >= 0 ? 'J−' + d : 'examen passé';
    var tw = $('#topwho'); if (tw) { tw.hidden = !me; if (me) { tw.textContent = initials(me.nom); tw.title = me.nom + ' : mon profil'; } }
    var wb = $('#whoami');
    if (wb) { wb.hidden = !me; if (me) { wb.innerHTML = '<span class="ini">' + esc(initials(me.nom)) + '</span><span class="nm">' + esc(me.nom) + '</span><button class="linkbtn" id="bout">Se déconnecter</button>'; $('#bout').onclick = logout; } }
    var on = $('#tree a.f.on'); if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(); else if (on) on.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------------ page : aujourd'hui */
  function nextToLearn() {
    var ph = currentPhase(), remaining = ORDER.filter(function (f) { return !(mem.fiches[f] || {}).learned; });
    var pagesLeft = remaining.reduce(function (s, f) { return s + fpages(f); }, 0);
    var p1 = phases()[0];
    var daysLeft = Math.max(1, diff(today(), p1.to) + 1);
    var target = ph.n === 1 ? Math.max(4, Math.ceil(pagesLeft / daysLeft)) : Math.max(4, Math.ceil(pagesLeft / Math.max(1, diff(today(), phases()[2].from))));
    var learnedToday = Object.keys(mem.fiches).filter(function (f) { return mem.fiches[f].learned === today(); });
    var done = learnedToday.reduce(function (s, f) { return s + fpages(f); }, 0);
    var pick = [], acc = done;
    for (var i = 0; i < remaining.length && acc < target; i++) { pick.push(remaining[i]); acc += fpages(remaining[i]); }
    return { pick: pick, target: target, done: done, remaining: remaining, pagesLeft: pagesLeft, learnedToday: learnedToday };
  }
  function pageToday() {
    var d = diff(today(), mem.exam), ph = currentPhase(), due = dueCards(), rr = rereadsDue(), nl = nextToLearn();
    var learned = Object.keys(mem.fiches).filter(function (f) { return mem.fiches[f].learned && F[f]; }).length;
    var seen = Object.keys(mem.cards).filter(function (c) { return CARD[c] && mem.cards[c].reps > 0; }).length;
    var solid = Object.keys(mem.cards).filter(function (c) { return CARD[c] && mem.cards[c].int >= 21; }).length;
    var h = '<div class="page wide">';
    h += heroHtml(d, ph, progPanel());

    h += '<div class="today">';
    // apprendre
    var fpa = featuredProg(), inProg = fpa && fpa.st === 0;
    if (inProg) h += '<div><h3>Apprendre</h3><div class="muted small">Aujourd’hui, le programme « ' + esc(fpa.p.court || fpa.p.titre) + ' » remplace l’objectif habituel du plan.</div><ul>';
    else h += '<div><h3>Apprendre</h3><div class="muted small">Objectif du jour : environ ' + nl.target + ' pages' + (nl.done ? ', ' + nl.done + ' déjà faites' : '') + '.</div><ul>';
    if (inProg) h += '<li><a href="#/programme/' + fpa.p.id + '">Voir le programme complet</a></li>';
    else if (nl.pick.length) nl.pick.forEach(function (f) { h += '<li><a href="' + link(f) + '">' + F[f].th + '</a><span class="muted small num nowrap">' + fpages(f) + ' p.</span></li>'; });
    else h += '<li>' + (nl.remaining.length ? 'Objectif atteint pour aujourd’hui.' : 'Toutes les fiches ont été apprises.') + '</li>';
    h += '</ul>' + (nl.pick.length && !inProg ? '<a class="btn primary" href="' + link(nl.pick[0]) + '">Ouvrir la prochaine fiche</a>' : '') + '</div>';
    // réviser
    h += '<div><h3>Réviser</h3><div class="big">' + due.length + '</div><div class="muted small">' + (due.length > 1 ? 'questions arrivées à échéance' : 'question arrivée à échéance') + '</div>';
    h += '<p class="small muted">Les questions d’une fiche entrent en révision quand vous la marquez comme apprise.</p>';
    h += due.length ? '<a class="btn primary" href="#/revision">Commencer la révision</a>' : '<span class="muted small">Rien à réviser pour l’instant.</span>';
    h += '</div>';
    // relire + chiffres
    h += '<div><h3>Relire</h3>';
    if (rr.length) {
      h += '<ul>' + rr.slice(0, 6).map(function (r) { return '<li><a href="' + link(r.f) + '">' + F[r.f].th + '</a><span class="muted small">J+' + r.step + '</span></li>'; }).join('') + '</ul>';
      if (rr.length > 6) h += '<div class="muted small">et ' + (rr.length - 6) + ' autres</div>';
    } else h += '<ul><li class="muted">Aucune relecture prévue aujourd’hui.</li></ul>';
    h += '<a class="btn" href="#/chiffres">10 minutes de chiffres</a></div>';
    h += '</div>';

    // s'entraîner
    var lf = learnedFiches().length, sc = lf ? 'apprises' : 'tout';
    h += '<h2 class="sec">S’entraîner</h2><div class="train">' +
      '<a class="tile" href="#/defi"><b>Défi du jour</b><span>' + ((mem.defi || {})[today()] ? 'fait aujourd’hui' + (defiStreak() > 1 ? ', série de ' + defiStreak() + ' jours' : '') : '15 questions mêlées sur ce que vous avez vu') + '</span></a>' +
      ((D.cas || []).length ? '<a class="tile" href="#/cas"><b>Un cas clinique</b><span>dossier progressif, étape par étape</span></a>' : '') +
      '<a class="tile" href="#/oral"><b>Oral blanc</b><span>question lue, réponse à voix haute, chronométrée</span></a>' +
      '<a class="tile" href="#/qcm?s=' + sc + '&n=20&go=1"><b>20 QCM</b><span>' + (lf ? 'sur vos fiches apprises' : 'au hasard dans toutes les fiches') + '</span></a>' +
      ((D.ouvertes || []).length ? '<a class="tile" href="#/ouvertes?s=' + sc + '&n=10&go=1"><b>10 questions ouvertes</b><span>réponse écrite ou dictée, points clés</span></a>' : '') +
      '<a class="tile" href="#/sujet/' + pickSujet(sc) + '"><b>Un sujet rédactionnel</b><span>plan en temps limité, puis plan attendu</span></a>' +
      '<a class="tile" href="#/examen"><b>Examen blanc</b><span>QCM chronométrés, note sur 20</span></a>' +
      '<a class="tile" href="#/chiffres?portee=' + (lf ? 'apprises' : 'tout') + '&mode=qcm"><b>Chiffres en QCM</b><span>énergies, activités, délais, seuils</span></a></div>';
    // carte de fixation
    h += '<h2 class="sec">Carte de fixation</h2><div class="map">';
    D.cats.forEach(function (c) {
      c.themes.forEach(function (t) {
        h += '<div class="mrow"><div class="mname" title="' + esc(t.name) + '">' + esc(t.short) + '</div><div class="cells">';
        t.all.forEach(function (fid) {
          var col = dotColor(fid), isDue = F[fid].cards.some(function (cid) { var k = mem.cards[cid]; return k && k.due <= today(); });
          h += '<a class="cell' + (isDue ? ' due' : '') + '" href="' + link(fid) + '" title="' + esc(F[fid].title) + '"' + (col ? ' style="background:' + col + '"' : '') + '></a>';
        });
        h += '</div></div>';
      });
    });
    h += '<div class="legend"><span class="cold"></span>pas encore apprise<span class="ramp" aria-hidden="true"></span>apprise, puis maîtrisée</div></div>';
    h += '<div class="stats"><span><b>' + learned + '</b> / ' + ORDER.length + ' fiches apprises</span><span><b>' + seen + '</b> / ' + D.cards.length + ' questions travaillées</span><span><b>' + solid + '</b> questions solides (intervalle ≥ 3 semaines)</span></div>';
    h += '<details class="guide"><summary>Comment utiliser ce site</summary><ol>' +
      '<li><b>Apprendre</b> : ouvrez la fiche proposée, lisez « À retenir », puis la fiche. Tranchez les mentions [à vérifier] au fur et à mesure.</li>' +
      '<li><b>Comparer</b> : un doute sur une valeur ou un mot déduit ? Le bouton « Manuscrit » (ou la vignette à droite du titre) ouvre vos pages d’origine à côté de la fiche.</li>' +
      '<li><b>Réciter</b> : activez le mode plan, récitez chaque partie de tête, cliquez sur le titre pour vérifier.</li>' +
      '<li><b>Écouter</b> : le bouton « Écouter » d’une fiche la lit à voix haute (toute la fiche, « À retenir » seul, ou questions et réponses) ; cliquez sur un paragraphe pour y sauter. Dans un programme, « Écouter les « À retenir » » enchaîne les encadrés du jour.</li>' +
      '<li><b>Répondre à l’oral</b> : dans « Questions ouvertes », dictez votre réponse (Chrome, Edge ou Safari) puis comparez-la à la réponse attendue ; les points clés cités sont cochés tout seuls.</li>' +
      '<li><b>Valider</b> : cliquez sur « J’ai appris cette fiche ». Ses questions entrent dans la révision espacée et des relectures sont prévues à J+1, J+7 et J+21.</li>' +
      '<li><b>Réviser chaque jour</b> : faites les questions arrivées à échéance et 10 minutes de chiffres. La carte de fixation chauffe à mesure que vous maîtrisez.</li>' +
      '<li><b>Sauvegarder et changer d’appareil</b> : chaque collègue a son profil sur l’appareil où il l’a créé. « Transférer mon profil » (Réglages et sauvegarde) crée un fichier à importer sur un autre appareil ; gardez-en une copie de temps en temps.</li></ol></details>';
    if (!canStore) h += '<p class="nb">Ce navigateur bloque l’enregistrement local : votre progression sera perdue à la fermeture. Ouvrez le site avec Chrome, Edge ou Firefox.</p>';
    h += '</div>';
    main.innerHTML = h;
  }


  /* compte à rebours et calendrier à petits carreaux : jours passés barrés, programme surligné, examen entouré */
  var MOISL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function heroHtml(d, ph, extra) {
    var t = today(), e = mem.exam, ps = phases(), ed = parse(e);
    var h = '<section class="hero"><div><div class="count"><span class="days num">' + Math.max(0, d) + '</span><span class="unit">' +
      (d < 0 ? 'examen passé' : d === 1 ? 'jour avant l’examen' : d === 0 ? 'c’est le jour de l’examen' : 'jours avant l’examen') +
      '<span>' + cap(JOURS[ed.getDay()]) + ' ' + ed.getDate() + ' ' + MOISL[ed.getMonth()] + '</span></span></div>' +
      '<p class="phase"><b>Phase ' + ph.n + ' : ' + ph.name.toLowerCase() + '</b>, jusqu’au ' + fdate(ph.to).replace(/\.$/, '') + '. ' + esc(ph.what) + '</p>' + (extra || '') + '</div>';
    h += calHtml(t, e, ps) + '</section>';
    return h;
  }
  function calHtml(t, e, ps) {
    if (e < t) return '';
    var from = mem.start && mem.start < t ? (diff(mem.start, t) > 14 ? addDays(t, -14) : mem.start) : t;
    from = addDays(from, -((parse(from).getDay() + 6) % 7));
    var to = addDays(e, (7 - parse(e).getDay()) % 7);
    var pdays = {}, pnames = [];
    progs().forEach(function (p) {
      if (progEnd(p) < t || p.debut > e) return;
      pnames.push(p.court || p.titre);
      p.jours.forEach(function (j, i) { pdays[progDate(p, i)] = (p.court || p.titre) + ', jour ' + (i + 1) + ' : ' + j.titre; });
    });
    var h = '<div><div class="cal" aria-hidden="true"><span></span>' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (x) { return '<span class="wd">' + x + '</span>'; }).join('');
    for (var w = from; w <= to; w = addDays(w, 7)) {
      var lab = '';
      for (var k = 0; k < 7; k++) { var dd = addDays(w, k), pd = parse(dd); if (pd.getDate() === 1 || (w === from && k === 0)) { lab = MOIS[pd.getMonth()]; break; } }
      h += '<span class="mo">' + lab + '</span>';
      for (var k2 = 0; k2 < 7; k2++) {
        var day = addDays(w, k2), cls = ['sq'], tip = cap(wday(day)) + ' ' + fdate(day);
        if (day > e) { h += '<span class="sq off"></span>'; continue; }
        if (day < t) {
          cls.push('past'); var lg = mem.log[day];
          if (lg && Object.keys(lg).some(function (x) { return lg[x] > 0; })) { cls.push('act'); tip += ' : travail enregistré'; }
        } else if (day === e) { cls.push('exam'); tip += ' : examen'; }
        else if (day >= ps[2].from) cls.push('p3');
        else if (day >= ps[1].from) cls.push('p2');
        if (pdays[day]) { cls.push('prog'); tip += ' : ' + pdays[day]; }
        if (day === t) { cls.push('now'); tip += ' (aujourd’hui)'; }
        h += '<span class="' + cls.join(' ') + '" title="' + esc(tip) + '">' + parse(day).getDate() + '</span>';
      }
    }
    h += '</div><div class="callegend"><span><i class="k-now"></i>aujourd’hui</span>' + (pnames.length ? '<span><i class="k-prog"></i>' + esc(pnames.join(', ')) + '</span>' : '') +
      '<span><i class="k-p2"></i>2e passage dès le ' + fdate(ps[1].from).replace(/\.$/, '') + '</span><span><i class="k-p3"></i>consolidation dès le ' + fdate(ps[2].from).replace(/\.$/, '') + '</span><span><i class="k-exam"></i>examen</span></div></div>';
    return h;
  }


  /* ------------------------------------------------------------------ pages manuscrites d'origine */
  var scanFid = null, scanZoom = false;
  function scanSrc(dir, n) { return 'fichiers/scans/' + dir + '/p' + ('00' + n).slice(-3) + '.webp'; }
  function openScans(fid, keepScroll) {
    var f = F[fid], box = $('#scans'); if (!f || !f.scan) return;
    var dir = f.scan[0], pg = f.scan[1], same = scanFid === fid && !box.hidden;
    scanFid = fid;
    if (!same) {
      box.innerHTML = '<header><div class="ttl"><b>Manuscrit d’origine</b><span>« ' + esc(f.src) + ' », ' + (pg.length > 1 ? 'pages ' : 'page ') + esc(f.pages.replace(/-/g, '–')) + '</span></div>' +
        '<button class="sbtn" id="szoom" aria-pressed="' + scanZoom + '">' + (scanZoom ? 'Réduire' : 'Agrandir') + '</button><button class="sbtn" id="sclose">Fermer</button></header>' +
        (pg.length > 1 ? '<div class="jump"><span>Page</span>' + pg.map(function (n) { return '<button class="sbtn" data-p="' + n + '" style="padding:1px 8px">' + n + '</button>'; }).join('') + '</div>' : '') +
        '<div class="pages" tabindex="0">' + pg.map(function (n) {
          var rk = dir + '/' + n, rot = (mem.scanRot || {})[rk];
          return '<figure id="sp-' + n + '"' + (rot ? ' class="rot"' : '') + '><div class="im"><img src="' + scanSrc(dir, n) + '" loading="lazy" width="1100" height="1557" alt="Page ' + n + ' des notes manuscrites « ' + esc(f.src) + ' »"></div><figcaption><span>Page ' + n + '</span><span><button class="linkbtn srot" data-k="' + rk + '">Pivoter la page</button> <a href="' + scanSrc(dir, n) + '" target="_blank">Ouvrir l’image seule</a></span></figcaption></figure>';
        }).join('') + '</div>';
      box.classList.toggle('zoom', scanZoom);
      $('#sclose', box).addEventListener('click', function () { closeScans(); });
      $('#szoom', box).addEventListener('click', function () { scanZoom = !scanZoom; box.classList.toggle('zoom', scanZoom); this.setAttribute('aria-pressed', scanZoom); this.textContent = scanZoom ? 'Réduire' : 'Agrandir'; });
      $$('.srot', box).forEach(function (b) { b.addEventListener('click', function () { var fg = b.closest('figure'), on = fg.classList.toggle('rot'); mem.scanRot = mem.scanRot || {}; if (on) mem.scanRot[b.dataset.k] = 1; else delete mem.scanRot[b.dataset.k]; save(); }); });
      $$('.jump button', box).forEach(function (b) { b.addEventListener('click', function () { var fg = $('#sp-' + b.dataset.p, box); if (fg) $('.pages', box).scrollTop = fg.offsetTop - $('.pages', box).offsetTop - 8; }); });
      if (!keepScroll || box.hidden) $('.pages', box).scrollTop = 0;
    }
    box.hidden = false; app.classList.add('scans-open');
    var b = $('#bscan'); if (b) { b.setAttribute('aria-pressed', 'true'); b.classList.add('on'); }
    if (!keepScroll) $('#sclose', box).focus();
  }
  function closeScans(silent) {
    var box = $('#scans'); box.hidden = true; app.classList.remove('scans-open'); scanFid = null;
    var b = $('#bscan'); if (b) { b.setAttribute('aria-pressed', 'false'); b.classList.remove('on'); if (!silent) b.focus(); }
  }

  /* ------------------------------------------------------------------ page : fiche */
  function pageFiche(fid, anchor, params) {
    var f = F[fid]; if (!f) { main.innerHTML = '<div class="page"><p class="empty">Fiche introuvable.</p></div>'; return; }
    var t = THEMES[f.theme], c = CATS[f.cat], st = mem.fiches[fid] || {};
    var idx = TREE_ORDER.indexOf(fid), prev = TREE_ORDER[idx - 1], next = TREE_ORDER[idx + 1];
    var h = '<div class="page">';
    h += '<div class="crumbs"><a href="#/theme/' + t.id + '">' + esc(c.name) + (c.themes.length > 1 ? ' / ' + esc(t.short) : '') + '</a>' + (f.group ? ' / ' + esc(f.group) : '') + '</div>';
    h += '<div class="fiche-head"><div><h1 class="title">' + f.th + '</h1><div class="meta">' + (f.theme === 'rappels' ? 'Rappels de référence, absents de vos notes, relus pour l’examen ; les liens renvoient aux fiches où ils servent' : f.src === 'Synthèse transversale' ? 'Synthèse construite à partir de toutes vos fiches. Les mentions « réf. » sont des compléments absents de vos notes' : 'Notes manuscrites « ' + esc(f.src) + ' », pages ' + esc(f.pages.replace(/-/g, '–'))) + (f.sub ? '. ' + esc(f.sub) : '.') + (f.pdf ? ' <a class="pdfl" target="_blank" href="' + f.pdf + '">Fiche en PDF</a>' : '') + '</div></div>' +
      (f.scan ? '<button class="thumb" id="bthumb" title="Voir les pages manuscrites d’origine"><span class="stack"><img src="' + scanSrc(f.scan[0], f.scan[1][0]) + '" alt="" loading="lazy"></span><b>' + plural(f.scan[1].length, 'page') + ' du cahier</b></button>' : '') + '</div>';
    h += '<div class="toolbar row">';
    h += st.learned ? '<span class="status learned">Apprise le ' + fdate(st.learned) + '</span>' : '<button class="btn primary" id="blearn">J’ai appris cette fiche</button>';
    h += '<span class="tgroup"><button class="btn" id="bplan" aria-pressed="false">Mode plan</button>';
    if (f.html.indexOf('<table') >= 0) h += '<button class="btn" id="btabs" aria-pressed="false">Tableaux à trous</button>';
    h += '</span><span class="tgroup">';
    if (f.cards.length) h += '<a class="btn" href="#/revision?f=' + fid + '">Questions (' + f.cards.length + ')</a>';
    if ((QBYF[fid] || []).length) h += '<a class="btn" href="#/qcm?s=f:' + fid + '&n=tout&go=1">QCM (' + QBYF[fid].length + ')</a>';
    if ((OBYF[fid] || []).length) h += '<a class="btn" href="#/ouvertes?s=f:' + fid + '&n=tout&go=1">Ouvertes (' + OBYF[fid].length + ')</a>';
    (SBYF[fid] || []).slice(0, 1).forEach(function (sid) { h += '<a class="btn" href="#/sujet/' + sid + '">Sujet</a>'; });
    h += '</span><span class="tgroup"><details class="ecoute"><summary class="btn">Écouter</summary><div class="pop"><button data-m="all">Toute la fiche</button><button data-m="cle">« À retenir » seulement</button><button data-m="qr">Questions et réponses</button></div></details>';
    if (f.scan) h += '<button class="btn" id="bscan" aria-pressed="false" aria-controls="scans">Manuscrit</button>';
    h += '</span>';
    var rr = rereadsDue().filter(function (r) { return r.f === fid; })[0];
    if (rr) h += '<button class="btn" id="breread">Relecture J+' + rr.step + ' faite</button>';
    h += '</div><p class="status planhint" id="planhint" hidden>Récitez chaque partie de tête, puis cliquez sur son titre pour vérifier.</p>';
    h += '<article class="fiche" id="art">' + f.html + '</article>';
    h += '<div class="notes"><label for="notes"><b>Mes notes</b> <span class="muted small">(corrections après vérification, moyens mnémotechniques…)</span></label><textarea id="notes">' + esc(st.notes || '') + '</textarea><div class="row"><button class="btn" id="ndict">Dicter une note</button><span class="status" id="ndst"></span></div></div>';
    h += '<div class="pager">' + (prev ? '<a href="' + link(prev) + '">Précédente : ' + F[prev].th + '</a>' : '<span></span>') + (next ? '<a href="' + link(next) + '" style="text-align:right">Suivante : ' + F[next].th + '</a>' : '') + '</div>';
    h += '</div>';
    main.innerHTML = h;
    var art = $('#art');
    $$('table', art).forEach(function (tb) { var w = document.createElement('div'); w.className = 'tablewrap'; tb.parentNode.insertBefore(w, tb); w.appendChild(tb); });
    $$('table.qr tr', art).forEach(function (tr) { var td = tr.children[1]; if (td) { td.classList.add('ans', 'hidden'); td.addEventListener('click', function () { td.classList.toggle('hidden'); }); } });
    var hint = $('.autotest .hint', art); if (hint) hint.innerHTML = 'Cliquez sur une réponse pour l’afficher. <button class="linkbtn" id="ballans">Tout afficher</button>';
    var ba = $('#ballans'); if (ba) ba.addEventListener('click', function () { $$('td.ans', art).forEach(function (td) { td.classList.remove('hidden'); }); });
    // mode plan
    $('#bplan').addEventListener('click', function () {
      var on = art.classList.toggle('planmode'); this.setAttribute('aria-pressed', on); this.classList.toggle('on', on);
      $$('.reveal', art).forEach(function (e) { e.classList.remove('reveal'); }); $$('.opened', art).forEach(function (e) { e.classList.remove('opened'); });
      $('#planhint').hidden = !on;
      if (on) window.scrollTo(0, art.offsetTop - 80);
    });
    art.addEventListener('click', function (e) {
      var hd = e.target.closest('h2,h3,h4'); if (!hd || !art.classList.contains('planmode')) return;
      var lvl = +hd.tagName[1], n = hd.nextElementSibling; hd.classList.add('opened');
      while (n && !(/^H[2-4]$/.test(n.tagName) && +n.tagName[1] <= lvl)) { n.classList.add('reveal'); n = n.nextElementSibling; }
    });
    var bt = $('#btabs');
    if (bt) bt.addEventListener('click', function () {
      var on = art.classList.toggle('tabmode'); this.setAttribute('aria-pressed', on); this.classList.toggle('on', on);
      $$('table:not(.qr) td', art).forEach(function (td) { var first = !td.previousElementSibling; if (on && !first) td.classList.add('cellhide'); else td.classList.remove('cellhide'); });
    });
    art.addEventListener('click', function (e) { var td = e.target.closest('td.cellhide'); if (td) td.classList.remove('cellhide'); });
    [$('#bscan'), $('#bthumb')].forEach(function (b) { if (b) b.addEventListener('click', function () { if (scanFid === fid && !$('#scans').hidden) closeScans(); else openScans(fid); }); });
    if (f.scan && scanFid && !$('#scans').hidden) openScans(fid, true); else if (scanFid) closeScans(true);
    $$('.ecoute .pop button').forEach(function (b) { b.addEventListener('click', function () { b.closest('details').open = false; ficheAudio(fid, b.dataset.m, art); }); });
    art.addEventListener('click', function (e) { if (!tts) return; var el = e.target.closest('h2, h3, h4, p, li, tr'); if (!el) return; for (var i = 0; i < tts.blocks.length; i++) if (tts.blocks[i].el === el) { ttsJump(i); return; } });
    var bl = $('#blearn'); if (bl) bl.addEventListener('click', function () { learnFiche(fid); route(); });
    var br = $('#breread'); if (br) br.addEventListener('click', function () { var s = mem.fiches[fid]; s.rereads = (s.rereads || []).concat([today()]); logToday('reread'); save(); route(); });
    var nt = $('#notes'), timer = null; attachDictation(nt, $('#ndict'), $('#ndst'));
    nt.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { mem.fiches[fid] = Object.assign(mem.fiches[fid] || {}, { notes: nt.value }); save(); }, 400); });
    var ptarget = params && (params.hl || params.sec) ? progFicheExtras(fid, params, art) : null;
    if (anchor) { var a = document.getElementById(anchor); if (a) { a.scrollIntoView({ block: 'center' }); a.classList.add('flash'); } }
    else if (ptarget) ptarget.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ page : thème */
  function pageTheme(tid) {
    var t = THEMES[tid]; if (!t) return pageToday();
    var h = '<div class="page"><div class="crumbs">' + esc(CATS[t.cat].name) + '</div><h1 class="title">' + esc(t.name) + '</h1><p class="lede">' + plural(t.all.length, 'fiche') + ', ' + plural(qcmPool('t:' + tid).length, 'QCM') + '</p>';
    h += '<div class="row">' + (qcmPool('t:' + tid).length ? '<a class="btn primary" href="#/qcm?s=t:' + tid + '&n=20&go=1">20 QCM sur ce thème</a>' : '') + '<a class="btn" href="#/chiffres?portee=' + tid + '">Chiffres du thème</a>' + (D.pdf && D.pdf.themes && D.pdf.themes[tid] ? '<a class="btn" target="_blank" href="' + D.pdf.themes[tid] + '">PDF du thème</a>' : '') + '<a class="btn" href="#/carte/' + tid + '">Carte mentale</a>' + (casFor(t.all).length ? '<a class="btn" href="#/cas?t=' + tid + '">Cas cliniques (' + casFor(t.all).length + ')</a>' : '') + (ouvPool('t:' + tid).length ? '<a class="btn" href="#/ouvertes?s=t:' + tid + '&n=10&go=1">Questions ouvertes (' + ouvPool('t:' + tid).length + ')</a>' : '') + '</div>';
    t.groups.forEach(function (g) {
      if (g.name) h += '<h2 class="sec">' + esc(g.name) + '</h2>';
      h += '<div class="list">' + g.fiches.map(function (fid) {
        var st = mem.fiches[fid] || {}, col = dotColor(fid);
        return '<div class="it"><span class="dot"' + (col ? ' style="background:' + col + '"' : '') + '></span><div><a class="ttl" href="' + link(fid) + '">' + F[fid].th + '</a><div class="small muted">' + (st.learned ? 'Apprise le ' + fdate(st.learned) : 'Pas encore apprise') + ', ' + plural(F[fid].cards.length, 'question') + ', environ ' + fpages(fid) + ' p.</div></div></div>';
      }).join('') + '</div>';
    });
    main.innerHTML = h + '</div>'; window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ page : révision */
  var session = null;
  function pageRevision(params) {
    var fid = params.f;
    if (params.p) { var pa = parseP('p:' + params.p); if (pa.p && (!session || session.key !== 'p:' + params.p)) session = { key: 'p:' + params.p, list: shuffle(progCards(pa.p, pa.d)), i: 0, shown: false, done: 0, again: [] }; if (pa.p) return renderCard(); }
    if (!session || session.key !== (fid || 'due')) {
      var list = fid ? F[fid].cards.slice() : dueCards();
      session = { key: fid || 'due', list: fid ? shuffle(list) : list, i: 0, shown: false, done: 0, again: [] };
    }
    renderCard();
  }
  function renderCard() {
    var s = session, h = '<div class="page">';
    var title = s.key === 'due' ? 'Réviser les questions' : 'M’interroger : ' + (s.key.indexOf('p:') === 0 ? esc(scopeLabel(s.key)) : F[s.key].th);
    h += '<h1 class="title">' + title + '</h1>';
    if (s.i >= s.list.length) {
      var nextDue = Object.keys(mem.cards).map(function (c) { return mem.cards[c].due; }).filter(function (d) { return d > today(); }).sort()[0];
      h += '<div class="card"><div class="q">' + (s.done ? 'Session terminée : ' + plural(s.done, 'question revue', 'questions revues') + '.' : (s.key === 'due' ? 'Aucune question à réviser aujourd’hui.' : 'Cette fiche n’a pas de questions.')) + '</div>';
      h += '<p class="muted">' + (nextDue ? 'Prochaines questions le ' + fdate(nextDue) + '.' : 'Marquez des fiches comme apprises pour alimenter la révision.') + '</p>';
      h += '<div class="actions row"><a class="btn primary" href="#/">Retour à aujourd’hui</a>' + (s.key.indexOf('p:') === 0 ? '<a class="btn" href="#/programme/' + s.key.slice(2).split(':')[0] + '">Revenir au programme</a>' : s.key !== 'due' ? '<a class="btn" href="' + link(s.key) + '">Revenir à la fiche</a>' : '') + '</div></div></div>';
      main.innerHTML = h; session = null; renderSide(parseRoute()); return;
    }
    var cid = s.list[s.i], c = CARD[cid], f = F[c.f];
    h += '<div class="muted small">' + (s.i + 1) + ' sur ' + s.list.length + '</div><div class="progress"><span style="width:' + Math.round(100 * s.i / s.list.length) + '%"></span></div>';
    h += '<div class="card"><div class="src"><a href="' + link(c.f) + '">' + f.th + '</a></div><div class="q">' + c.q + '</div>';
    if (s.shown) {
      h += '<div class="a">' + c.a + '</div><div class="actions"><div class="muted small" style="margin-bottom:8px">Comment ça s’est passé ?</div><div class="row grade">' +
        [[1, 'Raté'], [2, 'Difficile'], [3, 'Bien'], [4, 'Facile']].map(function (g) {
          return '<button class="btn g' + g[0] + '" data-g="' + g[0] + '">' + g[1] + ' <small>' + ivLabel(schedule(cid, g[0], true)) + ', touche ' + g[0] + '</small></button>';
        }).join('') + '</div></div>';
    } else h += '<div class="actions"><button class="btn primary" id="bshow">Afficher la réponse <kbd>Espace</kbd></button></div>';
    h += '</div></div>';
    main.innerHTML = h;
    var bs = $('#bshow'); if (bs) { bs.addEventListener('click', show); bs.focus(); }
    $$('[data-g]').forEach(function (b) { b.addEventListener('click', function () { grade(+b.dataset.g); }); });
  }
  function show() { if (session && !session.shown) { session.shown = true; renderCard(); } }
  function grade(g) {
    var s = session; if (!s || !s.shown) return;
    var cid = s.list[s.i]; schedule(cid, g);
    if (g === 1) s.list.push(cid); // revient en fin de session
    s.i++; s.done++; s.shown = false; logToday('cards'); save(); renderCard();
  }

  /* ------------------------------------------------------------------ page : chiffres */
  var drill = null;
  function pageChiffres(params) {
    var scope = params.portee || (Object.keys(mem.fiches).some(function (f) { return mem.fiches[f].learned; }) ? 'apprises' : 'tout'), mode = params.mode === 'qcm' ? 'qcm' : 'libre';
    var learnedSet = {}; Object.keys(mem.fiches).forEach(function (f) { if (mem.fiches[f].learned) learnedSet[f] = 1; });
    var pp = scope.indexOf('p:') === 0 ? parseP(scope) : null;
    var pool = pp ? (pp.p ? progClozes(pp.p, pp.d) : []) : D.clozes.filter(function (z) {
      if (scope === 'erreurs') { var k = mem.clozes[z.id]; return k && k.miss > (k.ok || 0); }
      return scope === 'tout' || (scope === 'apprises' ? learnedSet[z.f] : F[z.f].theme === scope);
    });
    if (!drill || drill.scope !== scope || drill.mode !== mode) {
      var missed = pool.filter(function (z) { var k = mem.clozes[z.id]; return k && k.miss > (k.ok || 0); });
      var unseen = shuffle(pool.filter(function (z) { return !mem.clozes[z.id]; }));
      var rest = shuffle(pool.filter(function (z) { var k = mem.clozes[z.id]; return k && k.miss <= (k.ok || 0); }));
      var list = (scope === 'erreurs' ? shuffle(missed) : shuffle(missed).slice(0, 8).concat(unseen, rest));
      if (mode === 'qcm') list = list.filter(function (z) { return (z._ch = numChoices(z)); });
      drill = { scope: scope, mode: mode, list: list.slice(0, 20), i: 0, shown: false, ok: 0, pick: null };
    }
    var q = function (o) { return '#/chiffres?portee=' + (o.portee || scope) + '&mode=' + (o.mode || mode); };
    var h = '<div class="page"><h1 class="title">S’entraîner sur les chiffres</h1><p class="lede">Phrases tirées de vos fiches, la valeur surlignée est masquée. ' + (mode === 'qcm' ? 'Choisissez la bonne valeur parmi quatre.' : 'Retrouvez‑la de tête, puis vérifiez.') + '</p>';
    h += '<div class="tabs"><a class="btn' + (mode === 'libre' ? ' on' : '') + '" href="' + q({ mode: 'libre' }) + '">Réponse libre</a><a class="btn' + (mode === 'qcm' ? ' on' : '') + '" href="' + q({ mode: 'qcm' }) + '">QCM</a><span class="sep"></span>' +
      '<a class="btn' + (scope === 'apprises' ? ' on' : '') + '" href="' + q({ portee: 'apprises' }) + '">Fiches apprises</a><a class="btn' + (scope === 'tout' ? ' on' : '') + '" href="' + q({ portee: 'tout' }) + '">Toutes</a><a class="btn' + (scope === 'erreurs' ? ' on' : '') + '" href="' + q({ portee: 'erreurs' }) + '">Mes erreurs</a>' +
      '<select class="btn" id="sth" aria-label="Choisir un thème"><option value="">Un thème…</option>' + Object.keys(THEMES).map(function (k) { return '<option value="' + k + '"' + (scope === k ? ' selected' : '') + '>' + esc(THEMES[k].short) + '</option>'; }).join('') + '</select></div>';
    if (!drill.list.length) { h += '<div class="empty">' + (scope === 'apprises' ? 'Aucune fiche apprise pour l’instant. Choisissez « Toutes » ou un thème.' : scope === 'erreurs' ? 'Aucun chiffre raté pour l’instant.' : 'Rien à proposer ici.') + '</div></div>'; main.innerHTML = h; bindTh(mode); return; }
    var d = drill;
    if (d.i >= d.list.length) {
      h += '<div class="card"><div class="q">Série terminée : ' + d.ok + ' sur ' + d.list.length + ' trouvés.</div><div class="actions row"><button class="btn primary" id="bagain">Nouvelle série</button><a class="btn" href="#/">Retour à aujourd’hui</a></div></div></div>';
      main.innerHTML = h; bindTh(mode); $('#bagain').addEventListener('click', function () { drill = null; pageChiffres(params); }); return;
    }
    var z = d.list[d.i];
    h += '<div class="muted small">' + (d.i + 1) + ' sur ' + d.list.length + '</div><div class="progress"><span style="width:' + Math.round(100 * d.i / d.list.length) + '%"></span></div>';
    h += '<div class="card cloze"><div class="src"><a href="' + link(z.f) + '">' + F[z.f].th + '</a>' + (z.h ? ', ' + esc(z.h) : '') + '</div><div class="text">' + esc(z.b) + ' <span class="blank">' + (d.shown ? esc(z.v) : '?') + '</span> ' + esc(z.a) + '</div>';
    if (mode === 'qcm') {
      h += '<ol class="opts">' + z._ch.map(function (v, i) { var cls = ''; if (d.shown) cls = v === z.v ? ' ok' : (d.pick === i ? ' ko' : ''); return '<li><button class="opt' + cls + '" data-c="' + i + '"' + (d.shown ? ' disabled' : '') + '><span class="let">' + LET[i] + '</span><span>' + esc(v) + '</span></button></li>'; }).join('') + '</ol>';
      if (d.shown) h += '<div class="actions"><button class="btn primary" id="bnextz">Suivante <kbd>Entrée</kbd></button></div>';
    } else h += d.shown ? '<div class="actions row"><button class="btn" data-z="0">À revoir <kbd>1</kbd></button><button class="btn primary" data-z="1">Je savais <kbd>2</kbd></button></div>'
      : '<div class="actions"><button class="btn primary" id="bshowz">Afficher la valeur <kbd>Espace</kbd></button></div>';
    h += '</div></div>';
    main.innerHTML = h; bindTh(mode);
    var b = $('#bshowz'); if (b) { b.focus(); b.addEventListener('click', function () { d.shown = true; pageChiffres(params); }); }
    $$('[data-z]').forEach(function (x) { x.addEventListener('click', function () { zgrade(+x.dataset.z, params); }); });
    $$('[data-c]').forEach(function (x) { x.addEventListener('click', function () { zpick(+x.dataset.c, params); }); });
    var nz = $('#bnextz'); if (nz) { nz.focus(); nz.addEventListener('click', function () { d.i++; d.shown = false; d.pick = null; pageChiffres(params); }); }
  }
  function zpick(i, params) {
    var d = drill, z = d.list[d.i]; if (d.shown) return;
    var ok = z._ch[i] === z.v, k = mem.clozes[z.id] || { ok: 0, miss: 0 };
    if (ok) { k.ok++; d.ok++; } else k.miss++;
    mem.clozes[z.id] = k; d.pick = i; d.shown = true; logToday('clozes'); save(); pageChiffres(params);
  }
  function zgrade(ok, params) {
    var d = drill, z = d.list[d.i], k = mem.clozes[z.id] || { ok: 0, miss: 0 };
    if (ok) { k.ok++; d.ok++; } else k.miss++;
    mem.clozes[z.id] = k; d.i++; d.shown = false; logToday('clozes'); save(); pageChiffres(params);
  }
  function bindTh(mode) { var s = $('#sth'); if (s) s.addEventListener('change', function () { if (s.value) location.hash = '#/chiffres?portee=' + s.value + '&mode=' + (mode || 'libre'); }); }

  /* ------------------------------------------------------------------ page : recherche */
  function pageSearch(q) {
    var h = '<div class="page"><h1 class="title">Recherche</h1>';
    q = (q || '').trim();
    if (q.length < 2) { main.innerHTML = h + '<p class="lede">Tapez au moins deux caractères dans le champ de recherche.</p></div>'; return; }
    var terms = normalize(q).split(/\s+/).filter(Boolean), res = [];
    Object.keys(F).forEach(function (fid) {
      var n = NORM[fid] || (NORM[fid] = normalize(F[fid].title + ' ' + F[fid].text)), score = 0;
      for (var i = 0; i < terms.length; i++) { var c = n.split(terms[i]).length - 1; if (!c) return; score += c; }
      if (normalize(F[fid].title).indexOf(terms[0]) >= 0) score += 50;
      res.push({ f: fid, s: score });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    h += '<p class="lede">' + plural(res.length, 'fiche trouvée', 'fiches trouvées') + ' pour « ' + esc(q) + ' ».</p><div class="list">';
    res.slice(0, 60).forEach(function (r) {
      var txt = F[r.f].text, n = NORM[r.f].slice(F[r.f].title.length + 1), p = n.indexOf(terms[0]);
      var a = Math.max(0, p - 90), snip = (a ? '…' : '') + esc(txt.slice(a, p + 160)) + '…';
      terms.forEach(function (t) { snip = snip.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); });
      h += '<div class="it"><span class="dot" style="' + (dotColor(r.f) ? 'background:' + dotColor(r.f) : '') + '"></span><div><a class="ttl" href="' + link(r.f) + '">' + F[r.f].th + '</a><div class="ctx">' + snip + '</div></div></div>';
    });
    main.innerHTML = h + '</div></div>';
  }

  /* ------------------------------------------------------------------ page : à vérifier */
  function pageVerif(params) {
    var tab = params.onglet === 'deduites' ? 'devs' : 'chks', items = D[tab], hide = params.masquer === '1';
    var open = items.filter(function (x) { return !(mem[tab][x.id] || {}).done; }).length;
    var h = '<div class="page"><h1 class="title">À vérifier</h1>';
    h += '<p class="lede">' + (tab === 'chks' ? 'Endroits où vos notes s’écartent des valeurs usuelles. Tranchez avec un ouvrage de référence, puis cochez.' : 'Passages peu lisibles dont la lecture a été déduite du contexte (soulignés en pointillés dans les fiches). Comparez avec vos résumés originaux.') + '</p>';
    h += '<div class="tabs"><a class="btn' + (tab === 'chks' ? ' on' : '') + '" href="#/a-verifier">Valeurs à vérifier (' + D.chks.length + ')</a><a class="btn' + (tab === 'devs' ? ' on' : '') + '" href="#/a-verifier?onglet=deduites">Lectures déduites (' + D.devs.length + ')</a>' +
      '<a class="btn' + (hide ? ' on' : '') + '" href="#/a-verifier?' + (tab === 'devs' ? 'onglet=deduites&' : '') + 'masquer=' + (hide ? '0' : '1') + '">' + (hide ? 'Afficher les éléments traités' : 'Masquer les éléments traités') + '</a></div>';
    h += '<p class="small muted">' + open + ' restant' + (open > 1 ? 's' : '') + ' sur ' + items.length + '.</p>';
    if (!items.length) h += '<div class="empty">Rien dans cette liste.</div>';
    var lastTheme = null;
    h += '<div class="list">';
    items.forEach(function (x) {
      var st = mem[tab][x.id] || {}; if (hide && st.done) return;
      var f = F[x.f];
      if (f.theme !== lastTheme) { lastTheme = f.theme; h += '<div class="it" style="background:var(--sunk)"><span></span><b>' + esc(THEMES[f.theme].name) + '</b></div>'; }
      h += '<div class="it' + (st.done ? ' done' : '') + '"><input type="checkbox" data-id="' + x.id + '"' + (st.done ? ' checked' : '') + ' aria-label="Marquer comme vérifié"><div><a class="ttl" href="#/fiche/' + x.f + '?ancre=' + x.id + '">' + f.th + '</a>' +
        '<div class="ctx">' + (tab === 'chks' ? esc(x.ctx.replace(x.txt, '')) + ' <span class="chk">' + esc(x.txt) + '</span>' : esc(x.ctx).replace(esc(x.txt), '<span class="dev">' + esc(x.txt) + '</span>')) + '</div>' +
        '<input type="text" data-note="' + x.id + '" placeholder="Ma conclusion (valeur retenue, source…)" value="' + esc(st.note || '') + '"></div></div>';
    });
    main.innerHTML = h + '</div></div>';
    $$('input[type=checkbox][data-id]').forEach(function (cb) { cb.addEventListener('change', function () { var k = mem[tab][cb.dataset.id] = mem[tab][cb.dataset.id] || {}; k.done = cb.checked; save(); cb.closest('.it').classList.toggle('done', cb.checked); renderSide(parseRoute()); }); });
    $$('input[data-note]').forEach(function (it) { it.addEventListener('change', function () { var k = mem[tab][it.dataset.note] = mem[tab][it.dataset.note] || {}; k.note = it.value; save(); }); });
  }

  /* ------------------------------------------------------------------ page : planning */
  function pagePlanning() {
    var ps = phases(), cur = currentPhase(), nl = nextToLearn();
    var h = '<div class="page wide"><h1 class="title">Planning</h1><p class="lede">Calculé à partir de la date d’examen. Modifiez‑la si besoin, tout se recalcule.</p>';
    h += '<div class="field"><label for="exam"><b>Date de l’examen</b></label><input type="date" id="exam" value="' + mem.exam + '"></div>';
    h += '<div class="phases">' + ps.map(function (p) { return '<div' + (p.n === cur.n ? ' class="now"' : '') + '><h3>Phase ' + p.n + ' : ' + p.name + '</h3><div class="small muted">du ' + fdate(p.from) + ' au ' + fdate(p.to) + '</div><p class="small">' + esc(p.what) + '</p></div>'; }).join('') + '</div>';
    h += '<p>Reste à apprendre : <b class="num">' + nl.remaining.length + '</b> fiches, environ <b class="num">' + nl.pagesLeft + '</b> pages. Rythme conseillé : <b class="num">' + nl.target + '</b> pages par jour.</p>';
    h += progPlanningHtml();
    h += '<h2 class="sec">Ordre d’étude conseillé</h2><p class="small muted">Gros thèmes cliniques d’abord ; les fiches « Compléments » sont rattachées à leur thème.</p>';
    var seen = {}, rows = [];
    ORDER.forEach(function (fid) { var t = F[fid].theme === 'add' ? null : F[fid].theme; if (t && !seen[t]) { seen[t] = 1; rows.push(t); } });
    h += '<table class="plain"><thead><tr><th>Thème</th><th class="n">Fiches</th><th class="n">Pages</th><th>Progression</th></tr></thead><tbody>';
    rows.forEach(function (tid) {
      var t = THEMES[tid], fs = t.all, l = fs.filter(function (f) { return (mem.fiches[f] || {}).learned; }).length, pg = fs.reduce(function (s, f) { return s + fpages(f); }, 0);
      h += '<tr><td><a href="#/theme/' + tid + '">' + esc(t.name) + '</a></td><td class="n">' + l + ' / ' + fs.length + '</td><td class="n">' + pg + '</td><td><div class="bar"><span style="width:' + Math.round(100 * l / fs.length) + '%"></span></div></td></tr>';
    });
    var ad = THEMES.add; var la = ad.all.filter(function (f) { return (mem.fiches[f] || {}).learned; }).length;
    h += '<tr><td><a href="#/theme/add">' + esc(ad.name) + '</a> <span class="small muted">(réparties dans les thèmes)</span></td><td class="n">' + la + ' / ' + ad.all.length + '</td><td class="n">' + ad.all.reduce(function (s, f) { return s + fpages(f); }, 0) + '</td><td><div class="bar"><span style="width:' + Math.round(100 * la / ad.all.length) + '%"></span></div></td></tr>';
    h += '</tbody></table>';
    // activité récente
    var days = Object.keys(mem.log).sort().slice(-14);
    if (days.length) {
      h += '<h2 class="sec">Activité des derniers jours</h2><table class="plain"><thead><tr><th>Jour</th><th class="n">Fiches apprises</th><th class="n">Questions</th><th class="n">Chiffres</th><th class="n">Relectures</th></tr></thead><tbody>';
      days.reverse().forEach(function (d) { var l = mem.log[d]; h += '<tr><td>' + fdate(d) + '</td><td class="n">' + (l.learned || 0) + '</td><td class="n">' + (l.cards || 0) + '</td><td class="n">' + (l.clozes || 0) + '</td><td class="n">' + (l.reread || 0) + '</td></tr>'; });
      h += '</tbody></table>';
    }
    main.innerHTML = h + '</div>';
    $('#exam').addEventListener('change', function () { if (this.value) { mem.exam = this.value; mem.examSet = true; save(); route(); } });
    bindProgPlanning();
  }

  /* ------------------------------------------------------------------ page : réglages et sauvegarde */
  function pageData(params) {
    var h = '<div class="page"><h1 class="title">Réglages et sauvegarde</h1>';
    h += '<p class="lede">' + (me ? 'Profil de <b>' + esc(me.nom) + '</b>. ' : '') + 'Votre progression est enregistrée dans ce navigateur, sur cet appareil. Exportez‑la régulièrement : un nettoyage du navigateur l’effacerait.</p>';
    h += '<h2 class="sec">Sauvegarde et transfert</h2><p class="small muted">Le fichier contient votre profil et toute votre progression. Sur un autre appareil, ouvrez le site puis « Importer un profil » sur l’écran de connexion : vous vous connecterez avec le même mot de passe. Si le profil existe déjà là-bas, la version la plus récente est gardée.</p>';
    h += '<div class="row"><button class="btn primary" id="bexp">' + (me ? 'Transférer mon profil (fichier)' : 'Exporter ma progression') + '</button><label class="btn" for="fimp">Importer une sauvegarde dans ce profil</label><input type="file" id="fimp" accept=".json,application/json" hidden></div><p class="small muted" id="msg"></p>';
    if (me) h += '<h2 class="sec">Mon profil</h2><form class="row" id="fpwd" style="align-items:flex-end"><label class="field" style="margin:0"><b>Mot de passe actuel</b><input class="field-in" type="password" id="pw0" autocomplete="current-password" required></label><label class="field" style="margin:0"><b>Nouveau mot de passe</b><input class="field-in" type="password" id="pw1" autocomplete="new-password" minlength="4" required></label><button class="btn" type="submit">Changer le mot de passe</button></form><p class="small muted" id="pmsg"></p>' +
      '<div class="row"><button class="btn" id="blogout">Se déconnecter</button><button class="btn" id="bdelp">Supprimer ce profil de cet appareil</button></div>';
    h += '<h2 class="sec" id="appli">Appli et hors ligne</h2><div id="offline"></div>';
    h += '<h2 class="sec">Affichage</h2><div class="row">' + [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (o) { return '<button class="btn' + (mem.theme === o[0] ? ' on' : '') + '" data-th="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
    h += '<h2 class="sec">Repartir de zéro</h2><p class="small muted">Efface toute la progression ' + (me ? 'de ce profil' : 'de ce navigateur') + ' (fiches apprises, révisions, notes).</p><button class="btn" id="breset">Tout effacer</button>';
    h += '<h2 class="sec">À propos des fiches</h2><p class="small">' + ORDER.length + ' fiches, ' + D.cards.length + ' questions, ' + D.clozes.length + ' phrases à trous sur les chiffres, ' + D.chks.length + ' valeurs à vérifier, ' + D.devs.length + ' lectures déduites. Contenu retranscrit de vos résumés manuscrits.</p>';
    main.innerHTML = h + '</div>';
    $('#bexp').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(me ? profilFile() : mem)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (me ? 'profil-' + normalize(me.nom).replace(/[^a-z0-9]+/g, '-') : 'progression') + '-revision-dems-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
      $('#msg').textContent = me ? 'Fichier du profil téléchargé. Sur l’autre appareil : écran de connexion, « Importer un profil ».' : 'Fichier de sauvegarde téléchargé.';
    });
    $('#fimp').addEventListener('change', function () {
      var file = this.files[0]; if (!file) return; var r = new FileReader();
      r.onload = function () { try { var o = JSON.parse(r.result); if (o && o.type === 'revision-dems-profil') o = o.mem; if (!o || o.v !== 1) throw 0; mem = normMem(o); save(); setTheme(); $('#msg').textContent = 'Sauvegarde importée.'; route(); } catch (e) { $('#msg').textContent = 'Ce fichier n’est pas une sauvegarde valide de Révision DEMS.'; } };
      r.readAsText(file);
    });
    $$('[data-th]').forEach(function (b) { b.addEventListener('click', function () { mem.theme = b.dataset.th; save(); setTheme(); route(); }); });
    renderOffline();
    if (params && params.appli) { var ap = $('#appli'); if (ap) ap.scrollIntoView(); }
    if (me) {
      $('#fpwd').addEventListener('submit', function (e) {
        e.preventDefault(); var pm = $('#pmsg'), n1 = $('#pw1').value;
        hashPwd(me.salt, $('#pw0').value).then(function (hh) {
          if (hh !== me.hash) { pm.textContent = 'Le mot de passe actuel est incorrect.'; return; }
          if (n1.length < 4) { pm.textContent = 'Le nouveau mot de passe doit faire 4 caractères au moins.'; return; }
          me.salt = rndHex(12); hashPwd(me.salt, n1).then(function (h2) { me.hash = h2; saveProfils(); pm.textContent = 'Mot de passe changé.'; $('#fpwd').reset(); });
        });
      });
      $('#blogout').addEventListener('click', logout);
      var armedP = false;
      $('#bdelp').addEventListener('click', function () {
        if (!armedP) { armedP = true; this.textContent = 'Confirmer : supprimer « ' + me.nom + ' » et sa progression'; this.classList.add('primary'); return; }
        lsDel(memKey()); profils.list = profils.list.filter(function (x) { return x.id !== me.id; }); profils.current = null; saveProfils(); mem = null; location.hash = '#/'; location.reload();
      });
    }
    var armed = false;
    $('#breset').addEventListener('click', function () {
      if (!armed) { armed = true; this.textContent = 'Confirmer : tout effacer'; this.classList.add('primary'); return; }
      var exam = mem.exam; mem = blank(); mem.exam = exam; save(); route();
    });
  }

  /* ================================================================== OUTILS D'ENTRAÎNEMENT */
  var QCM = {}, QBYF = {}, SUJ = {}, SBYF = {};
  (D.qcm || []).forEach(function (q) { QCM[q.id] = q; (QBYF[q.f] = QBYF[q.f] || []).push(q.id); });
  (D.sujets || []).forEach(function (s) { SUJ[s.id] = s; (SBYF[s.f] = SBYF[s.f] || []).push(s.id); });
  var LET = ['A', 'B', 'C', 'D', 'E', 'F'];

  function learnedFiches() { return ORDER.filter(function (f) { return (mem.fiches[f] || {}).learned; }); }
  function scopeLabel(s) {
    if (!s || s === 'apprises') return 'fiches apprises';
    if (s === 'tout') return 'toutes les fiches';
    if (s === 'erreurs') return 'mes erreurs';
    if (s.indexOf('t:') === 0) return THEMES[s.slice(2)] ? THEMES[s.slice(2)].name : s;
    if (s.indexOf('c:') === 0) return CATS[s.slice(2)] ? CATS[s.slice(2)].name : s;
    if (s.indexOf('f:') === 0) return F[s.slice(2)] ? F[s.slice(2)].title : s;
    if (s.indexOf('p:') === 0) { var pp = parseP(s); return pp.p ? (pp.p.court || pp.p.titre) + (pp.d !== null ? ', ' + progDayName(pp.p, pp.d).toLowerCase() : '') : s; }
    return s;
  }
  function scopeFiches(s) {
    if (!s || s === 'apprises') return learnedFiches();
    if (s === 'tout' || s === 'erreurs') return ORDER.slice();
    if (s.indexOf('t:') === 0) return (THEMES[s.slice(2)] || { all: [] }).all;
    if (s.indexOf('c:') === 0) { var c = CATS[s.slice(2)]; return c ? [].concat.apply([], c.themes.map(function (t) { return t.all; })) : []; }
    if (s.indexOf('f:') === 0) return [s.slice(2)];
    if (s.indexOf('p:') === 0) { var pp = parseP(s); return pp.p ? progFiches(pp.p, pp.d) : []; }
    return [];
  }
  function qcmPool(s, niveau) {
    var out = [];
    if (s === 'erreurs') out = Object.keys(mem.qcm).filter(function (id) { return QCM[id] && mem.qcm[id].lastOk === false; });
    else if (s && s.indexOf('p:') === 0) { var pp = parseP(s); out = pp.p ? progQcm(pp.p, pp.d) : []; }
    else scopeFiches(s).forEach(function (f) { out = out.concat(QBYF[f] || []); });
    if (niveau && niveau !== 'tous') out = out.filter(function (id) { return String(QCM[id].niveau) === String(niveau); });
    return out;
  }
  function scoreQ(q, sel) {
    var a = sel.slice().sort(), b = q.bonnes.slice().sort();
    if (a.length === b.length && a.every(function (x, i) { return x === b[i]; })) return 1;
    if (q.type !== 'multiple') return 0;
    var disc = 0; for (var i = 0; i < q.choix.length; i++) if ((sel.indexOf(i) >= 0) !== (q.bonnes.indexOf(i) >= 0)) disc++;
    return disc === 1 ? .5 : 0;
  }
  function recordQ(id, sc) {
    var k = mem.qcm[id] || { n: 0, ok: 0 };
    k.n++; if (sc === 1) k.ok++; k.last = today(); k.lastOk = sc === 1; mem.qcm[id] = k; logToday('qcm');
  }
  function themeOptions(sel, withCats) {
    var h = '';
    D.cats.forEach(function (c) {
      h += '<optgroup label="' + esc(c.name) + '">';
      if (withCats && c.themes.length > 1) h += '<option value="c:' + c.id + '"' + (sel === 'c:' + c.id ? ' selected' : '') + '>Toute la catégorie</option>';
      c.themes.forEach(function (t) { h += '<option value="t:' + t.id + '"' + (sel === 't:' + t.id ? ' selected' : '') + '>' + esc(t.short) + '</option>'; });
      h += '</optgroup>';
    });
    return h;
  }
  function scopeSelect(id, sel) {
    return '<select class="field-in" id="' + id + '">' +
      '<option value="apprises"' + (sel === 'apprises' ? ' selected' : '') + '>Fiches apprises</option>' +
      '<option value="tout"' + (sel === 'tout' ? ' selected' : '') + '>Toutes les fiches</option>' +
      '<option value="erreurs"' + (sel === 'erreurs' ? ' selected' : '') + '>Mes erreurs</option>' + progOptions(sel) + themeOptions(sel, true) + '</select>';
  }
  function progOptions(sel) {
    var ps = progs(); if (!ps.length) return '';
    return '<optgroup label="Programmes">' + ps.map(function (p) { var v = 'p:' + p.id; return '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + esc(p.court || p.titre) + ' (tout)</option>' + p.jours.map(function (j, k) { var w = v + ':' + k; return '<option value="' + w + '"' + (sel === w ? ' selected' : '') + '>' + esc((p.court || p.titre) + ', ' + progDayName(p, k).toLowerCase()) + '</option>'; }).join(''); }).join('') + '</optgroup>';
  }
  function qcmCard(q, st, opts) { // opts: {feedback:bool, n, total}
    var h = '<div class="card qcm"><div class="src"><a href="' + link(q.f) + '">' + F[q.f].th + '</a><span class="muted">, niveau ' + (q.niveau || 1) + '</span></div>';
    h += '<div class="q">' + qt(q.q) + '</div><div class="muted small">' + (q.type === 'multiple' ? 'Plusieurs réponses possibles' : 'Une seule réponse') + '</div><ol class="opts">';
    q.choix.forEach(function (c, i) {
      var on = st.sel.indexOf(i) >= 0, cls = on ? ' on' : '';
      if (opts.feedback) { var good = q.bonnes.indexOf(i) >= 0; cls += good ? (on ? ' ok' : ' miss') : (on ? ' ko' : ''); }
      h += '<li><button class="opt' + cls + '" data-o="' + i + '"' + (opts.feedback ? ' disabled' : '') + '><span class="let">' + LET[i] + '</span><span>' + qt(c) + '</span></button></li>';
    });
    h += '</ol>';
    if (opts.feedback) {
      var sc = scoreQ(q, st.sel);
      h += '<div class="verdict ' + (sc === 1 ? 'good' : sc ? 'half' : 'bad') + '">' + (sc === 1 ? 'Juste.' : sc ? 'Presque : une erreur (½ point).' : 'Faux. Bonne réponse : ' + q.bonnes.map(function (b) { return LET[b]; }).join(', ') + '.') + '</div>';
      if (q.explication) h += '<div class="expl">' + qt(q.explication) + '</div>';
    }
    return h;
  }
  function bindOpts(st, onChange) {
    $$('button.opt[data-o]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.o, q = st.q;
        if (q.type === 'multiple') { var k = st.sel.indexOf(i); if (k >= 0) st.sel.splice(k, 1); else st.sel.push(i); }
        else st.sel = [i];
        onChange();
      });
    });
  }

  /* ---------------------------------------------------------------- QCM d'entraînement */
  var quiz = null;
  function pageQcm(params) {
    var s = params.s, go = params.go;
    if (s && go && (!quiz || quiz.key !== s + '|' + (params.niv || '') + '|' + (params.n || ''))) {
      var pool = shuffle(qcmPool(s, params.niv));
      var n = params.n === 'tout' ? pool.length : Math.min(pool.length, +(params.n || (s.indexOf('f:') === 0 ? pool.length : 20)));
      quiz = { key: s + '|' + (params.niv || '') + '|' + (params.n || ''), scope: s, list: pool.slice(0, n), i: 0, sel: [], checked: false, res: [] };
    }
    if (!quiz || !s || !go) return qcmConfig(params);
    renderQuiz();
  }
  function qcmConfig(params) {
    var learnedN = learnedFiches().length, errN = qcmPool('erreurs').length;
    var h = '<div class="page"><h1 class="title">QCM</h1><p class="lede">' + D.qcm.length + ' QCM rédigés à partir de vos fiches, avec correction expliquée. Réponse unique ou multiple ; une erreur sur un QCM multiple vaut ½ point.</p>';
    h += '<div class="panel"><div class="grid2"><label class="field"><b>Sur quoi ?</b>' + scopeSelect('qs', params.s || (learnedN ? 'apprises' : 'tout')) + '</label>' +
      '<label class="field"><b>Combien ?</b><select class="field-in" id="qn"><option>10</option><option selected>20</option><option>40</option><option value="tout">Tout</option></select></label>' +
      '<label class="field"><b>Niveau</b><select class="field-in" id="qniv"><option value="tous">Tous</option><option value="1">1 : connaissance</option><option value="2">2 : association, chiffres</option><option value="3">3 : raisonnement, cas</option></select></label></div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn primary" id="qgo">Commencer</button><span class="muted small" id="qcount"></span></div></div>';
    h += '<h2 class="sec">Raccourcis</h2><div class="row">';
    h += '<a class="btn" href="#/qcm?s=' + (learnedN ? 'apprises' : 'tout') + '&n=20&go=1">20 QCM ' + (learnedN ? 'sur mes fiches apprises' : 'au hasard') + '</a>';
    if (errN) h += '<a class="btn" href="#/qcm?s=erreurs&n=tout&go=1">Refaire mes ' + errN + ' QCM ratés</a>';
    h += '<a class="btn" href="#/examen">Examen blanc chronométré</a></div>';
    h += '<h2 class="sec">Par thème</h2><table class="plain"><thead><tr><th>Thème</th><th class="n">QCM</th><th class="n">Faits</th><th class="n">Réussite</th><th></th></tr></thead><tbody>';
    D.cats.forEach(function (c) {
      c.themes.forEach(function (t) {
        var ids = qcmPool('t:' + t.id); if (!ids.length) return;
        var done = ids.filter(function (id) { return mem.qcm[id]; }), ok = done.filter(function (id) { return mem.qcm[id].lastOk; }).length;
        h += '<tr><td>' + esc(t.name) + '</td><td class="n">' + ids.length + '</td><td class="n">' + done.length + '</td><td class="n">' + (done.length ? Math.round(100 * ok / done.length) + ' %' : '–') + '</td><td><a href="#/qcm?s=t:' + t.id + '&n=20&go=1">S’entraîner</a></td></tr>';
      });
    });
    main.innerHTML = h + '</tbody></table></div>';
    function upd() { $('#qcount').textContent = qcmPool($('#qs').value, $('#qniv').value).length + ' QCM disponibles.'; }
    ['qs', 'qniv'].forEach(function (id) { $('#' + id).addEventListener('change', upd); }); upd();
    $('#qgo').addEventListener('click', function () { quiz = null; location.hash = '#/qcm?s=' + encodeURIComponent($('#qs').value) + '&n=' + $('#qn').value + '&niv=' + $('#qniv').value + '&go=1'; });
  }
  function renderQuiz() {
    var z = quiz, h = '<div class="page"><h1 class="title">QCM : ' + esc(scopeLabel(z.scope)) + '</h1>';
    if (!z.list.length) { main.innerHTML = h + '<div class="empty">Aucun QCM dans cette sélection. <a href="#/qcm">Choisir une autre sélection</a></div></div>'; return; }
    if (z.i >= z.list.length) return quizEnd();
    var q = QCM[z.list[z.i]]; z.q = q;
    h += '<div class="muted small">' + (z.i + 1) + ' sur ' + z.list.length + (z.res.length ? ', score ' + fmtScore(z.res) : '') + '</div><div class="progress"><span style="width:' + Math.round(100 * z.i / z.list.length) + '%"></span></div>';
    h += qcmCard(q, z, { feedback: z.checked });
    h += '<div class="actions row">' + (z.checked ? '<button class="btn primary" id="qnext">Question suivante <kbd>Entrée</kbd></button>' : '<button class="btn primary" id="qcheck"' + (z.sel.length ? '' : ' disabled') + '>Valider <kbd>Entrée</kbd></button>') +
      '<a class="btn" href="#/qcm">Arrêter</a></div></div></div>';
    main.innerHTML = h;
    bindOpts(z, renderQuiz);
    var c = $('#qcheck'); if (c) c.addEventListener('click', quizCheck);
    var n = $('#qnext'); if (n) { n.addEventListener('click', quizNext); n.focus(); }
  }
  function fmtScore(res) { var s = res.reduce(function (a, r) { return a + r.sc; }, 0); return (Math.round(s * 2) / 2).toString().replace('.', ',') + ' / ' + res.length; }
  function quizCheck() { var z = quiz; if (!z || z.checked || !z.sel.length) return; var sc = scoreQ(z.q, z.sel); recordQ(z.q.id, sc); z.res.push({ id: z.q.id, sel: z.sel.slice(), sc: sc }); z.checked = true; save(); renderQuiz(); }
  function quizNext() { var z = quiz; if (!z || !z.checked) return; z.i++; z.sel = []; z.checked = false; renderQuiz(); window.scrollTo(0, 0); }
  function quizEnd() {
    var z = quiz, wrong = z.res.filter(function (r) { return r.sc < 1; });
    var h = '<div class="page"><h1 class="title">Résultat : ' + fmtScore(z.res) + '</h1><p class="lede">' + esc(scopeLabel(z.scope)) + ', ' + plural(z.res.length, 'question') + '. ' + (wrong.length ? plural(wrong.length, 'erreur') + ' à revoir ci-dessous.' : 'Aucune erreur.') + '</p>';
    h += '<div class="row">' + (wrong.length ? '<button class="btn primary" id="qredo">Refaire mes erreurs</button>' : '') + '<a class="btn" href="#/qcm">Nouvelle série</a><a class="btn" href="#/">Retour à aujourd’hui</a></div>';
    h += reviewList(wrong);
    main.innerHTML = h + '</div>';
    var b = $('#qredo'); if (b) b.addEventListener('click', function () { var ids = wrong.map(function (r) { return r.id; }); quiz = { key: 'redo', scope: z.scope, list: shuffle(ids), i: 0, sel: [], checked: false, res: [] }; renderQuiz(); });
    renderSide(parseRoute());
  }
  function reviewList(items) {
    if (!items.length) return '';
    return '<h2 class="sec">Corrections</h2><div class="list">' + items.map(function (r) {
      var q = QCM[r.id];
      return '<div class="it"><span></span><div><div class="ttl">' + qt(q.q) + '</div><ol class="opts small">' + q.choix.map(function (c, i) {
        var good = q.bonnes.indexOf(i) >= 0, on = r.sel.indexOf(i) >= 0;
        return '<li class="' + (good ? 'okt' : on ? 'kot' : '') + '"><b>' + LET[i] + '</b> ' + qt(c) + (good ? ' ✓' + (r.sel.length && !on ? ' <span class="muted">(oubliée)</span>' : '') : on ? ' ✗' : '') + '</li>';
      }).join('') + '</ol>' + (q.explication ? '<div class="ctx">' + qt(q.explication) + '</div>' : '') + '<div class="small"><a href="' + link(q.f) + '">' + F[q.f].th + '</a></div></div></div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------- examen blanc */
  var exam = null, examTimer = null;
  function pageExamen(params) {
    if (exam && params.go) return renderExam();
    var learnedN = learnedFiches().length;
    var h = '<div class="page"><h1 class="title">Examen blanc</h1><p class="lede">Conditions réelles : QCM tirés au hasard, chronomètre, aucune correction avant la fin. Résultats par thème et corrections à la fin.</p>';
    if (exam && !exam.done) h += '<p class="nb">Un examen est en cours (' + mmss(examLeft()) + ' restantes). <a href="#/examen?go=1">Reprendre l’examen</a></p>';
    h += '<div class="panel"><div class="grid2"><label class="field"><b>Sur quoi ?</b>' + scopeSelect('es', params.s || (learnedN >= 10 ? 'apprises' : 'tout')) + '</label>' +
      '<label class="field"><b>Nombre de QCM</b><select class="field-in" id="en"><option>20</option><option selected>40</option><option>60</option><option>100</option></select></label>' +
      '<label class="field"><b>Temps par QCM</b><select class="field-in" id="et"><option value="45">45 s</option><option value="60" selected>1 min</option><option value="90">1 min 30</option></select></label>' +
      '<label class="field check"><input type="checkbox" id="esuj" checked> Enchaîner avec un sujet rédactionnel</label></div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn primary" id="ego">Démarrer l’examen</button></div></div>';
    var hist = (mem.exams || []).slice(-10).reverse();
    if (hist.length) {
      h += '<h2 class="sec">Mes examens blancs</h2><table class="plain"><thead><tr><th>Date</th><th>Périmètre</th><th class="n">Note /20</th><th class="n">Score</th><th class="n">Durée</th></tr></thead><tbody>' +
        hist.map(function (x) { return '<tr><td>' + fdate(x.date) + '</td><td>' + esc(x.label) + '</td><td class="n"><b>' + (Math.round(20 * x.score / x.n * 10) / 10).toString().replace('.', ',') + '</b></td><td class="n">' + String(x.score).replace('.', ',') + ' / ' + x.n + '</td><td class="n">' + Math.round(x.dur / 60) + ' min</td></tr>'; }).join('') + '</tbody></table>';
    }
    main.innerHTML = h + '</div>';
    $('#ego').addEventListener('click', function () {
      var s = $('#es').value, n = +$('#en').value, per = +$('#et').value, pool = shuffle(qcmPool(s));
      if (!pool.length) { alertBox('Aucun QCM dans cette sélection.'); return; }
      var list = pool.slice(0, n);
      exam = { scope: s, label: scopeLabel(s), list: list, ans: {}, flag: {}, i: 0, start: Date.now(), limit: list.length * per, sujet: $('#esuj').checked, done: false };
      location.hash = '#/examen?go=1';
    });
  }
  function alertBox(m) { var p = document.createElement('p'); p.className = 'nb'; p.textContent = m; main.querySelector('.page').appendChild(p); }
  function examLeft() { return Math.max(0, exam.limit - Math.round((Date.now() - exam.start) / 1000)); }
  function mmss(s) { return Math.floor(s / 60) + ':' + pad(s % 60); }
  function renderExam() {
    var x = exam; if (x.done) return examResults();
    clearInterval(examTimer);
    examTimer = setInterval(function () { var el = $('#etime'); if (!exam || exam.done) { clearInterval(examTimer); return; } if (!el) return; var l = examLeft(); el.textContent = mmss(l); el.classList.toggle('late', l < 120); if (!l) examFinish(); }, 1000);
    var q = QCM[x.list[x.i]], st = { q: q, sel: (x.ans[q.id] || []).slice() };
    var answered = Object.keys(x.ans).filter(function (k) { return x.ans[k].length; }).length;
    var h = '<div class="page wide"><div class="exambar"><b>Examen blanc</b><span class="muted">' + esc(x.label) + '</span><span class="muted">' + answered + ' / ' + x.list.length + ' répondues</span><span class="timer num" id="etime">' + mmss(examLeft()) + '</span><button class="btn" id="efin">Terminer et corriger</button></div>';
    h += '<div class="examgrid">' + x.list.map(function (id, i) { return '<button class="qn' + (i === x.i ? ' cur' : '') + ((x.ans[id] || []).length ? ' done' : '') + (x.flag[id] ? ' flag' : '') + '" data-i="' + i + '">' + (i + 1) + '</button>'; }).join('') + '</div>';
    h += '<div class="examq"><div class="muted small">Question ' + (x.i + 1) + ' sur ' + x.list.length + '</div>' + qcmCard(q, st, { feedback: false }).replace('<div class="src"><a href="' + link(q.f) + '">' + F[q.f].th + '</a>', '<div class="src"><span>' + esc(THEMES[F[q.f].theme].short) + '</span>');
    h += '<div class="actions row"><button class="btn" id="eprev"' + (x.i ? '' : ' disabled') + '>Précédente</button><button class="btn primary" id="enext">' + (x.i < x.list.length - 1 ? 'Suivante <kbd>Entrée</kbd>' : 'Revoir la grille') + '</button><button class="btn" id="eflag">' + (x.flag[q.id] ? 'Retirer le marque-page' : 'Marquer pour y revenir') + '</button></div></div></div></div>';
    main.innerHTML = h;
    bindOpts(st, function () { x.ans[q.id] = st.sel.slice(); renderExam(); });
    $$('.examgrid .qn').forEach(function (b) { b.addEventListener('click', function () { x.i = +b.dataset.i; renderExam(); }); });
    $('#eprev').addEventListener('click', function () { if (x.i) { x.i--; renderExam(); } });
    $('#enext').addEventListener('click', examNext);
    $('#eflag').addEventListener('click', function () { x.flag[q.id] = !x.flag[q.id]; renderExam(); });
    var armed = false;
    $('#efin').addEventListener('click', function () {
      var left = x.list.length - Object.keys(x.ans).filter(function (k) { return x.ans[k].length; }).length;
      if (left && !armed) { armed = true; this.textContent = left + ' sans réponse : confirmer'; this.classList.add('primary'); return; }
      examFinish();
    });
  }
  function examNext() { var x = exam; if (!x || x.done) return; if (x.i < x.list.length - 1) { x.i++; renderExam(); } else { var first = x.list.findIndex(function (id) { return !(x.ans[id] || []).length; }); x.i = first >= 0 ? first : 0; renderExam(); } }
  function examFinish() {
    var x = exam; if (!x || x.done) return; clearInterval(examTimer);
    x.done = true; x.dur = Math.round((Date.now() - x.start) / 1000);
    x.res = x.list.map(function (id) { var sel = x.ans[id] || [], sc = sel.length ? scoreQ(QCM[id], sel) : 0; recordQ(id, sc); return { id: id, sel: sel, sc: sc }; });
    var score = x.res.reduce(function (a, r) { return a + r.sc; }, 0), by = {};
    x.res.forEach(function (r) { var t = F[QCM[r.id].f].theme; by[t] = by[t] || [0, 0]; by[t][0] += r.sc; by[t][1]++; });
    mem.exams = mem.exams || []; mem.exams.push({ date: today(), label: x.label, n: x.res.length, score: score, dur: x.dur, by: by }); logToday('exam'); save();
    examResults(); renderSide(parseRoute());
  }
  function examResults() {
    var x = exam, last = mem.exams[mem.exams.length - 1], wrong = x.res.filter(function (r) { return r.sc < 1; });
    var note = Math.round(20 * last.score / last.n * 10) / 10;
    var h = '<div class="page"><h1 class="title">Examen blanc : ' + String(note).replace('.', ',') + ' / 20</h1><p class="lede">' + String(last.score).replace('.', ',') + (last.score > 1 ? ' points' : ' point') + ' sur ' + last.n + ' en ' + (last.dur < 60 ? 'moins d’une minute' : Math.round(last.dur / 60) + ' min') + '. ' + esc(x.label) + '.</p>';
    h += '<h2 class="sec">Par thème</h2><table class="plain"><thead><tr><th>Thème</th><th class="n">Score</th><th>Réussite</th></tr></thead><tbody>';
    Object.keys(last.by).sort(function (a, b) { return last.by[a][0] / last.by[a][1] - last.by[b][0] / last.by[b][1]; }).forEach(function (t) {
      var v = last.by[t], p = Math.round(100 * v[0] / v[1]);
      h += '<tr><td><a href="#/theme/' + t + '">' + esc(THEMES[t].name) + '</a></td><td class="n">' + String(v[0]).replace('.', ',') + ' / ' + v[1] + '</td><td><div class="bar"><span class="' + (p < 50 ? 'lo' : '') + '" style="width:' + p + '%"></span></div></td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="row" style="margin-top:16px">' + (x.sujet ? '<a class="btn primary" href="#/sujet/' + pickSujet(x.scope) + '?examen=1">Passer au sujet rédactionnel</a>' : '') + '<a class="btn" href="#/examen">Nouvel examen</a><a class="btn" href="#/qcm?s=erreurs&n=tout&go=1">Refaire mes erreurs</a></div>';
    h += reviewList(wrong);
    main.innerHTML = h + '</div>';
  }

  /* ---------------------------------------------------------------- sujets rédactionnels */
  function pickSujet(scope) {
    if (scope && scope.indexOf('p:') === 0) { var pp = parseP(scope); if (pp.p) return pickFrom(progSujets(pp.p, pp.d)); }
    var fids = scopeFiches(scope || 'apprises'); if (!fids.length) fids = ORDER;
    var ids = []; fids.forEach(function (f) { ids = ids.concat(SBYF[f] || []); });
    if (!ids.length) ids = Object.keys(SUJ);
    ids.sort(function (a, b) { return ((mem.sujets[a] || {}).tries || []).length - ((mem.sujets[b] || {}).tries || []).length; });
    var few = ids.filter(function (i) { return ((mem.sujets[i] || {}).tries || []).length === ((mem.sujets[ids[0]] || {}).tries || []).length; });
    return few[Math.floor(Math.random() * few.length)];
  }
  function pageSujets(params) {
    var h = '<div class="page"><h1 class="title">Sujets rédactionnels</h1><p class="lede">' + Object.keys(SUJ).length + ' sujets type examen avec leur plan attendu. Rédigez votre plan en temps limité, puis cochez les points que vous aviez.</p>';
    h += '<div class="row"><a class="btn primary" href="#/sujet/' + pickSujet('apprises') + '">Sujet au hasard (fiches apprises)</a><a class="btn" href="#/sujet/' + pickSujet('tout') + '">Sujet au hasard (tout)</a></div>';
    D.cats.forEach(function (c) {
      var rows = '';
      c.themes.forEach(function (t) { t.all.forEach(function (f) { (SBYF[f] || []).forEach(function (sid) { var s = SUJ[sid], tr = (mem.sujets[sid] || {}).tries || []; var best = tr.length ? Math.max.apply(null, tr.map(function (x) { return Math.round(100 * x.s / x.m); })) : null; rows += '<div class="it"><span class="dot"' + (best !== null ? ' style="background:' + lut(best / 100) + '"' : '') + '></span><div><a class="ttl" href="#/sujet/' + sid + '">' + qt(s.sujet) + '</a><div class="small muted">' + s.duree + ' min' + (tr.length ? ', ' + plural(tr.length, 'essai') + ', meilleur ' + best + ' %' : '') + '</div></div></div>'; }); }); });
      if (rows) h += '<h2 class="sec">' + esc(c.name) + '</h2><div class="list">' + rows + '</div>';
    });
    main.innerHTML = h + '</div>';
  }
  var sujTimer = null;
  function pageSujet(sid, params) {
    var s = SUJ[sid]; if (!s) return pageSujets({});
    var st = mem.sujets[sid] = mem.sujets[sid] || { tries: [], draft: '' };
    var h = '<div class="page"><div class="crumbs"><a href="#/sujets">Sujets rédactionnels</a> / <a href="' + link(s.f) + '">' + F[s.f].th + '</a></div><h1 class="title">' + qt(s.sujet) + '</h1>';
    h += '<div class="row"><span class="timer num" id="stime">' + s.duree + ':00</span><button class="btn" id="sstart">Lancer le chrono (' + s.duree + ' min)</button><span class="muted small">Rédigez votre plan détaillé : parties, sous-parties, chiffres clés.</span></div>';
    h += '<textarea class="draft" id="sdraft" placeholder="I. Introduction&#10;   - …&#10;II. …">' + esc(st.draft || '') + '</textarea>';
    h += '<div class="row"><button class="btn" id="sdict">Dicter</button><span class="status" id="sdst"></span></div>';
    h += '<div class="row"><button class="btn primary" id="sreveal">Afficher le plan attendu</button><a class="btn" href="#/sujet/' + pickSujet('apprises') + '">Autre sujet</a></div>';
    h += '<div id="splan" hidden><h2 class="sec">Plan attendu : cochez ce que vous aviez</h2><div class="plancheck">' + s.plan.map(function (p, i) {
      return '<div class="pp"><b>' + qt(p.partie) + '</b><ul>' + p.points.map(function (pt, j) { return '<li><label><input type="checkbox" data-k="' + i + '-' + j + '"> ' + qt(pt) + '</label></li>'; }).join('') + '</ul></div>';
    }).join('') + '</div><div class="row"><button class="btn primary" id="ssave">Enregistrer mon score</button><span id="sscore" class="muted"></span></div></div>';
    if (st.tries.length) h += '<p class="small muted">Essais précédents : ' + st.tries.map(function (t) { return fdate(t.d) + ' (' + Math.round(100 * t.s / t.m) + ' %)'; }).join(', ') + '.</p>';
    main.innerHTML = h + '</div>';
    var ta = $('#sdraft'), tmo; ta.addEventListener('input', function () { clearTimeout(tmo); tmo = setTimeout(function () { st.draft = ta.value; save(); }, 400); });
    attachDictation(ta, $('#sdict'), $('#sdst'));
    clearInterval(sujTimer);
    function startTimer() {
      var end = Date.now() + s.duree * 60000; $('#sstart').disabled = true;
      sujTimer = setInterval(function () { var el = $('#stime'); if (!el) { clearInterval(sujTimer); return; } var l = Math.max(0, Math.round((end - Date.now()) / 1000)); el.textContent = mmss(l); el.classList.toggle('late', l < 120); if (!l) { clearInterval(sujTimer); beep(); el.textContent = 'Temps écoulé'; } }, 1000);
    }
    $('#sstart').addEventListener('click', startTimer);
    if (params.examen) startTimer();
    $('#sreveal').addEventListener('click', function () { $('#splan').hidden = false; $('#splan').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    function cnt() { var all = $$('#splan input[type=checkbox]'), ok = all.filter(function (c) { return c.checked; }).length; $('#sscore').textContent = ok + ' / ' + all.length + ' points (' + Math.round(100 * ok / all.length) + ' %)'; return [ok, all.length]; }
    $$('#splan input[type=checkbox]').forEach(function (c) { c.addEventListener('change', cnt); }); cnt();
    $('#ssave').addEventListener('click', function () { var r = cnt(); st.tries.push({ d: today(), s: r[0], m: r[1] }); logToday('sujet'); save(); this.textContent = 'Score enregistré'; this.disabled = true; });
  }

  /* ---------------------------------------------------------------- carnet d'erreurs */
  function pageErreurs() {
    var qe = qcmPool('erreurs'), ce = Object.keys(mem.cards).filter(function (c) { return CARD[c] && mem.cards[c].lapses > 0; }).sort(function (a, b) { return mem.cards[b].lapses - mem.cards[a].lapses; });
    var ze = D.clozes.filter(function (z) { var k = mem.clozes[z.id]; return k && k.miss > (k.ok || 0); });
    var h = '<div class="page"><h1 class="title">Carnet d’erreurs</h1><p class="lede">Tout ce que vous avez raté récemment, au même endroit. Une erreur disparaît dès que vous réussissez la question.</p>';
    h += '<div class="row"><a class="btn primary' + (qe.length ? '' : ' disabled') + '" href="#/qcm?s=erreurs&n=tout&go=1">Refaire les QCM ratés (' + qe.length + ')</a><a class="btn" href="#/chiffres?portee=erreurs">Revoir les chiffres ratés (' + ze.length + ')</a><a class="btn" href="#/revision">Réviser les questions dues</a></div>';
    if (!qe.length && !ce.length && !ze.length) { main.innerHTML = h + '<div class="empty" style="margin-top:20px">Aucune erreur enregistrée pour l’instant.</div></div>'; return; }
    if (qe.length) h += '<h2 class="sec">QCM ratés</h2>' + reviewList(qe.slice(0, 40).map(function (id) { return { id: id, sel: [] }; })).replace('<h2 class="sec">Corrections</h2>', '');
    if (ce.length) h += '<h2 class="sec">Questions de révision les plus ratées</h2><div class="list">' + ce.slice(0, 30).map(function (cid) { var c = CARD[cid]; return '<div class="it"><span class="small muted num">' + mem.cards[cid].lapses + '×</span><div><div class="ttl">' + c.q + '</div><div class="ctx">' + c.a + '</div><div class="small"><a href="' + link(c.f) + '">' + F[c.f].th + '</a></div></div></div>'; }).join('') + '</div>';
    if (ze.length) h += '<h2 class="sec">Chiffres à revoir</h2><div class="list">' + ze.slice(0, 40).map(function (z) { return '<div class="it"><span></span><div class="ctx">' + esc(z.b) + ' <b class="v">' + esc(z.v) + '</b> ' + esc(z.a) + ' <a class="small" href="' + link(z.f) + '">' + F[z.f].th + '</a></div></div>'; }).join('') + '</div>';
    main.innerHTML = h + '</div>';
  }

  /* ---------------------------------------------------------------- statistiques */
  function pageStats() {
    var learned = learnedFiches().length, qdone = Object.keys(mem.qcm).filter(function (id) { return QCM[id]; }), qok = qdone.filter(function (id) { return mem.qcm[id].lastOk; }).length;
    var solid = Object.keys(mem.cards).filter(function (c) { return CARD[c] && mem.cards[c].int >= 21; }).length;
    var h = '<div class="page wide"><h1 class="title">Statistiques</h1>' + (me ? '<p class="lede">Profil de ' + esc(me.nom) + '</p>' : '');
    h += '<div class="kpis"><div><b>' + learned + '</b><span>/ ' + ORDER.length + ' fiches apprises</span></div><div><b>' + qdone.length + '</b><span>/ ' + D.qcm.length + ' QCM faits</span></div><div><b>' + (qdone.length ? Math.round(100 * qok / qdone.length) + ' %' : '–') + '</b><span>de réussite aux QCM</span></div><div><b>' + solid + '</b><span>questions solides</span></div><div><b>' + (mem.exams || []).length + '</b><span>examens blancs</span></div></div>';
    // activité 21 jours (SVG)
    var days = []; for (var i = 20; i >= 0; i--) days.push(addDays(today(), -i));
    var keys = [['learned', 'Fiches', 'var(--lut2)', 5], ['cards', 'Questions', 'var(--teal)', 1], ['qcm', 'QCM', 'var(--lut3)', 1], ['clozes', 'Chiffres', 'var(--muted)', 1]];
    var tot = days.map(function (d) { var l = mem.log[d] || {}; return keys.reduce(function (s, k) { return s + (l[k[0]] || 0) * k[3]; }, 0); }), mx = Math.max.apply(null, tot.concat([10]));
    var W = 840, H = 160, bw = W / days.length;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + (H + 22) + '" class="chart" role="img" aria-label="Activité des 21 derniers jours">';
    days.forEach(function (d, i) {
      var l = mem.log[d] || {}, y = H;
      keys.forEach(function (k) { var v = (l[k[0]] || 0) * k[3]; if (!v) return; var hh = v / mx * (H - 8); y -= hh; svg += '<rect x="' + (i * bw + 3) + '" y="' + y + '" width="' + (bw - 6) + '" height="' + hh + '" fill="' + k[2] + '" rx="2"><title>' + fdate(d) + ' : ' + (l[k[0]] || 0) + ' ' + k[1].toLowerCase() + '</title></rect>'; });
      if (i % 3 === 0) svg += '<text x="' + (i * bw + bw / 2) + '" y="' + (H + 16) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">' + fdate(d) + '</text>';
    });
    if (!tot.some(function (t) { return t; })) svg += '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="14" fill="currentColor" opacity=".55">Votre activité s’affichera ici dès vos premières révisions.</text>';
    svg += '</svg>';
    h += '<h2 class="sec">Activité des 3 dernières semaines</h2><div class="panel">' + svg + '<div class="legend">' + keys.map(function (k) { return '<span class="sw" style="background:' + k[2] + '"></span>' + k[1] + (k[3] > 1 ? ' (×' + k[3] + ')' : ''); }).join('') + '</div></div>';
    // par thème
    var rows = [];
    D.cats.forEach(function (c) { c.themes.forEach(function (t) {
      var fl = t.all.filter(function (f) { return (mem.fiches[f] || {}).learned; }).length, ids = qcmPool('t:' + t.id), dn = ids.filter(function (id) { return mem.qcm[id]; }), ok = dn.filter(function (id) { return mem.qcm[id].lastOk; }).length;
      rows.push({ t: t, fl: fl, n: t.all.length, q: ids.length, dn: dn.length, p: dn.length ? Math.round(100 * ok / dn.length) : null });
    }); });
    var weak = rows.filter(function (r) { return r.p !== null && r.dn >= 5; }).sort(function (a, b) { return a.p - b.p; }).slice(0, 5);
    if (weak.length) h += '<h2 class="sec">Points faibles</h2><div class="list">' + weak.map(function (r) { return '<div class="it"><b class="num">' + r.p + ' %</b><div><a class="ttl" href="#/theme/' + r.t.id + '">' + esc(r.t.name) + '</a><div class="small"><a href="#/qcm?s=t:' + r.t.id + '&n=20&go=1">20 QCM sur ce thème</a></div></div></div>'; }).join('') + '</div>';
    h += '<h2 class="sec">Par thème</h2><table class="plain"><thead><tr><th>Thème</th><th class="n">Fiches apprises</th><th class="n">QCM faits</th><th>Réussite QCM</th></tr></thead><tbody>' + rows.map(function (r) {
      return '<tr><td><a href="#/theme/' + r.t.id + '">' + esc(r.t.name) + '</a></td><td class="n">' + r.fl + ' / ' + r.n + '</td><td class="n">' + r.dn + ' / ' + r.q + '</td><td>' + (r.p === null ? '<span class="muted small">–</span>' : '<div class="bar"><span class="' + (r.p < 50 ? 'lo' : '') + '" style="width:' + r.p + '%"></span></div>') + '</td></tr>';
    }).join('') + '</tbody></table>';
    main.innerHTML = h + '</div>';
  }

  /* ---------------------------------------------------------------- bibliothèque PDF */
  function pagePdf() {
    var P = D.pdf || {};
    var h = '<div class="page"><h1 class="title">Fiches en PDF</h1><p class="lede">Pour imprimer, annoter ou réviser hors du site. Les PDF s’ouvrent dans un nouvel onglet.</p>';
    h += '<div class="list">';
    if (P.all) h += '<div class="it"><span></span><div><a class="ttl" target="_blank" href="' + P.all + '">Toutes les fiches, avec sommaire et signets</a><div class="small muted">Le document complet, à feuilleter ou imprimer.</div></div></div>';
    if (P.qcm) h += '<div class="it"><span></span><div><a class="ttl" target="_blank" href="' + P.qcm + '">Cahier de QCM avec corrigé</a><div class="small muted">Tous les QCM par thème, corrigés en fin de thème.</div></div></div>';
    if (P.sujets) h += '<div class="it"><span></span><div><a class="ttl" target="_blank" href="' + P.sujets + '">Sujets rédactionnels et plans attendus</a></div></div>';
    h += '</div>';
    D.cats.forEach(function (c) {
      h += '<h2 class="sec">' + esc(c.name) + '</h2><div class="list">';
      c.themes.forEach(function (t) {
        h += '<div class="it"><span></span><div>' + (P.themes && P.themes[t.id] ? '<a class="ttl" target="_blank" href="' + P.themes[t.id] + '">' + esc(t.name) + ' (thème complet)</a>' : '<b>' + esc(t.name) + '</b>') +
          '<ul class="pdfl">' + t.all.map(function (f) { return '<li><a target="_blank" href="' + F[f].pdf + '">' + F[f].th + '</a></li>'; }).join('') + '</ul></div></div>';
      });
      h += '</div>';
    });
    main.innerHTML = h + '</div>';
  }

  /* ---------------------------------------------------------------- minuteur de travail */
  var pomo = null;
  function beep() {
    try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.2, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + 1.2); o.start(); o.stop(a.currentTime + 1.2); } catch (e) { }
  }
  function renderPomo() {
    var el = $('#pomo'); if (!el) return;
    if (!pomo) { el.innerHTML = '<button class="linkbtn" data-p="25">Minuteur 25 min</button> <button class="linkbtn" data-p="50">50 min</button>'; }
    else { var l = Math.max(0, Math.round((pomo.end - Date.now()) / 1000)); el.innerHTML = '<span class="num">' + (pomo.pause ? 'Pause ' : 'Travail ') + mmss(l) + '</span> <button class="linkbtn" data-p="0">Arrêter</button>'; }
    $$('#pomo [data-p]').forEach(function (b) { b.onclick = function () { var m = +b.dataset.p; if (!m) { clearInterval(pomo.t); pomo = null; renderPomo(); return; } startPomo(m, false); }; });
  }
  function startPomo(min, pause) {
    if (pomo) clearInterval(pomo.t);
    pomo = { end: Date.now() + min * 60000, pause: pause, min: min };
    pomo.t = setInterval(function () {
      if (Date.now() >= pomo.end) { beep(); var was = pomo; clearInterval(pomo.t); if (!was.pause) startPomo(was.min >= 50 ? 10 : 5, true); else { pomo = null; renderPomo(); } document.title = was.pause ? 'Au travail – Révision DEMS' : 'Pause – Révision DEMS'; return; }
      renderPomo();
    }, 1000);
    renderPomo();
  }

  /* ---------------------------------------------------------------- QCM automatiques sur les chiffres */
  function unitOf(v) { var m = String(v).match(/[0-9][0-9.,\s]*([^\d\s].*)$/); return m ? m[1].replace(/[)\].;:]+$/, '').trim().toLowerCase() : ''; }
  var UNITS = null;
  function numChoices(z) {
    if (!UNITS) { UNITS = {}; D.clozes.forEach(function (c) { var u = unitOf(c.v); if (!u) return; (UNITS[u] = UNITS[u] || []).push(c); }); }
    var u = unitOf(z.v); if (!u || !UNITS[u]) return null;
    var same = UNITS[u].filter(function (c) { return c.v !== z.v; }), theme = F[z.f].theme;
    var pref = shuffle(same.filter(function (c) { return F[c.f].theme === theme; })).concat(shuffle(same));
    var vals = []; pref.forEach(function (c) { if (vals.indexOf(c.v) < 0 && vals.length < 3) vals.push(c.v); });
    if (vals.length < 3) return null;
    return shuffle(vals.concat([z.v]));
  }

  /* ================================================================== PROGRAMMES CIBLÉS (week-ends thématiques) */
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function wday(s) { return JOURS[parse(s).getDay()]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function progs() {
    var hid = mem.hiddenProgs || {};
    return (D.programmes || []).filter(function (p) { return !hid[p.id]; }).concat(mem.progs || []);
  }
  function progById(id) { var all = (D.programmes || []).concat(mem.progs || []); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function progEnd(p) { return addDays(p.debut, p.jours.length - 1); }
  function progDayIdx(p, t) { var i = diff(p.debut, t || today()); return i >= 0 && i < p.jours.length ? i : -1; }
  function progDate(p, i) { return addDays(p.debut, i); }
  function progDayName(p, i) { var d = progDate(p, i); return cap(wday(d)) + ' ' + fdate(d); }
  // programme à mettre en avant : en cours, sinon qui commence dans ≤ 3 jours, sinon terminé depuis ≤ 2 jours
  function featuredProg() {
    var t = today(), best = null;
    progs().forEach(function (p) {
      var st = progDayIdx(p, t) >= 0 ? 0 : (diff(t, p.debut) > 0 && diff(t, p.debut) <= 3 ? 1 : (diff(progEnd(p), t) > 0 && diff(progEnd(p), t) <= 2 ? 2 : 9));
      if (st < 9 && (!best || st < best.st)) best = { p: p, st: st };
    });
    return best;
  }
  function progRx(p, k) { var key = '_rx_' + k; if (p[k] && !p[key]) p[key] = new RegExp(p[k], 'i'); return p[key]; }
  function progMatch(p, text) {
    var rx = progRx(p, 'motif'); if (!rx) return true;
    var ig = progRx(p, 'ignore'); if (ig) text = text.replace(new RegExp(p.ignore, 'gi'), ' ');
    if (!rx.test(text)) return false;
    var ex = progRx(p, 'exclu'), fo = progRx(p, 'fort');
    if (ex && ex.test(text) && fo && !fo.test(text)) return false;
    return true;
  }
  function progItems(p, d) { return d === undefined || d === null || d === '' ? [].concat.apply([], p.jours.map(function (j) { return j.items; })) : (p.jours[+d] || { items: [] }).items; }
  function parseP(s) { var a = s.slice(2).split(':'); return { p: progById(a[0]), d: a.length > 1 ? +a[1] : null }; }
  function itemHref(p, it) {
    if (!it.partiel) return link(it.f);
    return '#/fiche/' + it.f + '?hl=' + encodeURIComponent(p.id) + (it.sec ? '&sec=' + encodeURIComponent(it.sec) : '');
  }
  function itemOk(p, it, text) { return !it.partiel || progMatch(p, text); }
  function qText(q) { return q.q + ' ' + q.choix.join(' ') + ' ' + (q.explication || ''); }
  function progQcm(p, d) { var out = []; progItems(p, d).forEach(function (it) { (QBYF[it.f] || []).forEach(function (id) { if (out.indexOf(id) < 0 && itemOk(p, it, qText(QCM[id]))) out.push(id); }); }); return out; }
  function progCards(p, d) { var out = []; progItems(p, d).forEach(function (it) { F[it.f].cards.forEach(function (cid) { var c = CARD[cid]; if (out.indexOf(cid) < 0 && itemOk(p, it, strip(c.q + ' ' + c.a))) out.push(cid); }); }); return out; }
  function progClozes(p, d) {
    var items = progItems(p, d), by = {};
    items.forEach(function (it) { (by[it.f] = by[it.f] || []).push(it); });
    return D.clozes.filter(function (z) { var its = by[z.f]; if (!its) return false; var tx = z.h + ' ' + z.b + ' ' + z.v + ' ' + z.a; return its.some(function (it) { return itemOk(p, it, tx); }); });
  }
  function progSujets(p, d) { var out = []; progItems(p, d).forEach(function (it) { (SBYF[it.f] || []).forEach(function (sid) { var s = SUJ[sid]; if (out.indexOf(sid) < 0 && itemOk(p, it, s.sujet)) out.push(sid); }); }); return out; }
  function progFiches(p, d) { var out = []; progItems(p, d).forEach(function (it) { if (out.indexOf(it.f) < 0) out.push(it.f); }); return out; }
  function doneKey(p, f, sec) { return p.id + '|' + f + '|' + (sec || ''); }
  function itemDone(p, it) { var pd = mem.progDone || {}; return !!(mem.fiches[it.f] || {}).learned || !!pd[doneKey(p, it.f, it.sec)] || !!pd[it.f + '|' + (it.sec || '')]; }
  function progStats(p, d) {
    var its = progItems(p, d), done = its.filter(function (it) { return itemDone(p, it); }).length, qs = progQcm(p, d), qd = qs.filter(function (id) { return mem.qcm[id]; }), qok = qd.filter(function (id) { return mem.qcm[id].lastOk; }).length;
    var pages = its.reduce(function (s, it) { return s + (it.partiel ? Math.max(1, Math.round(fpages(it.f) / 5)) : fpages(it.f)); }, 0);
    return { items: its.length, done: done, qcm: qs.length, qdone: qd.length, qok: qok, pages: pages };
  }
  function pickFrom(ids) {
    if (!ids.length) return pickSujet('tout');
    ids = ids.slice().sort(function (a, b) { return ((mem.sujets[a] || {}).tries || []).length - ((mem.sujets[b] || {}).tries || []).length; });
    var few = ids.filter(function (i) { return ((mem.sujets[i] || {}).tries || []).length === ((mem.sujets[ids[0]] || {}).tries || []).length; });
    return few[Math.floor(Math.random() * few.length)];
  }
  function itemsHtml(p, its) {
    return '<ul class="plist">' + its.map(function (it) {
      var done = itemDone(p, it), f = F[it.f];
      return '<li class="' + (done ? 'done' : '') + '"><span class="ck" aria-hidden="true">' + (done ? '✓' : '') + '</span><div><a href="' + itemHref(p, it) + '">' + f.th + '</a>' +
        (it.partiel ? '<div class="small muted">' + (it.sec ? 'Partie « ' + esc(it.sec) + ' » seulement' : 'Passages sur le sujet surlignés dans la fiche') + '</div>' : '') +
        '</div><span class="muted small num nowrap">' + (it.partiel ? 'extrait' : fpages(it.f) + ' p.') + '</span></li>';
    }).join('') + '</ul>';
  }
  function dayActions(p, d, primary) {
    var sc = 'p:' + p.id + ':' + d, nq = progQcm(p, d).length, nc = progCards(p, d).length, nz = progClozes(p, d).length, ss = progSujets(p, d);
    var h = '<div class="row">';
    var first = p.jours[d].items.filter(function (it) { return !itemDone(p, it); })[0];
    if (primary && first) h += '<a class="btn primary" href="' + itemHref(p, first) + '">Ouvrir la prochaine fiche</a>';
    if (nq) h += '<a class="btn" href="#/qcm?s=' + sc + '&n=tout&go=1">QCM du jour (' + nq + ')</a>';
    if (nc) h += '<a class="btn" href="#/revision?p=' + p.id + ':' + d + '">Questions (' + nc + ')</a>';
    var no = progOuv(p, d).length;
    if (no) h += '<a class="btn" href="#/ouvertes?s=' + sc + '&n=10&go=1">Questions ouvertes (' + no + ')</a>';
    if (nz) h += '<a class="btn" href="#/chiffres?portee=' + sc + '&mode=qcm">Chiffres (' + nz + ')</a>';
    h += '<button class="btn" data-cle="' + p.id + ':' + d + '">Écouter les « À retenir »</button>';
    var ncas = casFor(progItems(p, d).map(function (it) { return it.f; })).length;
    if (ncas) h += '<a class="btn" href="#/cas?p=' + p.id + ':' + d + '">Cas cliniques (' + ncas + ')</a>';
    if (ss.length) h += '<a class="btn" href="#/sujet/' + pickFrom(ss) + '">Sujet rédactionnel</a>';
    if (p.jours[d].examen) h += '<a class="btn' + (primary && !first ? ' primary' : '') + '" href="#/examen?s=p:' + p.id + '">Examen blanc du programme</a>';
    return h + '</div>';
  }
  // encadré de la page « Aujourd'hui »
  function progPanel() {
    var fp = featuredProg(); if (!fp) return '';
    var p = fp.p, t = today(), i = progDayIdx(p, t), h = '<div class="prog panel">';
    if (fp.st === 0) {
      var j = p.jours[i], s = progStats(p, i);
      h += '<div class="phead"><div><div class="eyebrow">' + esc(p.titre) + ', jour ' + (i + 1) + ' sur ' + p.jours.length + '</div><h2>' + esc(progDayName(p, i)) + ' : ' + esc(j.titre) + '</h2></div>' +
        '<a class="small" href="#/programme/' + p.id + '">Tout le programme</a></div>';
      if (j.conseil) h += '<p class="small muted">' + esc(j.conseil) + '</p>';
      h += itemsHtml(p, j.items);
      h += '<div class="small muted pstat">' + s.done + ' / ' + s.items + ' fiches faites aujourd’hui' + (s.qdone ? ', ' + s.qdone + ' / ' + s.qcm + ' QCM du jour faits, ' + Math.round(100 * s.qok / s.qdone) + ' % justes' : '') + '</div>';
      h += dayActions(p, i, true);
    } else if (fp.st === 1) {
      var n = diff(t, p.debut);
      h += '<div class="phead"><div><div class="eyebrow">Programme à venir</div><h2>' + esc(p.titre) + ' : ' + (n === 1 ? 'demain' : 'dans ' + n + ' jours') + '</h2></div><a class="small" href="#/programme/' + p.id + '">Voir le programme</a></div>';
      h += '<p class="small muted">' + esc(p.intro || '') + '</p><ol class="pdays">' + p.jours.map(function (j, k) { return '<li><b>' + esc(progDayName(p, k)) + '</b> : ' + esc(j.titre) + '</li>'; }).join('') + '</ol>';
    } else {
      var sa = progStats(p);
      h += '<div class="phead"><div><div class="eyebrow">Programme terminé</div><h2>' + esc(p.titre) + '</h2></div><a class="small" href="#/programme/' + p.id + '">Bilan</a></div>';
      h += '<p class="small">' + sa.done + ' / ' + sa.items + ' fiches faites' + (sa.qdone ? ', ' + sa.qdone + ' QCM faits (' + Math.round(100 * sa.qok / sa.qdone) + ' % justes)' : '') + '. Les questions des fiches apprises reviennent maintenant dans la révision espacée.</p>' +
        '<div class="row"><a class="btn" href="#/qcm?s=p:' + p.id + '&n=20&go=1">20 QCM de rappel</a><a class="btn" href="#/qcm?s=erreurs&n=tout&go=1">Refaire mes erreurs</a></div>';
    }
    return h + '</div>';
  }
  // page d'un programme
  function pageProgramme(id) {
    var p = progById(id); if (!p) { main.innerHTML = '<div class="page"><p class="empty">Programme introuvable.</p></div>'; return; }
    var s = progStats(p), t = today(), cur = progDayIdx(p, t);
    var h = '<div class="page wide"><div class="crumbs"><a href="#/planning">Planning</a> / Programmes</div><h1 class="title">' + esc(p.titre) + '</h1>';
    h += '<p class="lede">' + esc(cap(wday(p.debut))) + ' ' + fdate(p.debut) + ' → ' + wday(progEnd(p)) + ' ' + fdate(progEnd(p)).replace(/\.$/, '') + '. ' + esc(p.intro || '') + '</p>';
    h += '<div class="kpis"><div><b>' + s.done + '</b><span>/ ' + s.items + ' fiches faites</span></div><div><b>' + s.pages + '</b><span>pages environ</span></div><div><b>' + s.qdone + '</b><span>/ ' + s.qcm + ' QCM faits</span></div><div><b>' + (s.qdone ? Math.round(100 * s.qok / s.qdone) + ' %' : '–') + '</b><span>de réussite</span></div><div><b>' + progSujets(p).length + '</b><span>sujets rédactionnels</span></div></div>';
    h += '<div class="row" style="margin:14px 0 4px"><a class="btn primary" href="#/qcm?s=p:' + p.id + '&n=20&go=1">20 QCM sur tout le programme</a><a class="btn" href="#/examen?s=p:' + p.id + '">Examen blanc du programme</a><a class="btn" href="#/chiffres?portee=p:' + p.id + '&mode=qcm">Chiffres</a><a class="btn" href="#/sujet/' + pickFrom(progSujets(p)) + '">Sujet rédactionnel</a></div>';
    h += '<div class="pgrid">' + p.jours.map(function (j, k) {
      var st = progStats(p, k);
      return '<section class="panel' + (k === cur ? ' now' : '') + '"><div class="eyebrow">Jour ' + (k + 1) + (k === cur ? ', aujourd’hui' : '') + '</div><h2>' + esc(progDayName(p, k)) + '</h2><p class="ptitle">' + esc(j.titre) + '</p>' +
        (j.conseil ? '<p class="small muted">' + esc(j.conseil) + '</p>' : '') + itemsHtml(p, j.items) +
        '<div class="small muted pstat">' + st.done + ' / ' + st.items + ' faites, environ ' + st.pages + ' pages, ' + st.qcm + ' QCM</div>' + dayActions(p, k, k === cur) + '</section>';
    }).join('') + '</div>';
    h += '<p class="small muted">Une fiche est cochée quand vous cliquez sur « J’ai appris cette fiche ». Pour les extraits (une partie d’un chapitre transversal), utilisez le bouton « Extrait fait » en haut de la fiche ouverte depuis ce programme.</p>';
    if ((mem.progs || []).some(function (x) { return x.id === p.id; })) h += '<button class="btn" id="pdel">Supprimer ce programme</button>';
    else h += '<button class="linkbtn small" id="phide">Masquer ce programme</button>';
    main.innerHTML = h + '</div>';
    var del = $('#pdel'); if (del) del.addEventListener('click', function () { mem.progs = (mem.progs || []).filter(function (x) { return x.id !== p.id; }); save(); location.hash = '#/planning'; });
    var hide = $('#phide'); if (hide) hide.addEventListener('click', function () { mem.hiddenProgs = mem.hiddenProgs || {}; mem.hiddenProgs[p.id] = 1; save(); location.hash = '#/planning'; });
  }
  // bloc « Programmes » de la page Planning, avec création d'un programme par thèmes
  function progPlanningHtml() {
    var h = '<h2 class="sec">Programmes ciblés</h2><p class="small muted">Un thème sur quelques jours (un week-end, par exemple) : fiches réparties par jour, QCM, questions, chiffres et sujets limités à ce thème, examen blanc le dernier jour.</p>';
    var list = progs();
    if (list.length) h += '<div class="list">' + list.map(function (p) { var s = progStats(p); return '<div class="it"><span></span><div><a class="ttl" href="#/programme/' + p.id + '">' + esc(p.titre) + '</a><div class="small muted">' + cap(wday(p.debut)) + ' ' + fdate(p.debut) + ' → ' + wday(progEnd(p)) + ' ' + fdate(progEnd(p)) + ', ' + s.done + ' / ' + s.items + ' fiches faites, ' + s.qcm + ' QCM</div></div></div>'; }).join('') + '</div>';
    var hidden = (D.programmes || []).filter(function (p) { return (mem.hiddenProgs || {})[p.id]; });
    if (hidden.length) h += '<p class="small"><button class="linkbtn" id="punhide">Réafficher les programmes masqués (' + hidden.length + ')</button></p>';
    h += '<details class="panel pnew"><summary><b>Créer un programme</b></summary><div class="grid2" style="margin-top:12px">' +
      '<label class="field"><b>Nom</b><input class="field-in" id="pn-name" placeholder="Week-end cœur"></label>' +
      '<label class="field"><b>Premier jour</b><input class="field-in" type="date" id="pn-start" value="' + addDays(today(), 1) + '"></label>' +
      '<label class="field"><b>Nombre de jours</b><select class="field-in" id="pn-days">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<option' + (n === 3 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="field" style="margin-top:10px"><b>Thèmes</b><div class="pthemes">' + D.cats.map(function (c) { return c.themes.filter(function (t) { return t.id !== 'add'; }).map(function (t) { return '<label><input type="checkbox" value="' + t.id + '"> ' + esc(t.short) + '</label>'; }).join(''); }).join('') + '</div></div>' +
      '<p class="small muted">Les fiches des thèmes choisis (et leurs compléments) sont réparties par jour selon leur nombre de pages, dans l’ordre conseillé.</p>' +
      '<div class="row"><button class="btn primary" id="pn-go">Créer</button><span class="small muted" id="pn-msg"></span></div></details>';
    return h;
  }
  function bindProgPlanning() {
    var un = $('#punhide'); if (un) un.addEventListener('click', function () { mem.hiddenProgs = {}; save(); route(); });
    var go = $('#pn-go'); if (!go) return;
    go.addEventListener('click', function () {
      var themes = $$('.pthemes input:checked').map(function (x) { return x.value; }), n = +$('#pn-days').value, start = $('#pn-start').value, name = $('#pn-name').value.trim();
      if (!themes.length || !start) { $('#pn-msg').textContent = 'Choisissez au moins un thème et une date.'; return; }
      var sel = {}; themes.forEach(function (t) { sel[t] = 1; });
      var fs = [], last = null;
      ORDER.forEach(function (f) { var th = F[f].theme; if (th !== 'add') last = th; if (sel[th] || (th === 'add' && sel[last])) fs.push(f); });
      var total = fs.reduce(function (s, f) { return s + fpages(f); }, 0), per = total / n, days = [], acc = 0;
      for (var k = 0; k < n; k++) days.push({ titre: 'Partie ' + (k + 1), items: [] });
      fs.forEach(function (f) { var k = Math.min(n - 1, Math.floor(acc / per)); days[k].items.push({ f: f }); acc += fpages(f); });
      days = days.filter(function (d) { return d.items.length; });
      days[days.length - 1].examen = true;
      days.forEach(function (d) { d.titre = d.items.map(function (it) { return F[it.f].title; }).slice(0, 2).join(' ; ') + (d.items.length > 2 ? '…' : ''); });
      var p = { id: 'u' + Date.now().toString(36), titre: name || themes.map(function (t) { return THEMES[t].short; }).join(', '), debut: start, intro: '', jours: days };
      p.court = p.titre;
      mem.progs = (mem.progs || []).concat([p]); save(); location.hash = '#/programme/' + p.id;
    });
  }
  // fiche ouverte depuis un programme : surligner les passages, aller à la partie, cocher l'extrait
  function progFicheExtras(fid, params, art) {
    var p = params.hl ? progById(params.hl) : null, target = null;
    if (params.sec) {
      $$('h2,h3,h4', art).some(function (hd) { if (hd.textContent.indexOf(params.sec) >= 0) { target = hd; return true; } return false; });
      if (target) target.classList.add('flash');
    }
    if (!p) return target;
    var hits = [];
    var scopeEls = target ? (function () { var out = [], lvl = +target.tagName[1], n = target.nextElementSibling; while (n && !(/^H[2-4]$/.test(n.tagName) && +n.tagName[1] <= lvl)) { out.push(n); n = n.nextElementSibling; } return out; })() : [art];
    scopeEls.forEach(function (root) {
      $$('tr, li, p', root).concat(/^(TR|LI|P)$/.test(root.tagName) ? [root] : []).forEach(function (el) {
        if (el.closest('.autotest') || el.closest('.cle') || el.classList.contains('sources') || el.querySelector('li, p, tr')) return;
        if (progMatch(p, el.textContent)) { el.classList.add('hlprog'); hits.push(el); }
      });
    });
    var key = doneKey(p, fid, params.sec), done = !!(mem.progDone || {})[key];
    var bar = document.createElement('div'); bar.className = 'progbar';
    bar.innerHTML = '<span><b>' + esc(p.court || p.titre) + '</b> : ' + (params.sec ? 'partie « ' + esc(params.sec) + ' »' : 'extrait') + (hits.length ? ', ' + plural(hits.length, 'passage surligné', 'passages surlignés') : '') + '</span>' +
      (hits.length ? '<button class="btn" id="hlnext">Passage suivant</button>' : '') +
      '<button class="btn' + (done ? ' on' : ' primary') + '" id="hldone">' + (done ? 'Extrait fait ✓' : 'Extrait fait') + '</button><a class="btn" href="#/programme/' + p.id + '">Retour au programme</a>';
    art.parentNode.insertBefore(bar, art);
    var k = -1;
    var nx = $('#hlnext'); if (nx) nx.addEventListener('click', function () { k = (k + 1) % hits.length; hits[k].scrollIntoView({ block: 'center', behavior: 'smooth' }); hits.forEach(function (e) { e.classList.remove('hlcur'); }); hits[k].classList.add('hlcur'); });
    $('#hldone').addEventListener('click', function () { mem.progDone = mem.progDone || {}; if (mem.progDone[key]) delete mem.progDone[key]; else mem.progDone[key] = today(); save(); this.textContent = mem.progDone[key] ? 'Extrait fait ✓' : 'Extrait fait'; this.classList.toggle('primary', !mem.progDone[key]); this.classList.toggle('on', !!mem.progDone[key]); });
    return target || (hits[0] || null);
  }

  /* ------------------------------------------------------------------ routeur */
  function parseRoute() {
    var h = location.hash.replace(/^#\/?/, ''), q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var parts = h.split('/'), params = {};
    q.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return { name: parts[0] || '', arg: parts[1], params: params };
  }
  function route() {
    var r = parseRoute();
    app.classList.remove('menu');
    if (r.name !== 'revision') session = null;
    if (r.name !== 'chiffres') drill = null;
    if (r.name !== 'qcm') quiz = null;
    if (r.name !== 'sujet') clearInterval(sujTimer);
    if (r.name !== 'fiche' && scanFid) closeScans(true);
    if (tts && tts.blocks.some(function (b) { return b.el; })) ttsStop();
    if (r.name !== 'ouvertes') oq = null;
    if (r.name !== 'cas') cst = null;
    if (r.name !== 'oral') { clearInterval(oralTimer); oralStopRec(); if (oral && !r.params.go) oral = null; }
    switch (r.name) {
      case 'fiche': pageFiche(r.arg, r.params.ancre, r.params); break;
      case 'programme': pageProgramme(r.arg); break;
      case 'theme': pageTheme(r.arg); break;
      case 'revision': pageRevision(r.params); break;
      case 'chiffres': pageChiffres(r.params); break;
      case 'recherche': pageSearch(r.params.q); break;
      case 'a-verifier': pageVerif(r.params); break;
      case 'qcm': pageQcm(r.params); break;
      case 'ouvertes': pageOuvertes(r.params); break;
      case 'cas': if (r.arg) pageCas(r.arg); else pageCasList(r.params); break;
      case 'defi': pageDefi(); break;
      case 'oral': pageOral(r.params); break;
      case 'carte': pageCarte(r.arg); break;
      case 'examen': pageExamen(r.params); break;
      case 'sujets': pageSujets(r.params); break;
      case 'sujet': pageSujet(r.arg, r.params); break;
      case 'erreurs': pageErreurs(); break;
      case 'stats': pageStats(); break;
      case 'pdf': pagePdf(); break;
      case 'planning': pagePlanning(); break;
      case 'donnees': pageData(r.params); break;
      default: pageToday();
    }
    renderSide(r);
    var titles = { fiche: r.arg && F[r.arg] ? F[r.arg].title : '', revision: 'Révision', chiffres: 'Chiffres', recherche: 'Recherche', 'a-verifier': 'À vérifier', planning: 'Planning', donnees: 'Réglages', qcm: 'QCM', ouvertes: 'Questions ouvertes', cas: 'Cas cliniques', defi: 'Défi du jour', oral: 'Oral blanc', carte: 'Carte mentale', examen: 'Examen blanc', sujets: 'Sujets rédactionnels', sujet: 'Sujet', erreurs: 'Carnet d’erreurs', stats: 'Statistiques', pdf: 'PDF', programme: 'Programme' };
    document.title = (titles[r.name] ? titles[r.name] + ' – ' : '') + 'Révision DEMS';
    if (r.name !== 'fiche' && r.name !== 'revision' && r.name !== 'chiffres') window.scrollTo(0, 0);
  }



  /* ================================================================== QUESTIONS OUVERTES (réponse écrite ou dictée) */
  var OUV = {}, OBYF = {};
  (D.ouvertes || []).forEach(function (o) { OUV[o.id] = o; (OBYF[o.f] = OBYF[o.f] || []).push(o.id); });
  var TYPEL = { courte: 'Question courte', moyenne: 'Question moyenne', longue: 'Question longue' };
  function ouvPool(s, ty) {
    var out = [];
    mem.ouv = mem.ouv || {};
    if (s === 'erreurs') out = Object.keys(mem.ouv).filter(function (id) { return OUV[id] && mem.ouv[id].last < .6; });
    else if (s && s.indexOf('p:') === 0) { var pp = parseP(s); out = pp.p ? progOuv(pp.p, pp.d) : []; }
    else scopeFiches(s).forEach(function (f) { out = out.concat(OBYF[f] || []); });
    if (ty && ty !== 'toutes') out = out.filter(function (id) { return OUV[id].type === ty; });
    return out;
  }
  function progOuv(p, d) { var out = []; progItems(p, d).forEach(function (it) { (OBYF[it.f] || []).forEach(function (id) { var o = OUV[id]; if (out.indexOf(id) < 0 && itemOk(p, it, o.q + ' ' + o.reponse)) out.push(id); }); }); return out; }
  // comparaison tolérante de la réponse (écrite ou dictée) avec les mots-clés de chaque point
  function normAns(s) { return ' ' + normalize(String(s)).replace(/pour ?cents?/g, '%').replace(/(\d),(\d)/g, '$1.$2').replace(/[’']/g, ' ').replace(/[^a-z0-9%.\/+\-<>=µ ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function hasMot(ans, m) {
    var n = normAns(m).trim(); if (!n) return false;
    if (/^[0-9.]+$/.test(n)) return new RegExp('(^|[^0-9.])' + n.replace(/\./g, '\\.') + '([^0-9]|$)').test(ans);
    if (ans.indexOf(n) >= 0 || ans.replace(/ /g, '').indexOf(n.replace(/ /g, '')) >= 0) return true;
    // mot isolé : on tolère une autre terminaison (hydrate / hydratation, obstructif / obstruction)
    if (/^[a-z]{5,}$/.test(n)) return ans.split(' ').some(function (w) { var k = 0; while (k < w.length && k < n.length && w[k] === n[k]) k++; return k >= 5 && k >= Math.min(w.length, n.length) - 2; });
    return false;
  }
  function pointHit(ans, pt) { return pt.mots.some(function (m) { return hasMot(ans, m); }); }
  function fmtAnswer(txt) {
    var h = '', inList = false;
    String(txt).split(/\n+/).forEach(function (l) {
      l = l.trim(); if (!l) return;
      if (/^[-•–]\s+/.test(l)) { if (!inList) { h += '<ul>'; inList = true; } h += '<li>' + qt(l.replace(/^[-•–]\s+/, '')) + '</li>'; return; }
      if (inList) { h += '</ul>'; inList = false; }
      h += /:$/.test(l) && l.length < 90 ? '<p class="ohead">' + qt(l) + '</p>' : '<p>' + qt(l) + '</p>';
    });
    return h + (inList ? '</ul>' : '');
  }
  var oq = null;
  function pageOuvertes(params) {
    var s = params.s, go = params.go, key = s + '|' + (params.t || '') + '|' + (params.n || '');
    if (s && go && (!oq || oq.key !== key)) {
      var pool = shuffle(ouvPool(s, params.t)), n = params.n === 'tout' ? pool.length : Math.min(pool.length, +(params.n || 10));
      oq = { key: key, scope: s, list: pool.slice(0, n), i: 0, shown: false, ans: '', res: [] };
    }
    if (!oq || !s || !go) return ouvConfig(params);
    renderOuv();
  }
  function ouvConfig(params) {
    var learnedN = learnedFiches().length, errN = ouvPool('erreurs').length;
    var h = '<div class="page"><h1 class="title">Questions ouvertes</h1><p class="lede">' + plural(D.ouvertes.length, 'question') + ' à réponse rédigée : courtes (une ligne), moyennes (un paragraphe) et longues (une mini-rédaction). Répondez par écrit ou à voix haute, puis comparez à la réponse attendue : les points clés que vous avez cités sont cochés automatiquement.</p>';
    h += '<div class="panel"><div class="grid2"><label class="field"><b>Sur quoi ?</b>' + scopeSelect('os', params.s || (learnedN ? 'apprises' : 'tout')) + '</label>' +
      '<label class="field"><b>Longueur</b><select class="field-in" id="ot"><option value="toutes">Toutes</option><option value="courte">Courtes</option><option value="moyenne">Moyennes</option><option value="longue">Longues</option></select></label>' +
      '<label class="field"><b>Combien ?</b><select class="field-in" id="on"><option>5</option><option selected>10</option><option>20</option><option value="tout">Tout</option></select></label></div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn primary" id="ogo">Commencer</button><button class="btn" id="olisten">Mode écoute</button><span class="muted small" id="ocount"></span></div>';
    h += '<p class="small muted" style="margin:8px 0 0">Mode écoute : le site lit la question, vous laisse le temps de répondre dans votre tête, puis lit la réponse attendue. Pratique dans les transports.</p></div>';
    if (errN) h += '<div class="row" style="margin-top:14px"><a class="btn" href="#/ouvertes?s=erreurs&n=tout&go=1">Refaire mes ' + plural(errN, 'question ratée', 'questions ratées') + ' (moins de 60 %)</a></div>';
    h += '<h2 class="sec">Par thème</h2><table class="plain"><thead><tr><th>Thème</th><th class="n">Questions</th><th class="n">Faites</th><th class="n">Score moyen</th><th></th></tr></thead><tbody>';
    D.cats.forEach(function (c) {
      c.themes.forEach(function (t) {
        var ids = ouvPool('t:' + t.id); if (!ids.length) return;
        var done = ids.filter(function (id) { return mem.ouv[id]; }), avg = done.length ? Math.round(100 * done.reduce(function (a, id) { return a + mem.ouv[id].last; }, 0) / done.length) + ' %' : '–';
        h += '<tr><td>' + esc(t.name) + '</td><td class="n">' + ids.length + '</td><td class="n">' + done.length + '</td><td class="n">' + avg + '</td><td><a href="#/ouvertes?s=t:' + t.id + '&n=10&go=1">10 questions</a></td></tr>';
      });
    });
    main.innerHTML = h + '</tbody></table></div>';
    function upd() { $('#ocount').textContent = plural(ouvPool($('#os').value, $('#ot').value).length, 'question disponible', 'questions disponibles') + '.'; }
    ['os', 'ot'].forEach(function (id) { $('#' + id).addEventListener('change', upd); }); upd();
    $('#ogo').addEventListener('click', function () { oq = null; location.hash = '#/ouvertes?s=' + encodeURIComponent($('#os').value) + '&t=' + $('#ot').value + '&n=' + $('#on').value + '&go=1'; });
    $('#olisten').addEventListener('click', function () {
      var ids = shuffle(ouvPool($('#os').value, $('#ot').value)); var n = $('#on').value === 'tout' ? ids.length : +$('#on').value;
      ttsOpen(qaBlocks(ids.slice(0, n).map(function (id) { var o = OUV[id]; return { q: o.q, a: o.reponse, wait: Math.min(20, 4 + 2 * (o.duree || 2)), label: TYPEL[o.type] + ' : ' + F[o.f].title }; })), 'Mode écoute : questions ouvertes');
    });
  }
  function renderOuv() {
    var z = oq, h = '<div class="page"><h1 class="title">Questions ouvertes : ' + esc(scopeLabel(z.scope)) + '</h1>';
    if (!z.list.length) { main.innerHTML = h + '<div class="empty">Aucune question ouverte dans cette sélection pour l’instant. <a href="#/ouvertes">Choisir une autre sélection</a></div></div>'; return; }
    if (z.i >= z.list.length) return ouvEnd();
    var o = OUV[z.list[z.i]];
    h += '<div class="muted small">' + (z.i + 1) + ' sur ' + z.list.length + (z.res.length ? ', score moyen ' + Math.round(100 * z.res.reduce(function (a, b) { return a + b; }, 0) / z.res.length) + ' %' : '') + '</div><div class="progress"><span style="width:' + Math.round(100 * z.i / z.list.length) + '%"></span></div>';
    h += '<div class="card ouv"><div class="src"><a href="' + link(o.f) + '">' + F[o.f].th + '</a><span class="muted">, ' + TYPEL[o.type].toLowerCase() + ', environ ' + plural(o.duree || 2, 'minute') + '</span></div>';
    h += '<div class="q">' + qt(o.q) + '</div>';
    if (!z.shown) {
      h += '<textarea class="draft" id="oans" placeholder="Votre réponse, écrite ou dictée…">' + esc(z.ans) + '</textarea>';
      h += '<div class="row"><button class="btn" id="odict">Dicter ma réponse</button><button class="btn" id="oread">Écouter la question</button><span class="status" id="odst"></span></div>';
      h += '<div class="row actions"><button class="btn primary" id="oshow">Voir la réponse attendue</button><button class="btn" id="oskip">Passer</button></div>';
    } else {
      var ans = normAns(z.ans), hits = o.points.map(function (pt) { return pointHit(ans, pt); });
      if (z.ans.trim()) h += '<div class="oyours"><b>Votre réponse</b><p>' + esc(z.ans).replace(/\n/g, '<br>') + '</p></div>';
      h += '<div class="omodel"><div class="ohd"><b>Réponse attendue</b><button class="linkbtn" id="oreadans">Écouter</button></div>' + fmtAnswer(o.reponse) + '</div>';
      h += '<div class="opoints"><b>Points clés</b> <span class="muted small" id="oscore"></span><p class="small muted">' + (z.ans.trim() ? 'Cochés automatiquement quand vos mots les citent : corrigez si besoin.' : 'Cochez ceux que vous aviez en tête.') + '</p><ul>' +
        o.points.map(function (pt, i) { return '<li><label><input type="checkbox" data-i="' + i + '"' + (hits[i] ? ' checked' : '') + '> ' + qt(pt.p) + '</label></li>'; }).join('') + '</ul></div>';
      h += '<div class="row actions"><button class="btn primary" id="onext">' + (z.i + 1 < z.list.length ? 'Question suivante' : 'Terminer') + '</button></div>';
    }
    main.innerHTML = h + '</div></div>';
    if (!z.shown) {
      var ta = $('#oans'); ta.addEventListener('input', function () { z.ans = ta.value; });
      var stopD = attachDictation(ta, $('#odict'), $('#odst'));
      $('#oread').addEventListener('click', function () { ttsOpen([{ text: o.q }], 'Question'); });
      $('#oshow').addEventListener('click', function () { if (stopD) stopD(); z.ans = ta.value; z.shown = true; renderOuv(); });
      $('#oskip').addEventListener('click', function () { if (stopD) stopD(); z.i++; z.ans = ''; z.shown = false; renderOuv(); });
      ta.focus();
    } else {
      var upd = function () { var c = $$('.opoints input:checked').length; $('#oscore').textContent = c + ' sur ' + o.points.length + ' (' + Math.round(100 * c / o.points.length) + ' %)'; };
      $$('.opoints input').forEach(function (cb) { cb.addEventListener('change', upd); }); upd();
      $('#oreadans').addEventListener('click', function () { ttsOpen([{ text: 'Réponse attendue. ' + o.reponse }], 'Réponse attendue'); });
      $('#onext').addEventListener('click', function () {
        var sc = $$('.opoints input:checked').length / o.points.length, k = mem.ouv[o.id] || { n: 0, best: 0 };
        k.n++; k.last = sc; k.best = Math.max(k.best, sc); k.d = today(); mem.ouv[o.id] = k; logToday('ouv'); save();
        z.res.push(sc); z.i++; z.ans = ''; z.shown = false; ttsStop(); renderOuv(); window.scrollTo(0, 0);
      });
    }
  }
  function ouvEnd() {
    var z = oq, avg = z.res.length ? Math.round(100 * z.res.reduce(function (a, b) { return a + b; }, 0) / z.res.length) : 0;
    var h = '<div class="page"><h1 class="title">Questions ouvertes : bilan</h1><p class="lede">' + plural(z.res.length, 'question corrigée', 'questions corrigées') + (z.res.length ? ', ' + avg + ' % des points clés retrouvés en moyenne.' : '.') + '</p>';
    h += '<div class="list">' + z.list.map(function (id, i) { var o = OUV[id], sc = (mem.ouv[id] || {}).last; return '<div class="it"><span class="num small">' + (sc === undefined ? '–' : Math.round(100 * sc) + ' %') + '</span><div><span class="ttl">' + qt(o.q) + '</span><div class="small muted">' + F[o.f].title + '</div></div></div>'; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:16px"><a class="btn primary" href="#/ouvertes">Nouvelle série</a>' + (ouvPool('erreurs').length ? '<a class="btn" href="#/ouvertes?s=erreurs&n=tout&go=1">Refaire les questions sous 60 %</a>' : '') + '</div>';
    main.innerHTML = h + '</div>'; oq = null;
  }

  /* ------------------------------------------------------------------ dictée vocale (reconnaissance intégrée au navigateur) */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function attachDictation(ta, btn, st) {
    if (!btn) return null;
    if (!SR) { btn.disabled = true; btn.title = 'Dictée indisponible dans ce navigateur'; if (st) st.textContent = 'Dictée vocale : utilisez Chrome, Edge ou Safari.'; return null; }
    var rec = null, on = false, base = '', label = btn.textContent;
    btn.addEventListener('click', function () {
      if (on) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
      base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
      rec.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; ta.value = base + t; ta.dispatchEvent(new Event('input')); ta.scrollTop = ta.scrollHeight; };
      rec.onerror = function (e) { if (st) st.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro refusé : autorisez-le dans le navigateur.' : e.error === 'network' ? 'La dictée a besoin d’une connexion internet.' : e.error === 'no-speech' ? 'Aucune parole détectée.' : 'Dictée interrompue.'; };
      rec.onend = function () { on = false; btn.textContent = label; btn.classList.remove('on'); if (st && st.textContent === 'Je vous écoute… parlez normalement.') st.textContent = ''; };
      try { rec.start(); } catch (err) { if (st) st.textContent = 'Dictée impossible ici.'; return; }
      on = true; btn.textContent = 'Arrêter la dictée'; btn.classList.add('on'); if (st) st.textContent = 'Je vous écoute… parlez normalement.';
    });
    return function () { if (on && rec) rec.stop(); };
  }

  /* ------------------------------------------------------------------ lecture à voix haute (synthèse vocale du navigateur, hors ligne) */
  var SYN = window.speechSynthesis, tts = null, ttsVoices = [];
  var ELEM = { Tc: 'technétium', F: 'fluor', I: 'iode', In: 'indium', Tl: 'thallium', Ga: 'gallium', Ge: 'germanium', Lu: 'lutécium', Y: 'yttrium', Ra: 'radium', Sm: 'samarium', Sr: 'strontium', Cr: 'chrome', Kr: 'krypton', Xe: 'xénon', C: 'carbone', N: 'azote', O: 'oxygène', Rb: 'rubidium', Cu: 'cuivre', Ac: 'actinium', Tb: 'terbium', Pb: 'plomb', Re: 'rhénium', Ho: 'holmium', Er: 'erbium', P: 'phosphore', Mo: 'molybdène', Zr: 'zirconium', Bi: 'bismuth', At: 'astate', Co: 'cobalt', Se: 'sélénium', Fe: 'fer', Na: 'sodium', K: 'potassium', Ba: 'baryum', Cs: 'césium', Gd: 'gadolinium', Te: 'tellure', Zn: 'zinc', Br: 'brome', Yb: 'ytterbium', Dy: 'dysprosium', Ca: 'calcium', Sn: 'étain', Ru: 'ruthénium', Rh: 'rhodium', U: 'uranium' };
  var UNITS = [[/MBq\s*\/\s*kg/g, 'mégabecquerels par kilo'], [/GBq/g, 'gigabecquerels'], [/MBq/g, 'mégabecquerels'], [/kBq/g, 'kilobecquerels'], [/mCi/g, 'millicuries'], [/µCi/g, 'microcuries'],
    [/keV/g, 'kilo-électronvolts'], [/MeV/g, 'méga-électronvolts'], [/µSv\s*\/\s*MBq/g, 'microsieverts par mégabecquerel'], [/mSv/g, 'millisieverts'], [/µSv/g, 'microsieverts'], [/mGy/g, 'milligrays'],
    [/mg\s*\/\s*kg/g, 'milligrammes par kilo'], [/ml\s*\/\s*min\s*\/\s*1[,.]73\s*m[²2]/gi, 'millilitres par minute pour 1,73 mètre carré'], [/ml\s*\/\s*min/gi, 'millilitres par minute'], [/ml\s*\/\s*kg/gi, 'millilitres par kilo'],
    [/(\d)\s*ml\b/gi, '$1 millilitres'], [/(\d)\s*mg\b/g, '$1 milligrammes'], [/(\d)\s*µg\b/g, '$1 microgrammes'], [/(\d)\s*kg\b/g, '$1 kilos'], [/(\d)\s*cm\b/g, '$1 centimètres'], [/(\d)\s*mm\b/g, '$1 millimètres'],
    [/(\d)\s*Gy\b/g, '$1 grays'], [/(\d)\s*(min|mn)\b\.?/g, '$1 minutes'], [/(\d)\s*h\b/g, '$1 heures'], [/(\d)\s*j\b/g, '$1 jours'], [/(\d)\s*s\b/g, '$1 secondes'], [/(\d)\s*°C/g, '$1 degrés'],
    [/T\s*½|T1\/2/g, 'demi-vie'], [/½/g, 'demi'], [/×/g, ' fois '], [/[→⇒➔⟶]/g, ', '], [/≥/g, ' supérieur ou égal à '], [/≤/g, ' inférieur ou égal à '], [/>/g, ' supérieur à '], [/</g, ' inférieur à '],
    [/±/g, ' plus ou moins '], [/[≈~]/g, ' environ '], [/↑/g, ' augmenté '], [/↓/g, ' diminué '], [/\+\+\+?/g, ''], [/β\s*[-−⁻]/g, 'bêta moins'], [/β\s*\+|β⁺/g, 'bêta plus'], [/β/g, 'bêta'], [/α/g, 'alpha'], [/γ/g, 'gamma'],
[/²/g, ' au carré'], [/³/g, ' cube'], [/(\d)\s*[–-]\s*(\d)/g, '$1 à $2'], [/\bmin\.\s/g, 'minimum '], [/\bmax\.\s/g, 'maximum '], [/\bcf\.\s/g, 'voir '],
        [/\bet\s*\/\s*ou\b/g, 'et ou'], [/\bvs\.?\b/g, 'versus'], [/\bcf\.?\s/g, 'voir '], [/\bréf\.\s*$/g, '']];
  var ISO_RX = /\b(\d{1,3})(m?)(Tc|In|Ga|Ge|Lu|Tl|Xe|Kr|Rb|Sr|Sm|Re|Ra|Ac|Bi|Er|Cr|Co|Cu|Zr|Mo|Te|Tb|At|Ho|Cs|Ba|Gd|Se|Fe|Na|Ca|Br|Zn|Ru|Rh|Pb|Sn|Yb|Dy|Y|I|F|C|N|O|P|K|U)(?![a-z])/g;
  function speakable(t) {
    t = String(t).replace(/\s+/g, ' ').replace(/^\s*([IVX]+|[A-H]|\d+)\s*[.)]\s+/, '');
    t = t.replace(ISO_RX, function (_, n, m, el) { return (ELEM[el] || el) + ' ' + n + (m ? ' m ' : ' '); });
    UNITS.forEach(function (u) { t = t.replace(u[0], u[1]); });
    return t.replace(/\s+/g, ' ').trim();
  }
  function chunks(t) { // morceaux courts : Chrome coupe les énoncés trop longs
    var out = [], parts = t.match(/[^.;:!?]+[.;:!?]*\s*/g) || [t], cur = '';
    parts.forEach(function (p) { if ((cur + p).length > 220 && cur) { out.push(cur); cur = ''; } cur += p; });
    if (cur.trim()) out.push(cur); return out;
  }
  function loadVoices() { if (!SYN) return; ttsVoices = SYN.getVoices().filter(function (v) { return /^fr/i.test(v.lang); }); }
  if (SYN) { loadVoices(); if (SYN.addEventListener) SYN.addEventListener('voiceschanged', function () { loadVoices(); var sel = $('#pvoice'); if (sel && tts) sel.innerHTML = voiceOptions(); }); }
  function bestVoice() {
    var want = (mem && mem.voice) || '', v = ttsVoices.filter(function (x) { return x.name === want; })[0];
    if (v) return v;
    var pref = [/natural|online|neural/i, /google/i, /amélie|amelie|thomas|denise|henri|audrey|marie/i];
    for (var i = 0; i < pref.length; i++) { var m = ttsVoices.filter(function (x) { return pref[i].test(x.name) && /fr-FR/i.test(x.lang); })[0]; if (m) return m; }
    return ttsVoices.filter(function (x) { return /fr-FR/i.test(x.lang); })[0] || ttsVoices[0] || null;
  }
  function voiceOptions() { var b = bestVoice(); return ttsVoices.map(function (v) { return '<option' + (b && v.name === b.name ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') || '<option>Voix française du système</option>'; }
  // blocs lisibles d'une fiche : titres, paragraphes, éléments de liste, lignes de tableau (hors « Testez-vous » et sources)
  function articleBlocks(art, only) {
    var out = [];
    $$('h2, h3, h4, p, li, tr', art).forEach(function (el) {
      if (el.closest('.autotest') || el.closest('figure') || el.classList.contains('sources')) return;
      if (only === 'cle' && !el.closest('.cle')) return;
      if (el.tagName === 'LI' && el.querySelector('li')) { var c = el.cloneNode(true); $$('ul, ol', c).forEach(function (x) { x.remove(); }); if (c.textContent.trim()) out.push({ el: el, text: c.textContent }); return; }
      if (el.tagName === 'P' && el.closest('li, td, th')) return;
      if (el.tagName === 'TR') {
        var tb = el.closest('table'), hd = $$('thead th', tb).map(function (x) { return x.textContent.trim(); }), cells = $$('td, th', el).map(function (x) { return x.textContent.trim(); });
        if (el.parentNode.tagName === 'THEAD') return out.push({ el: el, text: 'Tableau : ' + cells.join(', ') + '.' });
        return out.push({ el: el, text: cells.map(function (c, i) { return i && hd[i] && hd.length === cells.length ? hd[i] + ' : ' + c : c; }).join('. ') });
      }
      var txt = el.textContent; if (el.querySelector && el.querySelector('.chk')) txt = txt.replace(/^/, '');
      if (txt.trim()) out.push({ el: el, text: txt });
    });
    return out;
  }
  function qaBlocks(list) { var out = []; list.forEach(function (x, i) { out.push({ text: 'Question ' + (i + 1) + '. ' + x.q, label: x.label, wait: x.wait || 6 }); out.push({ text: 'Réponse. ' + x.a, label: x.label }); }); return out; }
  function ttsOpen(blocks, title, start) {
    if (!SYN || !window.SpeechSynthesisUtterance) { alertBar('La lecture à voix haute n’est pas disponible dans ce navigateur.'); return; }
    ttsStop(true);
    tts = { blocks: blocks, i: start || 0, title: title, playing: true, token: 0, rate: (mem && mem.rate) || 1 };
    var bar = $('#player');
    bar.innerHTML = '<button class="btn primary" id="pplay">Pause</button><button class="btn" id="pprev" aria-label="Passage précédent">Précédent</button><button class="btn" id="pnext" aria-label="Passage suivant">Suivant</button>' +
      '<span class="pinfo"><b id="ptitle"></b><span id="ppos" class="num"></span></span>' +
      '<label class="psel">Vitesse <select id="prate">' + [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6].map(function (r) { return '<option value="' + r + '"' + (r === tts.rate ? ' selected' : '') + '>' + String(r).replace('.', ',') + '×</option>'; }).join('') + '</select></label>' +
      '<label class="psel">Voix <select id="pvoice">' + voiceOptions() + '</select></label><button class="btn" id="pclose">Fermer</button>';
    bar.hidden = false; document.body.classList.add('playing');
    $('#pplay').onclick = function () { if (!tts) return; if (tts.playing) { tts.playing = false; tts.token++; SYN.cancel(); this.textContent = 'Lire'; } else { tts.playing = true; this.textContent = 'Pause'; ttsSpeak(tts.i); } };
    $('#pprev').onclick = function () { if (tts) ttsJump(Math.max(0, tts.i - 1)); };
    $('#pnext').onclick = function () { if (tts) ttsJump(Math.min(tts.blocks.length - 1, tts.i + 1)); };
    $('#prate').onchange = function () { tts.rate = +this.value; if (mem) { mem.rate = tts.rate; save(); } if (tts.playing) ttsSpeak(tts.i); };
    $('#pvoice').onchange = function () { if (mem) { mem.voice = this.value; save(); } if (tts.playing) ttsSpeak(tts.i); };
    $('#pclose').onclick = function () { ttsStop(); };
    ttsSpeak(tts.i);
  }
  function ttsJump(i) { if (!tts) return; tts.playing = true; $('#pplay').textContent = 'Pause'; ttsSpeak(i); }
  function ttsSpeak(i) {
    if (!tts) return;
    SYN.cancel(); var my = ++tts.token;
    $$('.speaking').forEach(function (e) { e.classList.remove('speaking'); });
    if (i >= tts.blocks.length) { tts.playing = false; $('#pplay').textContent = 'Lire'; tts.i = 0; $('#ppos').textContent = 'terminé'; return; }
    tts.i = i; var b = tts.blocks[i];
    $('#ptitle').textContent = b.label || tts.title || ''; $('#ppos').textContent = (i + 1) + ' / ' + tts.blocks.length;
    if (b.el) { b.el.classList.add('speaking'); var r = b.el.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) b.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    var parts = chunks(speakable(b.text)), k = 0, v = bestVoice();
    function next() {
      if (!tts || my !== tts.token) return;
      if (k >= parts.length) { if (b.wait) setTimeout(function () { if (tts && my === tts.token) ttsSpeak(i + 1); }, b.wait * 1000); else ttsSpeak(i + 1); return; }
      var u = new SpeechSynthesisUtterance(parts[k++]); u.lang = v ? v.lang : 'fr-FR'; if (v) u.voice = v; u.rate = tts.rate;
      u.onend = next; u.onerror = function (e) { if (e.error !== 'interrupted' && e.error !== 'canceled') next(); };
      SYN.speak(u);
    }
    next();
  }
  function ttsStop(keep) { if (SYN) SYN.cancel(); if (tts) tts.token++; tts = null; $$('.speaking').forEach(function (e) { e.classList.remove('speaking'); }); if (!keep) { var bar = $('#player'); if (bar) { bar.hidden = true; bar.innerHTML = ''; } document.body.classList.remove('playing'); } }
  function alertBar(t) { var bar = $('#player'); bar.innerHTML = '<span class="pinfo">' + esc(t) + '</span><button class="btn" id="pclose">Fermer</button>'; bar.hidden = false; $('#pclose').onclick = function () { bar.hidden = true; }; }
  // lecture d'une fiche : toute la fiche, l'encadré « À retenir » seul, ou les questions-réponses
  function ficheAudio(fid, mode, art) {
    var f = F[fid];
    if (mode === 'qr') {
      var list = F[fid].cards.map(function (cid) { return { q: strip(CARD[cid].q), a: strip(CARD[cid].a), label: f.title, wait: 6 }; })
        .concat((OBYF[fid] || []).map(function (id) { var o = OUV[id]; return { q: o.q, a: o.reponse, label: f.title, wait: Math.min(20, 4 + 2 * (o.duree || 2)) }; }));
      return ttsOpen(qaBlocks(list), f.title + ' : questions');
    }
    var bl = articleBlocks(art, mode); bl.unshift({ text: (mode === 'cle' ? 'À retenir. ' : '') + strip(f.th) + '.' });
    ttsOpen(bl, f.title);
  }
  // playlist : les encadrés « À retenir » de plusieurs fiches (programme du jour)
  function cleBlocks(fids) {
    var out = [], tmp = document.createElement('div');
    fids.forEach(function (fid) {
      tmp.innerHTML = F[fid].html; var cle = $('.cle', tmp); if (!cle) return;
      out.push({ text: 'Fiche : ' + strip(F[fid].th) + '.', label: F[fid].title });
      $$('li', cle).forEach(function (li) { if (!li.querySelector('li')) out.push({ text: li.textContent, label: F[fid].title }); });
    });
    return out;
  }


  /* ================================================================== CAS CLINIQUES PROGRESSIFS */
  var CAS = {}; (D.cas || []).forEach(function (c) { CAS[c.id] = c; });
  var cst = null; // cas en cours
  function casFor(fids) { return (D.cas || []).filter(function (c) { return c.fids.some(function (f) { return fids.indexOf(f) >= 0; }); }); }
  function themeOfCas(c) { var f = F[c.fids[0]]; return f ? THEMES[f.theme] : null; }
  function pageCasList(params) {
    mem.cas = mem.cas || {};
    var list = D.cas || [], fil = params.t || '';
    if (params.p) { var pp = parseP('p:' + params.p); if (pp.p) { var fids = []; progItems(pp.p, pp.d).forEach(function (it) { fids.push(it.f); }); list = casFor(fids); } }
    else if (fil) list = list.filter(function (c) { return c.theme === fil; });
    var themes = {}; (D.cas || []).forEach(function (c) { themes[c.theme] = (themes[c.theme] || 0) + 1; });
    var h = '<div class="page"><h1 class="title">Cas cliniques</h1><p class="lede">' + plural((D.cas || []).length, 'cas progressif', 'cas progressifs') + ' tirés de vos fiches. Le dossier se dévoile étape par étape : répondez à chaque question avant de voir la suite, comme à l’examen.</p>';
    if (!(D.cas || []).length) return (main.innerHTML = h + '<div class="empty">Les cas cliniques sont en cours de rédaction.</div></div>');
    h += '<div class="tabs"><a class="btn' + (!fil && !params.p ? ' on' : '') + '" href="#/cas">Tous</a>' + Object.keys(themes).map(function (t) { var th = THEMES[t]; return '<a class="btn' + (fil === t ? ' on' : '') + '" href="#/cas?t=' + t + '">' + esc(th ? th.short : t) + ' (' + themes[t] + ')</a>'; }).join('') + '</div>';
    h += '<div class="list">' + list.map(function (c) {
      var st = mem.cas[c.id];
      return '<div class="it"><span class="num small">' + (st ? Math.round(100 * st.best) + ' %' : '–') + '</span><div><a class="ttl" href="#/cas/' + c.id + '">' + qt(c.titre) + '</a><div class="small muted">' + plural(c.etapes.length, 'étape') + ', niveau ' + c.niveau + ', ' + c.fids.slice(0, 3).map(function (f) { return F[f].title; }).join(' ; ') + '</div></div></div>';
    }).join('') + '</div></div>';
    main.innerHTML = h;
  }
  function pageCas(id) {
    var c = CAS[id]; if (!c) return pageCasList({});
    mem.cas = mem.cas || {};
    if (!cst || cst.id !== id) cst = { id: id, i: 0, done: false, sel: [], ans: '', res: [], hist: [] };
    var z = cst, h = '<div class="page"><div class="crumbs"><a href="#/cas">Cas cliniques</a>' + (themeOfCas(c) ? ' / ' + esc(themeOfCas(c).short) : '') + '</div><h1 class="title">' + qt(c.titre) + '</h1>';
    h += '<div class="muted small">Étape ' + Math.min(z.i + 1, c.etapes.length) + ' sur ' + c.etapes.length + '</div><div class="progress"><span style="width:' + Math.round(100 * z.i / c.etapes.length) + '%"></span></div>';
    // dossier déjà dévoilé
    h += '<div class="dossier">' + z.hist.map(function (x, k) { var e = c.etapes[k]; return '<div class="dstep"><p>' + qt(e.texte) + '</p><p class="dq"><b>' + qt(e.q) + '</b></p><p class="dres ' + (x.sc >= .99 ? 'good' : x.sc > 0 ? 'half' : 'bad') + '">' + x.txt + '</p></div>'; }).join('') + '</div>';
    if (z.i >= c.etapes.length) {
      var avg = z.res.reduce(function (a, b) { return a + b; }, 0) / z.res.length;
      h += '<div class="card"><h2 style="margin:0 0 6px">Ce qu’il fallait retenir</h2><div class="omodel">' + fmtAnswer(c.synthese) + '</div><p><b>Score : ' + Math.round(100 * avg) + ' %</b></p>' +
        '<div class="row">' + c.fids.map(function (f) { return '<a class="btn" href="' + link(f) + '">' + esc(F[f].title.length > 50 ? F[f].title.slice(0, 48) + '…' : F[f].title) + '</a>'; }).join('') + '</div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="cagain">Refaire ce cas</button><a class="btn" href="#/cas' + (c.theme ? '?t=' + c.theme : '') + '">Autres cas</a></div></div>';
      main.innerHTML = h + '</div>';
      if (!z.done) { z.done = true; var k = mem.cas[id] || { n: 0, best: 0 }; k.n++; k.last = avg; k.best = Math.max(k.best, avg); k.d = today(); mem.cas[id] = k; logToday('cas'); save(); }
      $('#cagain').addEventListener('click', function () { cst = null; pageCas(id); });
      return;
    }
    var e = c.etapes[z.i];
    h += '<div class="card cas"><div class="newinfo">' + qt(e.texte) + '</div><div class="q">' + qt(e.q) + '</div>';
    if (e.type === 'qcm') {
      var fb = z.shown;
      h += '<div class="muted small">' + (e.bonnes.length > 1 ? 'Plusieurs réponses possibles' : 'Une seule réponse') + '</div><ol class="opts">' + e.choix.map(function (ch, i) {
        var on = z.sel.indexOf(i) >= 0, cls = on ? ' on' : '';
        if (fb) { var good = e.bonnes.indexOf(i) >= 0; cls += good ? (on ? ' ok' : ' miss') : (on ? ' ko' : ''); }
        return '<li><button class="opt' + cls + '" data-o="' + i + '"' + (fb ? ' disabled' : '') + '><span class="let">' + LET[i] + '</span><span>' + qt(ch) + '</span></button></li>';
      }).join('') + '</ol>';
      if (fb) h += '<div class="expl">' + qt(e.explication || '') + '</div>';
    } else {
      if (!z.shown) h += '<textarea class="draft" id="cans" placeholder="Votre réponse, écrite ou dictée…">' + esc(z.ans) + '</textarea><div class="row"><button class="btn" id="cdict">Dicter</button><span class="status" id="cdst"></span></div>';
      else {
        var an = normAns(z.ans), hit = e.points.map(function (pt) { return pointHit(an, pt); });
        if (z.ans.trim()) h += '<div class="oyours"><b>Votre réponse</b><p>' + esc(z.ans).replace(/\n/g, '<br>') + '</p></div>';
        h += '<div class="omodel"><div class="ohd"><b>Réponse attendue</b></div>' + fmtAnswer(e.reponse) + '</div><div class="opoints"><b>Points clés</b> <span class="muted small" id="cscore"></span><ul>' +
          e.points.map(function (pt, i) { return '<li><label><input type="checkbox" data-i="' + i + '"' + (hit[i] ? ' checked' : '') + '> ' + qt(pt.p) + '</label></li>'; }).join('') + '</ul></div>';
      }
    }
    h += '<div class="row actions">' + (z.shown ? '<button class="btn primary" id="cnext">' + (z.i + 1 < c.etapes.length ? 'Étape suivante' : 'Voir la synthèse') + '</button>' : '<button class="btn primary" id="ccheck">Valider</button>') + '</div></div>';
    main.innerHTML = h + '</div>';
    $$('.card.cas button.opt').forEach(function (b) { b.addEventListener('click', function () { var o = +b.dataset.o; if (e.bonnes.length > 1) { var k = z.sel.indexOf(o); if (k >= 0) z.sel.splice(k, 1); else z.sel.push(o); } else z.sel = [o]; pageCas(id); }); });
    var ta = $('#cans'), stopD = null; if (ta) { ta.addEventListener('input', function () { z.ans = ta.value; }); stopD = attachDictation(ta, $('#cdict'), $('#cdst')); }
    var cc = $('#ccheck'); if (cc) cc.addEventListener('click', function () { if (stopD) stopD(); if (ta) z.ans = ta.value; if (e.type === 'qcm' && !z.sel.length) return; z.shown = true; pageCas(id); });
    var up = function () { var n = $$('.opoints input:checked').length, el = $('#cscore'); if (el) el.textContent = n + ' sur ' + e.points.length; };
    $$('.opoints input').forEach(function (cb) { cb.addEventListener('change', up); }); up();
    var cn = $('#cnext'); if (cn) cn.addEventListener('click', function () {
      var sc, txt;
      if (e.type === 'qcm') { sc = scoreQ({ bonnes: e.bonnes, choix: e.choix, type: e.bonnes.length > 1 ? 'multiple' : 'unique' }, z.sel); txt = (sc >= 1 ? 'Juste' : sc > 0 ? 'Presque' : 'Faux') + ' : ' + e.bonnes.map(function (b) { return qt(e.choix[b]); }).join(' ; ') + '.'; }
      else { var n = $$('.opoints input:checked').length; sc = n / e.points.length; txt = n + ' point' + (n > 1 ? 's' : '') + ' clé' + (n > 1 ? 's' : '') + ' sur ' + e.points.length + '.'; }
      z.res.push(sc); z.hist.push({ sc: sc, txt: txt }); z.i++; z.sel = []; z.ans = ''; z.shown = false; pageCas(id); window.scrollTo(0, 0);
    });
  }

  /* ================================================================== DÉFI DU JOUR (15 questions mélangées sur ce qui a été vu) */
  function seeded(seed) { var s = 0; for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function sshuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function defiBuild() {
    var t = today(), rnd = seeded(t + (me ? me.id : '')), seen = learnedFiches();
    if (seen.length < 3) { var fp = featuredProg(); seen = fp ? progItems(fp.p).map(function (it) { return it.f; }) : ORDER.slice(0, 12); }
    var q = [], z = [], o = [];
    seen.forEach(function (f) { (QBYF[f] || []).forEach(function (id) { q.push(id); }); (OBYF[f] || []).forEach(function (id) { if (OUV[id].type === 'courte') o.push(id); }); });
    D.clozes.forEach(function (c) { if (seen.indexOf(c.f) >= 0) z.push(c.id); });
    var err = q.filter(function (id) { return mem.qcm[id] && mem.qcm[id].lastOk === false; }), fresh = q.filter(function (id) { return !mem.qcm[id]; }), old = q.filter(function (id) { return mem.qcm[id] && mem.qcm[id].lastOk; });
    var pick = sshuffle(err, rnd).slice(0, 4); pick = pick.concat(sshuffle(fresh, rnd).slice(0, 8 - pick.length)); if (pick.length < 8) pick = pick.concat(sshuffle(old, rnd).slice(0, 8 - pick.length));
    var list = pick.map(function (id) { return { k: 'q', id: id }; }).concat(sshuffle(z, rnd).slice(0, 4).map(function (id) { return { k: 'z', id: id }; }), sshuffle(o.filter(function (id) { return !(mem.ouv || {})[id] || mem.ouv[id].last < 1; }), rnd).slice(0, 3).map(function (id) { return { k: 'o', id: id }; }));
    return { date: t, list: sshuffle(list, rnd), i: 0, res: [], sel: [], shown: false, ans: '' };
  }
  var ZB = null; function clozeById(id) { if (!ZB) { ZB = {}; D.clozes.forEach(function (c) { ZB[c.id] = c; }); } return ZB[id]; }
  function defiStreak() { var n = 0, d = today(); mem.defi = mem.defi || {}; if (!mem.defi[d]) d = addDays(d, -1); while (mem.defi[d]) { n++; d = addDays(d, -1); } return n; }
  function pageDefi() {
    mem.defi = mem.defi || {};
    if (!mem.defiCur || mem.defiCur.date !== today()) { mem.defiCur = defiBuild(); save(); }
    var z = mem.defiCur, h = '<div class="page"><h1 class="title">Défi du jour</h1>';
    if (!z.list.length) return (main.innerHTML = h + '<div class="empty">Apprenez quelques fiches pour débloquer le défi du jour.</div></div>');
    if (z.i >= z.list.length) {
      var tot = z.res.reduce(function (a, b) { return a + b; }, 0), sc = Math.round(10 * 20 * tot / z.list.length) / 10;
      if (!mem.defi[z.date]) { mem.defi[z.date] = { s: tot, n: z.list.length }; logToday('defi'); save(); }
      var st = defiStreak();
      h += '<div class="card"><div class="big num" style="font-family:var(--read);font-size:3rem;font-weight:600">' + String(sc).replace('.', ',') + ' / 20</div><p>' + (st > 1 ? 'Série en cours : <b>' + st + ' jours</b> d’affilée. ' : '') + 'Revenez demain pour un nouveau défi : il mélange vos erreurs, des questions jamais vues et des chiffres des fiches déjà apprises.</p><div class="row"><a class="btn primary" href="#/">Retour à l’accueil</a><a class="btn" href="#/qcm?s=erreurs&n=tout&go=1">Refaire mes erreurs</a></div></div>';
      return (main.innerHTML = h + '</div>');
    }
    var it = z.list[z.i];
    h += '<div class="muted small">' + (z.i + 1) + ' sur ' + z.list.length + (defiStreak() ? ', série de ' + plural(defiStreak(), 'jour') : '') + '</div><div class="progress"><span style="width:' + Math.round(100 * z.i / z.list.length) + '%"></span></div>';
    var nextBtn = '<div class="row actions"><button class="btn primary" id="dnext">' + (z.i + 1 < z.list.length ? 'Question suivante' : 'Voir mon score') + '</button></div>';
    if (it.k === 'q') {
      var q = QCM[it.id];
      h += qcmCard(q, z, { feedback: z.shown }).replace(/<\/div>\s*$/, '');
      h += z.shown ? '<div class="expl">' + qt(q.explication || '') + '</div>' + nextBtn + '</div>' : '<div class="row actions"><button class="btn primary" id="dcheck">Valider</button></div></div>';
    } else if (it.k === 'z') {
      var c = clozeById(it.id);
      h += '<div class="card cloze"><div class="src"><a href="' + link(c.f) + '">' + F[c.f].th + '</a>' + (c.h ? '<span class="muted">, ' + esc(c.h) + '</span>' : '') + '</div><div class="text">' + qt(c.b) + ' <span class="blank">' + (z.shown ? qt(c.v) : '?') + '</span> ' + qt(c.a) + '</div>';
      h += z.shown ? '<div class="row actions"><button class="btn" data-g="0">Je ne savais pas</button><button class="btn primary" data-g="1">Je savais</button></div></div>' : '<div class="row actions"><button class="btn primary" id="dshow">Afficher la valeur</button></div></div>';
    } else {
      var o = OUV[it.id];
      h += '<div class="card ouv"><div class="src"><a href="' + link(o.f) + '">' + F[o.f].th + '</a><span class="muted">, question courte</span></div><div class="q">' + qt(o.q) + '</div>';
      if (!z.shown) h += '<textarea class="draft" id="dans" placeholder="Votre réponse, écrite ou dictée…">' + esc(z.ans || '') + '</textarea><div class="row"><button class="btn" id="ddict">Dicter</button><span class="status" id="ddst"></span></div><div class="row actions"><button class="btn primary" id="dshow">Voir la réponse</button></div></div>';
      else {
        var an = normAns(z.ans || ''), hit = o.points.map(function (pt) { return pointHit(an, pt); });
        h += '<div class="omodel">' + fmtAnswer(o.reponse) + '</div><div class="opoints"><b>Points clés</b><ul>' + o.points.map(function (pt, i) { return '<li><label><input type="checkbox" data-i="' + i + '"' + (hit[i] ? ' checked' : '') + '> ' + qt(pt.p) + '</label></li>'; }).join('') + '</ul></div>' + nextBtn + '</div>';
      }
    }
    main.innerHTML = h + '</div>';
    function adv(sc) { z.res.push(sc); z.i++; z.sel = []; z.shown = false; z.ans = ''; save(); pageDefi(); window.scrollTo(0, 0); }
    if (it.k === 'q') {
      var q2 = QCM[it.id];
      $$('button.opt').forEach(function (b) { b.addEventListener('click', function () { var o2 = +b.dataset.o; if (q2.type === 'multiple') { var k = z.sel.indexOf(o2); if (k >= 0) z.sel.splice(k, 1); else z.sel.push(o2); } else z.sel = [o2]; pageDefi(); }); });
      var dc = $('#dcheck'); if (dc) dc.addEventListener('click', function () { if (!z.sel.length) return; z.shown = true; z.sc = scoreQ(q2, z.sel); recordQ(it.id, z.sc); save(); pageDefi(); });
      var dn = $('#dnext'); if (dn) dn.addEventListener('click', function () { adv(z.sc || 0); });
    } else if (it.k === 'z') {
      var ds = $('#dshow'); if (ds) ds.addEventListener('click', function () { z.shown = true; pageDefi(); });
      $$('[data-g]').forEach(function (b) { b.addEventListener('click', function () { adv(+b.dataset.g); }); });
    } else {
      var ta = $('#dans'), stopD = null; if (ta) { ta.addEventListener('input', function () { z.ans = ta.value; }); stopD = attachDictation(ta, $('#ddict'), $('#ddst')); }
      var ds2 = $('#dshow'); if (ds2) ds2.addEventListener('click', function () { if (stopD) stopD(); if (ta) z.ans = ta.value; z.shown = true; pageDefi(); });
      var dn2 = $('#dnext'); if (dn2) dn2.addEventListener('click', function () { var o3 = OUV[it.id], sc = $$('.opoints input:checked').length / o3.points.length; mem.ouv = mem.ouv || {}; var k = mem.ouv[o3.id] || { n: 0, best: 0 }; k.n++; k.last = sc; k.best = Math.max(k.best, sc); k.d = today(); mem.ouv[o3.id] = k; adv(sc); });
    }
  }

  /* ================================================================== ORAL BLANC */
  var oral = null;
  function pageOral(params) {
    if (!oral || !params.go) return oralConfig(params);
    oralRender();
  }
  function oralConfig(params) {
    var learnedN = learnedFiches().length;
    var h = '<div class="page"><h1 class="title">Oral blanc</h1><p class="lede">Le site lit la question à voix haute, vous laisse un temps de préparation, puis vous répondez à l’oral, en temps limité. Votre réponse est transcrite ; à la fin, la réponse attendue s’affiche avec les points clés que vous avez cités déjà cochés.</p>';
    h += '<div class="panel"><div class="grid2"><label class="field"><b>Sur quoi ?</b>' + scopeSelect('ors', params.s || (learnedN ? 'apprises' : 'tout')) + '</label>' +
      '<label class="field"><b>Questions</b><select class="field-in" id="orn"><option>3</option><option selected>5</option><option>8</option></select></label>' +
      '<label class="field"><b>Préparation</b><select class="field-in" id="orp"><option value="0">Aucune</option><option value="30">30 secondes</option><option value="60" selected>1 minute</option><option value="120">2 minutes</option></select></label>' +
      '<label class="field"><b>Type</b><select class="field-in" id="ort"><option value="mix">Moyennes et longues</option><option value="moyenne">Moyennes (3 à 6 min)</option><option value="longue">Longues (10 à 20 min)</option><option value="courte">Courtes (1 à 2 min)</option></select></label></div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn primary" id="orgo">Commencer l’oral</button><span class="muted small" id="orcount"></span></div>';
    if (!SR) h += '<p class="small muted">Ce navigateur ne sait pas transcrire la voix : vous pourrez répondre à l’oral, puis cocher vous-même les points clés. Pour la transcription, utilisez Chrome, Edge ou Safari.</p>';
    main.innerHTML = h + '</div></div>';
    function pool() { var t = $('#ort').value; return ouvPool($('#ors').value).filter(function (id) { var ty = OUV[id].type; return t === 'mix' ? ty !== 'courte' : ty === t; }); }
    function upd() { $('#orcount').textContent = plural(pool().length, 'question disponible', 'questions disponibles') + '.'; }
    ['ors', 'ort'].forEach(function (id) { $('#' + id).addEventListener('change', upd); }); upd();
    $('#orgo').addEventListener('click', function () {
      var l = shuffle(pool()).slice(0, +$('#orn').value); if (!l.length) return;
      oral = { list: l, i: 0, prep: +$('#orp').value, phase: 'lecture', txt: '', res: [], spoke: 0 };
      location.hash = '#/oral?go=1';
    });
  }
  var oralTimer = null, oralRec = null;
  function oralStopRec() { if (oralRec) { oralRec.keep = false; try { oralRec.r.stop(); } catch (e) { /* rien */ } } oralRec = null; }
  function oralRender() {
    var z = oral; clearInterval(oralTimer);
    var h = '<div class="page"><h1 class="title">Oral blanc</h1>';
    if (z.i >= z.list.length) {
      oralStopRec(); ttsStop();
      var avg = z.res.length ? Math.round(100 * z.res.reduce(function (a, b) { return a + b; }, 0) / z.res.length) : 0;
      h += '<p class="lede">' + plural(z.res.length, 'question', 'questions') + ', ' + avg + ' % des points clés cités en moyenne, ' + Math.round(z.spoke / 60) + ' min de parole.</p><div class="list">' + z.list.map(function (id, i) { var o = OUV[id]; return '<div class="it"><span class="num small">' + (z.res[i] === undefined ? '–' : Math.round(100 * z.res[i]) + ' %') + '</span><div><span class="ttl">' + qt(o.q) + '</span><div class="small muted">' + F[o.f].title + '</div></div></div>'; }).join('') + '</div><div class="row" style="margin-top:16px"><a class="btn primary" href="#/oral">Nouvel oral</a></div>';
      return (main.innerHTML = h + '</div>');
    }
    var o = OUV[z.list[z.i]], limit = Math.max(60, Math.round((o.duree || 3) * 60));
    h += '<div class="muted small">Question ' + (z.i + 1) + ' sur ' + z.list.length + '</div><div class="progress"><span style="width:' + Math.round(100 * z.i / z.list.length) + '%"></span></div>';
    h += '<div class="card oral"><div class="src"><a href="' + link(o.f) + '">' + F[o.f].th + '</a><span class="muted">, ' + TYPEL[o.type].toLowerCase() + '</span></div><div class="q">' + qt(o.q) + '</div>';
    if (z.phase === 'lecture' || z.phase === 'prep') {
      h += '<div class="orbig"><span class="timer num" id="ortime"></span><span id="orlab"></span></div><div class="row actions"><button class="btn primary" id="orstart">Commencer à parler</button><button class="btn" id="orskip">Passer</button></div>';
    } else if (z.phase === 'parle') {
      h += '<div class="orbig"><span class="timer num" id="ortime"></span><span id="orlab">' + (SR ? 'Parlez : votre réponse s’écrit ci-dessous.' : 'Répondez à voix haute.') + '</span></div><div class="transcript" id="ortx">' + esc(z.txt) + '</div><div class="row actions"><button class="btn primary" id="ordone">J’ai fini</button></div>';
    } else {
      var an = normAns(z.txt), hit = o.points.map(function (pt) { return pointHit(an, pt); });
      if (z.txt.trim()) h += '<div class="oyours"><b>Ce que vous avez dit</b><p>' + esc(z.txt) + '</p></div>';
      h += '<div class="omodel"><div class="ohd"><b>Réponse attendue</b></div>' + fmtAnswer(o.reponse) + '</div><div class="opoints"><b>Points clés</b> <span class="muted small" id="orsc"></span><ul>' + o.points.map(function (pt, i) { return '<li><label><input type="checkbox" data-i="' + i + '"' + (hit[i] ? ' checked' : '') + '> ' + qt(pt.p) + '</label></li>'; }).join('') + '</ul></div><div class="row actions"><button class="btn primary" id="ornext">' + (z.i + 1 < z.list.length ? 'Question suivante' : 'Bilan de l’oral') + '</button></div>';
    }
    main.innerHTML = h + '</div></div>';
    var tEl = $('#ortime');
    function countdown(sec, lab, done) {
      var end = Date.now() + sec * 1000; $('#orlab').textContent = lab;
      var tick = function () { var l = Math.max(0, Math.round((end - Date.now()) / 1000)); if (!$('#ortime')) { clearInterval(oralTimer); return; } $('#ortime').textContent = mmss(l); if (!l) { clearInterval(oralTimer); done(); } };
      tick(); oralTimer = setInterval(tick, 500);
    }
    function startTalk() { clearInterval(oralTimer); ttsStop(); z.phase = 'parle'; z.t0 = Date.now(); oralRender(); }
    if (z.phase === 'lecture') {
      tEl.textContent = '';
      $('#orlab').textContent = 'Écoutez la question…';
      ttsOpen([{ text: 'Question ' + (z.i + 1) + '. ' + o.q }], 'Oral blanc');
      var waitEnd = setInterval(function () { if (!tts || !tts.playing || tts.i >= tts.blocks.length || (window.speechSynthesis && !speechSynthesis.speaking)) { clearInterval(waitEnd); if (z.phase !== 'lecture' || !$('#ortime')) return; ttsStop(); z.phase = 'prep'; if (z.prep) countdown(z.prep, 'Préparation : organisez votre plan dans votre tête.', startTalk); else startTalk(); } }, 400);
    } else if (z.phase === 'prep') countdown(z.prep, 'Préparation : organisez votre plan dans votre tête.', startTalk);
    else if (z.phase === 'parle') {
      countdown(limit, '', function () { finishTalk(); });
      $('#orlab').textContent = SR ? 'Parlez : votre réponse s’écrit ci-dessous.' : 'Répondez à voix haute.';
      if (SR && !oralRec) {
        oralRec = { keep: true, base: z.txt };
        var go = function () {
          if (!oralRec || !oralRec.keep) return;
          var r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true; oralRec.r = r; var base = z.txt ? z.txt.replace(/\s*$/, ' ') : '';
          r.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; z.txt = base + t; var el = $('#ortx'); if (el) { el.textContent = z.txt; el.scrollTop = el.scrollHeight; } };
          r.onerror = function (ev) { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { oralRec.keep = false; $('#orlab').textContent = 'Micro refusé : répondez à voix haute, puis cochez vous-même les points clés.'; } };
          r.onend = function () { if (oralRec && oralRec.keep) setTimeout(go, 200); }; // la reconnaissance s'arrête après un silence : on la relance
          try { r.start(); } catch (e) { /* rien */ }
        };
        go();
      }
    }
    function finishTalk() { clearInterval(oralTimer); oralStopRec(); z.spoke += Math.round((Date.now() - (z.t0 || Date.now())) / 1000); z.phase = 'correction'; oralRender(); }
    var bs = $('#orstart'); if (bs) bs.addEventListener('click', startTalk);
    var bk = $('#orskip'); if (bk) bk.addEventListener('click', function () { clearInterval(oralTimer); ttsStop(); z.res.push(0); z.i++; z.phase = 'lecture'; z.txt = ''; oralRender(); });
    var bd = $('#ordone'); if (bd) bd.addEventListener('click', finishTalk);
    var up = function () { var n = $$('.opoints input:checked').length, el = $('#orsc'); if (el) el.textContent = n + ' sur ' + o.points.length; };
    $$('.opoints input').forEach(function (cb) { cb.addEventListener('change', up); }); up();
    var bn = $('#ornext'); if (bn) bn.addEventListener('click', function () {
      var sc = $$('.opoints input:checked').length / o.points.length; mem.ouv = mem.ouv || {}; var k = mem.ouv[o.id] || { n: 0, best: 0 }; k.n++; k.last = sc; k.best = Math.max(k.best, sc); k.d = today(); mem.ouv[o.id] = k; logToday('oral'); save();
      z.res.push(sc); z.i++; z.phase = 'lecture'; z.txt = ''; oralRender(); window.scrollTo(0, 0);
    });
  }

  /* ================================================================== CARTES MENTALES (arbre cliquable du thème) */
  var mapOpen = {};
  function headTree(fid) {
    var tmp = document.createElement('div'); tmp.innerHTML = F[fid].html; var out = [], cur = null;
    $$('h2, h3', tmp).forEach(function (h) {
      if (h.closest('.cle, .autotest, .plan')) return;
      var t = h.textContent.trim(); if (!t) return;
      if (h.tagName === 'H2') { cur = { t: t, kids: [] }; out.push(cur); } else if (cur) cur.kids.push({ t: t });
    });
    return out;
  }
  function pageCarte(tid) {
    var th = THEMES[tid];
    if (!th) {
      var h0 = '<div class="page"><h1 class="title">Cartes mentales</h1><p class="lede">Une carte par thème : les fiches, puis leurs parties. Cliquez sur une fiche pour l’ouvrir dans la carte, sur une partie pour y aller directement.</p><div class="pthemes">';
      D.cats.forEach(function (c) { c.themes.forEach(function (t) { h0 += '<a href="#/carte/' + t.id + '">' + esc(t.name) + '</a>'; }); });
      return (main.innerHTML = h0 + '</div></div>');
    }
    mapOpen[tid] = mapOpen[tid] || {};
    var root = { t: th.name, kind: 'root', kids: [] };
    th.groups.forEach(function (g) {
      var parent = root;
      if (g.name && th.groups.length > 1) { parent = { t: g.name, kind: 'grp', kids: [] }; root.kids.push(parent); }
      g.fiches.forEach(function (fid) {
        var n = { t: strip(F[fid].th), kind: 'fiche', fid: fid, kids: [] };
        if (mapOpen[tid][fid]) headTree(fid).forEach(function (h2) { var hn = { t: h2.t, kind: 'sec', fid: fid, kids: [] }; if (mapOpen[tid][fid + '|' + h2.t]) hn.kids = h2.kids.map(function (h3) { return { t: h3.t, kind: 'sub', fid: fid, kids: [] }; }); hn.more = h2.kids.length; n.kids.push(hn); });
        parent.kids.push(n);
      });
    });
    // mise en page : profondeur → colonne, feuilles → lignes
    var COLW = [210, 190, 250, 250, 240], ROWH = 30, PAD = 14, rows = 0, maxd = 0, nodes = [], edges = [];
    function wrap(t, w) { var max = Math.floor(w / 7.2), words = t.split(' '), lines = [''], k = 0; words.forEach(function (wd) { if ((lines[k] + ' ' + wd).trim().length > max && lines[k]) { if (lines.length === 2) { lines[1] = lines[1].replace(/.{0,2}$/, '…'); return; } lines.push(''); k++; } lines[k] = (lines[k] + ' ' + wd).trim(); }); return lines; }
    function lay(n, d, x) {
      n.d = d; n.x = x; maxd = Math.max(maxd, d); var w = (COLW[d] || 230) - 24; n.lines = wrap(n.t, w); n.w = w;
      if (!n.kids.length) { n.y = PAD + rows * ROWH + (n.lines.length - 1) * 7; rows += n.lines.length > 1 ? 1.5 : 1; }
      else { n.kids.forEach(function (k) { lay(k, d + 1, x + (COLW[d] || 230)); }); n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2; }
      nodes.push(n); n.kids.forEach(function (k) { edges.push([n, k]); });
    }
    lay(root, 0, PAD);
    var W = PAD * 2 + COLW.slice(0, maxd + 1).reduce(function (a, b) { return a + b; }, 0), H = PAD * 2 + rows * ROWH;
    var svg = '<svg class="mindmap" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Carte mentale : ' + esc(th.name) + '">';
    edges.forEach(function (e) { var a = e[0], b = e[1], x1 = a.x + a.w + 6, x2 = b.x - 4, mx = (x1 + x2) / 2; svg += '<path class="edge" d="M' + x1 + ' ' + a.y + ' C' + mx + ' ' + a.y + ' ' + mx + ' ' + b.y + ' ' + x2 + ' ' + b.y + '"/>'; });
    nodes.forEach(function (n) {
      var col = n.kind === 'fiche' ? dotColor(n.fid) : '', act = n.kind === 'fiche' ? 'data-tog="' + n.fid + '"' : n.kind === 'sec' ? 'data-sec="' + esc(n.t) + '" data-f="' + n.fid + '"' + (n.more ? ' data-sub="' + esc(n.fid + '|' + n.t) + '"' : '') : n.kind === 'sub' ? 'data-sec="' + esc(n.t) + '" data-f="' + n.fid + '"' : '';
      svg += '<g class="node ' + n.kind + (n.kind === 'fiche' && mapOpen[tid][n.fid] ? ' open' : '') + '" ' + act + ' tabindex="' + (act ? 0 : -1) + '">';
      if (n.kind === 'fiche') svg += '<rect class="dotm" x="' + (n.x - 2) + '" y="' + (n.y - 5) + '" width="10" height="10" rx="2"' + (col ? ' style="fill:' + col + '"' : '') + '/>';
      if (act) { var hh = Math.max(24, n.lines.length * 15 + 8); svg += '<rect class="hit" x="' + (n.x - 6) + '" y="' + (n.y - hh / 2) + '" width="' + (n.w + (n.kind === 'sec' && n.more && !n.kids.length ? 44 : 12)) + '" height="' + hh + '" rx="5"/>'; }
      var tx = n.kind === 'fiche' ? n.x + 14 : n.x;
      n.lines.forEach(function (l, i) { svg += '<text x="' + tx + '" y="' + (n.y + 4 + (i - (n.lines.length - 1) / 2) * 15) + '">' + esc(l) + '</text>'; });
      if (n.kind === 'sec' && n.more && !n.kids.length) svg += '<text class="more" x="' + (n.x + n.w + 10) + '" y="' + (n.y + 4) + '">+' + n.more + '</text>';
      svg += '</g>';
    });
    svg += '</svg>';
    var h = '<div class="page wide"><div class="crumbs"><a href="#/carte">Cartes mentales</a> / <a href="#/theme/' + tid + '">' + esc(th.short) + '</a></div><h1 class="title">' + esc(th.name) + '</h1>';
    h += '<p class="lede">Cliquez sur une fiche pour déplier ses parties, sur une partie pour l’ouvrir. Les carrés reprennent la couleur de la carte de fixation.</p><div class="row"><button class="btn" id="mall">Tout déplier</button><button class="btn" id="mnone">Tout replier</button><a class="btn" href="#/theme/' + tid + '">Liste des fiches</a></div>';
    main.innerHTML = h + '<div class="mapwrap">' + svg + '</div></div>';
    $$('.mindmap [data-tog]').forEach(function (g) { var f = g.getAttribute('data-tog'); var tg = function () { mapOpen[tid][f] = !mapOpen[tid][f]; pageCarte(tid); }; g.addEventListener('click', tg); g.addEventListener('keydown', function (e) { if (e.key === 'Enter') tg(); }); });
    $$('.mindmap [data-sec]').forEach(function (g) {
      var go = function (e) { var sub = g.getAttribute('data-sub'); if (sub && e && e.target && e.target.classList.contains('more')) { mapOpen[tid][sub] = true; pageCarte(tid); return; } location.hash = '#/fiche/' + g.getAttribute('data-f') + '?sec=' + encodeURIComponent(g.getAttribute('data-sec')); };
      g.addEventListener('click', go); g.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
    $('#mall').addEventListener('click', function () { th.all.forEach(function (f) { mapOpen[tid][f] = true; }); pageCarte(tid); });
    $('#mnone').addEventListener('click', function () { mapOpen[tid] = {}; pageCarte(tid); });
  }

  /* ------------------------------------------------------------------ écran de connexion et d'inscription */
  var authBox = $('#auth');
  function lastTxt(pr) { return pr.last ? (pr.last === today() ? 'dernière séance aujourd’hui' : 'dernière séance le ' + fdate(pr.last).replace(/\.$/, '')) : 'jamais ouvert'; }
  function showAuth(mode, arg, msg) {
    document.body.classList.add('locked'); authBox.hidden = false;
    var h = '<div class="auth-card"><div class="auth-brand"><svg class="mark"><use href="#mark"/></svg><b>Révision DEMS</b><span class="exam num">J−' + Math.max(0, diff(today(), EXAM)) + '</span></div>';
    mode = mode || (profils.list.length ? 'choose' : 'create');
    if (mode === 'choose') {
      h += '<h1>Qui révise ?</h1><p class="lede">Chaque profil garde ses fiches apprises, ses QCM, son carnet d’erreurs et ses statistiques.</p><ul class="who">' +
        profils.list.slice().sort(function (a, b) { return (b.last || '') < (a.last || '') ? -1 : 1; }).map(function (pr) {
          return '<li><button data-id="' + pr.id + '"><span class="ini">' + esc(initials(pr.nom)) + '</span><span><b>' + esc(pr.nom) + '</b><small>' + lastTxt(pr) + '</small></span></button></li>';
        }).join('') + '</ul><div class="row"><button class="btn" id="anew">Créer un profil</button><label class="btn" for="aimp">Importer un profil</label><input type="file" id="aimp" accept=".json,application/json" hidden></div>';
    } else if (mode === 'login') {
      var pr = profById(arg);
      h += '<h1>Bonjour, ' + esc(pr.nom.split(/\s+/)[0]) + '</h1><p class="lede">' + esc(pr.nom) + ', ' + lastTxt(pr) + '.</p>' +
        '<form id="aform" class="aform" autocomplete="on"><input type="text" name="username" value="' + esc(pr.nom) + '" autocomplete="username" hidden>' +
        '<label class="field"><b>Mot de passe</b><input class="field-in" type="password" id="apwd" autocomplete="current-password" required></label>' +
        '<div class="row"><button class="btn primary" type="submit">Se connecter</button><button class="btn" type="button" id="aback">Ce n’est pas moi</button><button class="linkbtn" type="button" id="aforgot">Mot de passe oublié ?</button></div></form>';
    } else if (mode === 'create') {
      var leg = legacyInfo();
      h += '<h1>' + (profils.list.length ? 'Nouveau profil' : 'Créez votre profil') + '</h1><p class="lede">Votre progression (fiches apprises, QCM, erreurs, statistiques) sera rangée sous votre nom.</p>' +
        '<form id="aform" class="aform" autocomplete="on">' +
        '<label class="field"><b>Votre nom</b><input class="field-in" id="anom" maxlength="40" autocomplete="username" placeholder="Prénom et nom" required></label>' +
        '<label class="field"><b>Mot de passe</b><input class="field-in" type="password" id="apwd" autocomplete="new-password" minlength="4" required><small class="muted">4 caractères au moins.</small></label>' +
        '<label class="field"><b>Confirmez le mot de passe</b><input class="field-in" type="password" id="apwd2" autocomplete="new-password" required></label>' +
        (leg ? '<label class="field check"><input type="checkbox" id="aleg"' + (profils.list.length ? '' : ' checked') + '> Reprendre la progression déjà enregistrée sur cet appareil (' + leg.txt + ')</label>' : '') +
        '<div class="row"><button class="btn primary" type="submit">Créer mon profil</button>' + (profils.list.length ? '<button class="btn" type="button" id="aback">Retour</button>' : '<label class="btn" for="aimp">Importer un profil</label><input type="file" id="aimp" accept=".json,application/json" hidden>') + '</div></form>';
    } else if (mode === 'forgot') {
      var pf = profById(arg);
      h += '<h1>Nouveau mot de passe</h1><p class="lede">Les profils sont rangés sur cet appareil, sans serveur : aucun courriel ne peut être envoyé. Pour choisir un nouveau mot de passe, tapez le nom du profil exactement comme il est écrit.</p>' +
        '<form id="aform" class="aform"><label class="field"><b>Nom du profil</b><input class="field-in" id="anom" required></label>' +
        '<label class="field"><b>Nouveau mot de passe</b><input class="field-in" type="password" id="apwd" autocomplete="new-password" minlength="4" required></label>' +
        '<div class="row"><button class="btn primary" type="submit">Enregistrer et me connecter</button><button class="btn" type="button" id="aback">Retour</button></div></form>';
      arg = pf.id;
    }
    h += '<p class="amsg" id="amsg" role="status">' + (msg ? esc(msg) : '') + '</p>';
    h += '<p class="small muted anote">Les profils sont enregistrés dans ce navigateur, sur cet appareil. Pour continuer sur un autre appareil, utilisez « Transférer mon profil » dans Réglages et sauvegarde.</p></div>';
    authBox.innerHTML = h;
    var am = $('#amsg'), say = function (t) { am.textContent = t; };
    $$('.who button', authBox).forEach(function (b) { b.addEventListener('click', function () { showAuth('login', b.dataset.id); }); });
    var bn = $('#anew'); if (bn) bn.addEventListener('click', function () { showAuth('create'); });
    var bb = $('#aback'); if (bb) bb.addEventListener('click', function () { showAuth('choose'); });
    var bf = $('#aforgot'); if (bf) bf.addEventListener('click', function () { showAuth('forgot', arg); });
    var fi = $('#aimp'); if (fi) fi.addEventListener('change', function () { importProfil(this.files[0], function (t, id) { showAuth(id ? 'login' : profils.list.length ? 'choose' : 'create', id, t); }); });
    var fm = $('#aform');
    if (fm) fm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (mode === 'login') {
        var pr = profById(arg);
        hashPwd(pr.salt, $('#apwd').value).then(function (hh) { if (hh !== pr.hash) { say('Mot de passe incorrect.'); $('#apwd').select(); return; } enter(pr); });
      } else if (mode === 'create') {
        var nom = $('#anom').value.trim().replace(/\s+/g, ' '), p1 = $('#apwd').value, p2 = $('#apwd2').value;
        if (nom.length < 2) return say('Indiquez votre nom.');
        if (profByName(nom)) return say('Un profil porte déjà ce nom sur cet appareil. Choisissez-le dans la liste, ou ajoutez votre initiale.');
        if (p1.length < 4) return say('Le mot de passe doit faire 4 caractères au moins.');
        if (p1 !== p2) return say('Les deux mots de passe sont différents.');
        var pr2 = { id: 'p' + rndHex(6), nom: nom, salt: rndHex(12), created: today(), last: today() };
        hashPwd(pr2.salt, p1).then(function (hh) {
          pr2.hash = hh;
          var leg = legacyInfo(), take = leg && $('#aleg') && $('#aleg').checked;
          if (!lsSet(memKey(pr2.id), JSON.stringify(take ? leg.mem : blank()))) return say('Ce navigateur refuse l’enregistrement : libérez de la place ou utilisez Chrome, Edge ou Firefox.');
          if (take) lsDel(KEY);
          profils.list.push(pr2); saveProfils(); enter(pr2);
        });
      } else if (mode === 'forgot') {
        var pf = profById(arg), p3 = $('#apwd').value;
        if (normalize($('#anom').value.trim().replace(/\s+/g, ' ')) !== normalize(pf.nom)) return say('Ce n’est pas le nom exact du profil.');
        if (p3.length < 4) return say('Le mot de passe doit faire 4 caractères au moins.');
        pf.salt = rndHex(12); hashPwd(pf.salt, p3).then(function (hh) { pf.hash = hh; saveProfils(); enter(pf); });
      }
    });
    var first = $('input:not([hidden]):not([type=file])', authBox) || $('.who button', authBox); if (first) first.focus();
  }
  function enter(pr) {
    me = pr; profils.current = pr.id; me.last = today(); saveProfils();
    document.body.classList.remove('locked'); authBox.hidden = true; authBox.innerHTML = '';
    boot();
  }
  function logout() { if (mem) save(); profils.current = null; saveProfils(); location.hash = '#/'; location.reload(); }
  function profilFile() { return { type: 'revision-dems-profil', v: 1, profil: { id: me.id, nom: me.nom, salt: me.salt, hash: me.hash, created: me.created }, mem: mem }; }
  // importe un fichier « profil » (ou une ancienne sauvegarde) ; garde la version la plus récente si le profil existe déjà ici
  function importProfil(file, done) {
    if (!file) return; var r = new FileReader();
    r.onload = function () {
      var o = null; try { o = JSON.parse(r.result); } catch (e) { o = null; }
      if (!o || o.type !== 'revision-dems-profil' || !o.profil || !o.mem) return done(o && o.v === 1 ? 'Ce fichier est une ancienne sauvegarde sans profil : créez d’abord votre profil, puis importez-le dans Réglages et sauvegarde.' : 'Ce fichier n’est pas un profil de Révision DEMS.');
      var pr = profById(o.profil.id), msg;
      if (pr) {
        var cur = null; try { cur = JSON.parse(lsGet(memKey(pr.id)) || 'null'); } catch (e) { cur = null; }
        if (cur && (cur.savedAt || 0) > (o.mem.savedAt || 0)) msg = 'Ce profil existe déjà ici avec une progression plus récente : elle a été gardée.';
        else { lsSet(memKey(pr.id), JSON.stringify(o.mem)); msg = 'Progression du profil mise à jour avec le fichier.'; }
        pr.salt = o.profil.salt; pr.hash = o.profil.hash;
      } else {
        if (profByName(o.profil.nom)) return done('Un autre profil porte déjà le nom « ' + o.profil.nom + ' » sur cet appareil.');
        pr = { id: o.profil.id, nom: o.profil.nom, salt: o.profil.salt, hash: o.profil.hash, created: o.profil.created || today(), last: today() };
        if (!lsSet(memKey(pr.id), JSON.stringify(o.mem))) return done('Ce navigateur refuse l’enregistrement.');
        profils.list.push(pr); msg = 'Profil importé. Connectez-vous avec le mot de passe habituel.';
      }
      saveProfils(); done(msg, pr.id);
    };
    r.readAsText(file);
  }

  /* ------------------------------------------------------------------ appli installable et hors ligne */
  var pwa = { prompt: null, media: null, est: null };
  var ONLINE_SITE = /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function scanUrls() { var seen = {}, out = []; ORDER.forEach(function (fid) { var sc = F[fid].scan; if (sc) sc[1].forEach(function (n) { var u = scanSrc(sc[0], n); if (!seen[u]) { seen[u] = 1; out.push(u); } }); }); return out; }
  if (ONLINE_SITE) {
    var hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtl) showUpdate(); hadCtl = true; renderOffline(); });
    navigator.serviceWorker.addEventListener('message', function (e) { var d = e.data || {}; if (d.type === 'cache-media') { pwa.media = d; if (d.fin) pwa.est = null; renderOffline(); } });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pwa.prompt = e; renderInstall(); renderOffline(); });
  window.addEventListener('appinstalled', function () { pwa.prompt = null; renderInstall(); renderOffline(); });
  function showUpdate() {
    if ($('#upd')) return; var d = document.createElement('div'); d.className = 'toast'; d.id = 'upd'; d.setAttribute('role', 'status');
    d.innerHTML = '<span>Nouvelle version du site installée.</span><button class="btn primary" id="updgo">Recharger</button><button class="btn" id="updno">Plus tard</button>';
    document.body.appendChild(d); $('#updgo').onclick = function () { location.reload(); }; $('#updno').onclick = function () { d.remove(); };
  }
  function doInstall() { if (!pwa.prompt) return; var pr = pwa.prompt; pr.prompt(); (pr.userChoice || Promise.resolve()).then(function () { pwa.prompt = null; renderInstall(); renderOffline(); }); }
  function renderInstall() {
    var el = $('#instl'); if (!el) return;
    var show = ONLINE_SITE && !standalone() && (pwa.prompt || IOS);
    el.hidden = !show; if (!show) return;
    el.innerHTML = pwa.prompt ? '<button class="linkbtn" id="binst">Installer l’appli sur cet appareil</button>' : '<a href="#/donnees?appli=1">Installer l’appli sur l’iPhone</a>';
    var b = $('#binst'); if (b) b.onclick = doInstall;
  }
  function renderOffline() {
    var el = $('#offline'); if (!el) return;
    var h = '';
    if (!ONLINE_SITE) {
      h = '<p class="small">Vous utilisez la copie enregistrée sur l’ordinateur : elle marche déjà sans internet. Pour installer l’appli sur un téléphone, ouvrez le site en ligne (revision-dems.vercel.app) sur le téléphone.</p>';
      return (el.innerHTML = h);
    }
    var ready = !!navigator.serviceWorker.controller;
    h += '<p class="small">' + (standalone() ? 'Vous utilisez l’appli installée. ' : '') + (ready ? '<b>Hors ligne : prêt.</b> Fiches, questions, cas et réglages s’ouvrent sans connexion sur cet appareil.' : 'Préparation du mode hors ligne… Il sera prêt à la prochaine ouverture du site.') + '</p>';
    if (!standalone()) {
      if (pwa.prompt) h += '<div class="row"><button class="btn primary" id="binst2">Installer l’appli</button></div>';
      else if (IOS) h += '<ol class="small steps"><li>Ouvrez ce site dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
      else h += '<p class="small muted">Pour l’installer : menu du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>';
    }
    if (IOS) h += '<p class="small muted">Sur iPhone et iPad, l’appli installée garde ses données à part de Safari : avant de passer à l’appli, faites « Transférer mon profil » ici, puis « Importer un profil » sur l’écran de connexion de l’appli.</p>';
    var urls = scanUrls(), m = pwa.media;
    h += '<p class="small">Les pages manuscrites et les PDF déjà ouverts restent disponibles hors ligne. Vous pouvez aussi télécharger d’un coup toutes les pages manuscrites.</p>';
    h += '<div class="row"><button class="btn" id="bmedia"' + (!ready || (m && !m.fin) ? ' disabled' : '') + '>' + (m && !m.fin ? 'Téléchargement : ' + (m.done + m.fail) + ' / ' + m.total : m && m.fin ? 'Pages manuscrites téléchargées' + (m.fail ? ' (' + m.fail + ' échecs : relancez)' : '') : 'Télécharger les ' + urls.length + ' pages manuscrites (≈ 70 Mo)') + '</button><span class="small muted" id="est"></span></div>';
    h += '<p class="small muted">La dictée vocale a besoin d’internet. La lecture à voix haute marche hors ligne si une voix française est installée sur l’appareil.</p>';
    el.innerHTML = h;
    var b2 = $('#binst2'); if (b2) b2.onclick = doInstall;
    var bm = $('#bmedia'); if (bm) bm.onclick = function () {
      if (!navigator.serviceWorker.controller) return;
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      pwa.media = { done: 0, fail: 0, total: urls.length, fin: false }; renderOffline();
      navigator.serviceWorker.controller.postMessage({ type: 'cache-media', urls: urls });
    };
    if (navigator.storage && navigator.storage.estimate) {
      if (pwa.est !== null) $('#est').textContent = pwa.est;
      else navigator.storage.estimate().then(function (e) { pwa.est = 'Espace utilisé : ' + Math.round((e.usage || 0) / 1e6) + ' Mo'; var x = $('#est'); if (x) x.textContent = pwa.est; });
    }
  }

  /* ------------------------------------------------------------------ démarrage */
  function locked() { return document.body.classList.contains('locked'); }
  var booted = false;
  function boot() {
    load(); setTheme();
    if (!booted) { booted = true; renderPomo(); renderInstall(); }
    route();
  }
  window.addEventListener('hashchange', function () { if (!locked()) route(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cle]'); if (!b) return;
    var a = b.dataset.cle.split(':'), p = progById(a[0]); if (!p) return;
    var fids = []; progItems(p, +a[1]).forEach(function (it) { if (!it.partiel && fids.indexOf(it.f) < 0) fids.push(it.f); });
    ttsOpen(cleBlocks(fids), 'À retenir : ' + (p.court || p.titre));
  });
  var sform = $('#sform'), sinput = $('#q');
  sform.addEventListener('submit', function (e) { e.preventDefault(); location.hash = '#/recherche?q=' + encodeURIComponent(sinput.value); });
  $('#bmenu').addEventListener('click', function () { app.classList.toggle('menu'); });
  document.addEventListener('keydown', function (e) {
    if (locked()) return;
    if (e.key === 'Escape' && scanFid) { closeScans(); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var r = parseRoute();
    if (r.name === 'revision' && session) {
      if (e.key === ' ' && !session.shown) { e.preventDefault(); show(); }
      else if (session.shown && /^[1-4]$/.test(e.key)) grade(+e.key);
    } else if (r.name === 'chiffres' && drill && drill.i < drill.list.length) {
      if (drill.mode === 'qcm') {
        var kz = 'abcd'.indexOf(e.key.toLowerCase()); if (kz < 0 && /^[1-4]$/.test(e.key)) kz = +e.key - 1;
        if (!drill.shown && kz >= 0) zpick(kz, r.params);
        else if (drill.shown && e.key === 'Enter') { e.preventDefault(); drill.i++; drill.shown = false; drill.pick = null; pageChiffres(r.params); }
      }
      else if (e.key === ' ' && !drill.shown) { e.preventDefault(); drill.shown = true; pageChiffres(r.params); }
      else if (drill.shown && (e.key === '1' || e.key === '2')) zgrade(e.key === '2' ? 1 : 0, r.params);
    } else if (r.name === 'qcm' && quiz && quiz.q && quiz.i < quiz.list.length) {
      var ki = 'abcde'.indexOf(e.key.toLowerCase()); if (ki < 0 && /^[1-5]$/.test(e.key)) ki = +e.key - 1;
      if (e.key === 'Enter') { e.preventDefault(); if (quiz.checked) quizNext(); else quizCheck(); }
      else if (ki >= 0 && !quiz.checked && ki < quiz.q.choix.length) { var b = $('button.opt[data-o="' + ki + '"]'); if (b) b.click(); }
    } else if (r.name === 'examen' && exam && !exam.done && r.params.go) {
      var kj = 'abcde'.indexOf(e.key.toLowerCase()); if (kj < 0 && /^[1-5]$/.test(e.key)) kj = +e.key - 1;
      if (e.key === 'Enter') { e.preventDefault(); examNext(); }
      else if (kj >= 0) { var b2 = $('button.opt[data-o="' + kj + '"]'); if (b2) b2.click(); }
    } else if (e.key === '/') { e.preventDefault(); sinput.focus(); }
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { lutRGB = null; if (!locked()) route(); });
  loadProfils();
  if (!canStore) boot(); // stockage bloqué : pas de profils possibles, avertissement sur la page d'accueil
  else if (profils.current && profById(profils.current)) { me = profById(profils.current); boot(); }
  else showAuth();
})();
