// Room join page. The URL is couchpad.games/<CODE>#<instance> — the same link
// a display's QR encodes for app deep-linking (see .well-known/). When the app
// isn't installed the browser lands here instead: we look the code up on the
// relay directory, show what we know about the room, and offer browser play
// plus the app stores.
//
// Game identity (names, art, host allow-list, per-game relays) comes from
// /games-manifest.json — the web-served counterpart of the controller apps'
// bundled manifest, so a new game is a site deploy, not a code change here.
//
// Resolution mirrors the controller apps (RoomDirectory in
// CouchPad Controller): probe the game relays and the shared relay in
// parallel and prefer a host-declared controller URL over the declared origin.
// Relay answers are UNTRUSTED — a join target that doesn't vet against the
// manifest allow-list is treated as "room not found": we won't send anyone to
// a game we can't identify.
(function () {
  'use strict';

  // ---- Store listings (fill in when the apps go live) ----
  var IOS_APP_URL = null;      // e.g. 'https://apps.apple.com/app/couchpad/id<APPSTORE_ID>'
  var ANDROID_APP_URL = null;  // 'https://play.google.com/store/apps/details?id=games.couchpad.controller'
  // Store download size in MB, rounded, shown as "only N MB": a small app is a
  // reason to install it now, so say so. Both apps are the same size today;
  // split this per store if that ever changes.
  var APP_SIZE_MB = 2;

  // The shared relay is the in-cluster party-sockets pod. ws.hexstacker.com is
  // NOT that server — it CNAMEs to party-sockets.fly.dev, a separate Fly.io
  // process with its own room registry, which is why it is declared per game in
  // games-manifest.json instead of here. Two registries, not one.
  //
  // Before public release this host moves to Fly.io as well. That is a registry
  // switch, not a rename: whatever registers rooms with the in-cluster relay has
  // to move in the same change, or it will keep writing to the cluster while
  // this page looks on Fly.
  var SHARED_RELAYS = ['https://ws.couchpad.games'];
  // Allow-list for room links — a different question from the relay above: this
  // vets the join URL a relay hands back. Subdomains are matched too, so every
  // game served from *.couchpad.games is covered by the single entry.
  //
  // A game still serving from another domain resolves to "Room not found" by
  // design — an unvettable join target is not something we send players to.
  var OWN_HOSTS = ['couchpad.games'];

  // ---- Strings ----
  // The room URL is one URL for every language (it is what the TV's QR code
  // encodes), so the page renders in the visitor's language instead of
  // offering a /de/ copy: the saved site choice, else the browser's ranking
  // (lang.js), else English. The languages are HexStacker Party's, since a
  // guest goes from here straight into a game controller that speaks them.
  // Wording follows HexStacker's public/shared/i18n.js where the two overlap
  // (room, scan, Privacy/Imprint) and its informal register elsewhere;
  // German follows the landing page's /de/ copy (dark_mode: its toggle label).
  // Keep `name` the language's own name: it labels the footer picker.
  var STRINGS = {
    en: {
      name: 'English',
      title_join: 'Join room · CouchPad', title_room: 'Room {code} · CouchPad',
      checking: 'Checking room…', not_found: 'Room not found',
      page_not_found: 'Page not found', enter_code: 'Joining a room? Enter the code from your TV.',
      code_length: 'Room codes have 6 characters.', room_code: 'Room code', join: 'Join',
      ways_to_play: 'Ways to play', play_browser: 'Play in browser',
      ios_app: 'Download iOS app', android_app: 'Download Android app', coming_soon: 'Coming soon', app_size: 'only {mb} MB',
      privacy: 'Privacy', imprint: 'Imprint', contact: 'Contact', language: 'Language', dark_mode: 'Dark mode'
    },
    de: {
      name: 'Deutsch',
      title_join: 'Raum beitreten · CouchPad', title_room: 'Raum {code} · CouchPad',
      checking: 'Raum wird gesucht…', not_found: 'Raum nicht gefunden',
      page_not_found: 'Seite nicht gefunden', enter_code: 'Du willst einem Raum beitreten? Gib den Code vom Fernseher ein.',
      code_length: 'Raumcodes haben 6 Zeichen.', room_code: 'Raumcode', join: 'Beitreten',
      ways_to_play: 'Mitspielen', play_browser: 'Im Browser spielen',
      ios_app: 'iOS-App herunterladen', android_app: 'Android-App herunterladen', coming_soon: 'Bald verfügbar', app_size: 'nur {mb} MB',
      privacy: 'Datenschutz', imprint: 'Impressum', contact: 'Kontakt', language: 'Sprache', dark_mode: 'Dunkles Design'
    },
    fr: {
      name: 'Français',
      title_join: 'Rejoindre la salle · CouchPad', title_room: 'Salle {code} · CouchPad',
      checking: 'Recherche de la salle…', not_found: 'Salle introuvable',
      page_not_found: 'Page introuvable', enter_code: 'Tu veux rejoindre une salle ? Saisis le code affiché sur ta télé.',
      code_length: 'Les codes de salle ont 6 caractères.', room_code: 'Code de salle', join: 'Rejoindre',
      ways_to_play: 'Façons de jouer', play_browser: 'Jouer dans le navigateur',
      ios_app: 'Télécharger l’app iOS', android_app: 'Télécharger l’app Android', coming_soon: 'Bientôt disponible', app_size: 'seulement {mb} Mo',
      privacy: 'Confidentialité', imprint: 'Mentions légales', contact: 'Contact', language: 'Langue', dark_mode: 'Mode sombre'
    },
    pt: {
      name: 'Português',
      title_join: 'Entrar na sala · CouchPad', title_room: 'Sala {code} · CouchPad',
      checking: 'Procurando a sala…', not_found: 'Sala não encontrada',
      page_not_found: 'Página não encontrada', enter_code: 'Quer entrar numa sala? Digita o código da TV.',
      code_length: 'Os códigos de sala têm 6 caracteres.', room_code: 'Código da sala', join: 'Entrar',
      ways_to_play: 'Formas de jogar', play_browser: 'Jogar no navegador',
      ios_app: 'Baixar o app para iOS', android_app: 'Baixar o app para Android', coming_soon: 'Em breve', app_size: 'só {mb} MB',
      privacy: 'Privacidade', imprint: 'Aviso legal', contact: 'Contato', language: 'Idioma', dark_mode: 'Modo escuro'
    },
    es: {
      name: 'Español',
      title_join: 'Unirse a la sala · CouchPad', title_room: 'Sala {code} · CouchPad',
      checking: 'Buscando la sala…', not_found: 'Sala no encontrada',
      page_not_found: 'Página no encontrada', enter_code: '¿Quieres unirte a una sala? Escribe el código de tu tele.',
      code_length: 'Los códigos de sala tienen 6 caracteres.', room_code: 'Código de sala', join: 'Unirse',
      ways_to_play: 'Formas de jugar', play_browser: 'Jugar en el navegador',
      ios_app: 'Descargar la app de iOS', android_app: 'Descargar la app de Android', coming_soon: 'Próximamente', app_size: 'solo {mb} MB',
      privacy: 'Privacidad', imprint: 'Aviso legal', contact: 'Contacto', language: 'Idioma', dark_mode: 'Modo oscuro'
    },
    zh: {
      name: '中文',
      title_join: '加入房间 · CouchPad', title_room: '房间 {code} · CouchPad',
      checking: '正在查找房间…', not_found: '房间未找到',
      page_not_found: '页面未找到', enter_code: '想加入房间？请输入电视上的代码。',
      code_length: '房间代码为 6 个字符。', room_code: '房间代码', join: '加入',
      ways_to_play: '游戏方式', play_browser: '在浏览器中玩',
      ios_app: '下载 iOS 应用', android_app: '下载 Android 应用', coming_soon: '即将推出', app_size: '仅 {mb} MB',
      privacy: '隐私', imprint: '法律声明', contact: '联系', language: '语言', dark_mode: '深色模式'
    },
    ja: {
      name: '日本語',
      title_join: 'ルームに参加 · CouchPad', title_room: 'ルーム {code} · CouchPad',
      checking: 'ルームを確認中…', not_found: 'ルームが見つからない',
      page_not_found: 'ページが見つからない', enter_code: 'ルームに参加する？テレビのコードを入力してね。',
      code_length: 'ルームコードは6文字だよ。', room_code: 'ルームコード', join: '参加',
      ways_to_play: 'プレイ方法', play_browser: 'ブラウザでプレイ',
      ios_app: 'iOSアプリをダウンロード', android_app: 'Androidアプリをダウンロード', coming_soon: '近日公開', app_size: 'わずか{mb}MB',
      privacy: 'プライバシー', imprint: '運営者情報', contact: 'お問い合わせ', language: '言語', dark_mode: 'ダークモード'
    },
    ko: {
      name: '한국어',
      title_join: '방 참가 · CouchPad', title_room: '방 {code} · CouchPad',
      checking: '방을 확인하는 중…', not_found: '방을 찾을 수 없어',
      page_not_found: '페이지를 찾을 수 없어', enter_code: '방에 참가하려면 TV의 코드를 입력해.',
      code_length: '방 코드는 6자리야.', room_code: '방 코드', join: '참가',
      ways_to_play: '플레이 방법', play_browser: '브라우저에서 플레이',
      ios_app: 'iOS 앱 다운로드', android_app: 'Android 앱 다운로드', coming_soon: '출시 예정', app_size: '단 {mb}MB',
      privacy: '개인정보', imprint: '법적 고지', contact: '문의', language: '언어', dark_mode: '다크 모드'
    },
    ru: {
      name: 'Русский',
      title_join: 'Войти в комнату · CouchPad', title_room: 'Комната {code} · CouchPad',
      checking: 'Ищем комнату…', not_found: 'Комната не найдена',
      page_not_found: 'Страница не найдена', enter_code: 'Хочешь войти в комнату? Введи код с телевизора.',
      code_length: 'Код комнаты состоит из 6 символов.', room_code: 'Код комнаты', join: 'Войти',
      ways_to_play: 'Как играть', play_browser: 'Играть в браузере',
      ios_app: 'Скачать приложение для iOS', android_app: 'Скачать приложение для Android', coming_soon: 'Скоро', app_size: 'всего {mb} МБ',
      privacy: 'Конфиденциальность', imprint: 'Выходные данные', contact: 'Контакты', language: 'Язык', dark_mode: 'Тёмная тема'
    },
    it: {
      name: 'Italiano',
      title_join: 'Unisciti alla stanza · CouchPad', title_room: 'Stanza {code} · CouchPad',
      checking: 'Ricerca della stanza…', not_found: 'Stanza non trovata',
      page_not_found: 'Pagina non trovata', enter_code: 'Vuoi unirti a una stanza? Inserisci il codice della TV.',
      code_length: 'I codici stanza hanno 6 caratteri.', room_code: 'Codice stanza', join: 'Entra',
      ways_to_play: 'Modi per giocare', play_browser: 'Gioca nel browser',
      ios_app: 'Scarica l’app iOS', android_app: 'Scarica l’app Android', coming_soon: 'Prossimamente', app_size: 'solo {mb} MB',
      privacy: 'Privacy', imprint: 'Note legali', contact: 'Contatti', language: 'Lingua', dark_mode: 'Modalità scura'
    },
    tr: {
      name: 'Türkçe',
      title_join: 'Odaya katıl · CouchPad', title_room: 'Oda {code} · CouchPad',
      checking: 'Oda aranıyor…', not_found: 'Oda bulunamadı',
      page_not_found: 'Sayfa bulunamadı', enter_code: 'Bir odaya mı katılacaksın? Televizyondaki kodu gir.',
      code_length: 'Oda kodları 6 karakterden oluşur.', room_code: 'Oda kodu', join: 'Katıl',
      ways_to_play: 'Oynama yolları', play_browser: 'Tarayıcıda oyna',
      ios_app: 'iOS uygulamasını indir', android_app: 'Android uygulamasını indir', coming_soon: 'Yakında', app_size: 'yalnızca {mb} MB',
      privacy: 'Gizlilik', imprint: 'Künye', contact: 'İletişim', language: 'Dil', dark_mode: 'Karanlık mod'
    }
  };
  var lang = window.cgLang.preferred(Object.keys(STRINGS)) || 'en';
  var strings = STRINGS[lang];
  // Like HexStacker's t(): {name} interpolation. A key missing in one language
  // falls back to English, then to the key itself, so a gap can never stop the
  // room lookup.
  function t(key, params) {
    var val = strings[key];
    if (val === undefined) val = STRINGS.en[key];
    if (val === undefined) return key;
    return val.replace(/\{(\w+)\}/g, function (m, k) { return params && params[k] !== undefined ? params[k] : m; });
  }

  // Static markup carries English; swap in the visitor's language.
  document.documentElement.lang = lang;
  document.title = t('title_join');
  document.querySelectorAll('[data-i18n]').forEach(function (node) {
    node.textContent = t(node.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
    node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
    node.placeholder = t(node.getAttribute('data-i18n-placeholder'));
  });
  // The legal pages exist in German (root) and English (/en/) only.
  if (lang === 'de') {
    document.getElementById('link-privacy').href = '/privacy';
    document.getElementById('link-imprint').href = '/imprint';
  }
  // Footer picker for a wrong guess: saves the site-wide choice and re-renders
  // (a reload keeps the room URL and simply redoes the lookup).
  var pick = document.getElementById('langpick');
  Object.keys(STRINGS).forEach(function (code) {
    pick.add(new Option(STRINGS[code].name, code, false, code === lang));
  });
  pick.parentNode.hidden = false;
  pick.addEventListener('change', function () {
    window.cgLang.save(pick.value);
    location.reload();
  });

  // ---- DOM ----
  var el = {
    card: document.getElementById('roomcard'),
    art: document.getElementById('room-art'),
    ambient: document.getElementById('room-ambient'),
    mark: document.getElementById('room-mark'),
    status: document.getElementById('room-status'),
    code: document.getElementById('room-code'),
    meta: document.getElementById('room-meta'),
    game: document.getElementById('room-game'),
    browser: document.getElementById('join-browser'),
    ios: document.getElementById('app-ios'),
    iosSub: document.getElementById('app-ios-sub'),
    android: document.getElementById('app-android'),
    androidSub: document.getElementById('app-android-sub'),
    form: document.getElementById('codeform'),
    input: document.getElementById('codeform-input')
  };

  // Code entry: the server sorts it out. A real code gets looked up, anything
  // else comes back here as a 404 with the entry prefilled.
  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var typed = el.input.value.trim();
    if (typed) location.href = '/' + encodeURIComponent(typed);
  });

  function setStatus(text, mod) {
    el.status.textContent = text;
    el.status.className = 'badge' + (mod ? ' badge--' + mod : '');
  }

  function setupStoreButton(a, sub, url, store) {
    var size = t('app_size', { mb: APP_SIZE_MB });
    if (url) {
      a.href = url;
      sub.textContent = store + ' · ' + size;
    } else {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
      sub.textContent = t('coming_soon') + ' · ' + size;
    }
  }
  setupStoreButton(el.ios, el.iosSub, IOS_APP_URL, 'App Store');
  setupStoreButton(el.android, el.androidSub, ANDROID_APP_URL, 'Google Play');

  // ---- Parse the link ----
  var m = location.pathname.match(/^\/([1-9A-HJ-NP-Za-km-z]{6})$/);
  if (!m) {
    // Not a room code, so this is the site's 404 (nginx error_page). A short
    // alphanumeric path (4 to 8 characters, a near miss) is most likely a
    // mistyped code: prefill it, so a one-character slip is one edit away.
    var guess = (location.pathname.match(/^\/([A-Za-z0-9]{4,8})$/) || [])[1];
    document.title = t('page_not_found') + ' · CouchPad';
    noRoom(t('page_not_found'), guess);
    metaMessage(t(guess && guess.length !== 6 ? 'code_length' : 'enter_code'));
    return;
  }
  var code = m[1];
  var instance = (location.hash.slice(1).match(/^[A-Za-z0-9_-]{1,64}$/) || [''])[0];
  el.code.textContent = code;
  document.title = t('title_room', { code: code });

  // ---- Relay lookup ----
  function lookup(base) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    return fetch(base + '/room/' + encodeURIComponent(code), ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (json) {
          return {
            url: typeof json.url === 'string' ? json.url : null,
            origin: typeof json.origin === 'string' ? json.origin : null
          };
        });
      })
      .catch(function () { return null; });
  }

  function hostMatches(host, allowed) {
    return host === allowed || host.slice(-(allowed.length + 1)) === '.' + allowed;
  }

  function metaMessage(text) {
    el.meta.textContent = text;
    el.meta.hidden = false;
  }

  // Nothing to join: one headline, no badge (the viewfinder-with-question-mark
  // carries the rest), and code entry prefilled with the code tried.
  function noRoom(headline, prefill) {
    el.status.hidden = true;
    // SVG elements lack the HTMLElement `hidden` property — toggle the attribute.
    el.mark.removeAttribute('hidden');
    el.game.textContent = headline;
    el.game.hidden = false;
    el.code.hidden = true; // the entry below holds it, editable
    el.input.value = prefill || '';
    el.form.hidden = false;
  }

  fetch('/games-manifest.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; })
    .then(function (manifest) {
      var games = (manifest && manifest.games || []).filter(function (g) {
        return g && typeof g.name === 'string';
      });
      var allowedHosts = OWN_HOSTS.slice();
      var relays = [];
      for (var i = 0; i < games.length; i++) {
        var hosts = games[i].hosts || [];
        for (var j = 0; j < hosts.length; j++) allowedHosts.push(hosts[j].toLowerCase());
        var probe = games[i].relayProbeBase;
        if (probe && relays.indexOf(probe) === -1) relays.push(probe);
      }
      for (var k = 0; k < SHARED_RELAYS.length; k++) {
        if (relays.indexOf(SHARED_RELAYS[k]) === -1) relays.push(SHARED_RELAYS[k]);
      }

      // Returns the join URL when target is an allowed https URL, else null.
      function vetted(target) {
        var u;
        try { u = new URL(target); } catch (e) { return null; }
        if (u.protocol !== 'https:') return null;
        var host = u.hostname.toLowerCase();
        if (!allowedHosts.some(function (a) { return hostMatches(host, a); })) return null;
        if (instance && !u.hash) u.hash = instance;
        // Single-instance relays substitute {instance} with "" leaving a bare "#".
        return u.hash ? u.href : u.href.replace(/#$/, '');
      }

      function gameFor(joinUrl) {
        var host = new URL(joinUrl).hostname.toLowerCase();
        for (var i = 0; i < games.length; i++) {
          if ((games[i].hosts || []).some(function (h) { return hostMatches(host, h.toLowerCase()); })) {
            return games[i];
          }
        }
        return null;
      }

      function render(joinUrl) {
        var game = gameFor(joinUrl);
        if (game && game.art) {
          el.art.src = el.ambient.src = game.art;
          el.art.hidden = el.ambient.hidden = false;
          el.card.classList.add('ambient');
        }
        if (game) {
          el.game.textContent = game.name;
          el.game.hidden = false;
        }
        el.status.hidden = true; // the game name speaks for itself once live
        el.browser.href = joinUrl;
        el.browser.hidden = false;
      }

      Promise.all(relays.map(lookup)).then(function (results) {
        var founds = results.filter(Boolean);
        for (var i = 0; i < founds.length; i++) {
          if (founds[i].url) {
            var joinUrl = vetted(founds[i].url);
            if (joinUrl) return render(joinUrl);
          }
        }
        for (var j = 0; j < founds.length; j++) {
          if (founds[j].origin) {
            var originUrl = vetted(founds[j].origin.replace(/\/+$/, '') + '/' + code);
            if (originUrl) return render(originUrl);
          }
        }
        // Unknown, unreachable, or unvetted — we can't tell which game this
        // is, so there is nothing safe to join. One honest answer.
        noRoom(t('not_found'), code);
      });
    });
})();
