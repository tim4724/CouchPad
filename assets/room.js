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
      invalid_link: 'Invalid link', no_code: 'No room code in this link. Scan the code on your TV.',
      ways_to_play: 'Ways to play', play_browser: 'Play in browser',
      ios_app: 'Download iOS app', android_app: 'Download Android app', coming_soon: 'Coming soon', app_size: 'only {mb} MB',
      privacy: 'Privacy', imprint: 'Imprint', contact: 'Contact', language: 'Language', dark_mode: 'Dark mode'
    },
    de: {
      name: 'Deutsch',
      title_join: 'Raum beitreten · CouchPad', title_room: 'Raum {code} · CouchPad',
      checking: 'Raum wird gesucht…', not_found: 'Raum nicht gefunden',
      invalid_link: 'Ungültiger Link', no_code: 'Dieser Link enthält keinen Raumcode. Scanne den Code auf dem Fernseher.',
      ways_to_play: 'Mitspielen', play_browser: 'Im Browser spielen',
      ios_app: 'iOS-App herunterladen', android_app: 'Android-App herunterladen', coming_soon: 'Bald verfügbar', app_size: 'nur {mb} MB',
      privacy: 'Datenschutz', imprint: 'Impressum', contact: 'Kontakt', language: 'Sprache', dark_mode: 'Dunkles Design'
    },
    fr: {
      name: 'Français',
      title_join: 'Rejoindre la salle · CouchPad', title_room: 'Salle {code} · CouchPad',
      checking: 'Recherche de la salle…', not_found: 'Salle introuvable',
      invalid_link: 'Lien invalide', no_code: 'Ce lien ne contient pas de code de salle. Scanne le code sur ta télé.',
      ways_to_play: 'Façons de jouer', play_browser: 'Jouer dans le navigateur',
      ios_app: 'Télécharger l’app iOS', android_app: 'Télécharger l’app Android', coming_soon: 'Bientôt disponible', app_size: 'seulement {mb} Mo',
      privacy: 'Confidentialité', imprint: 'Mentions légales', contact: 'Contact', language: 'Langue', dark_mode: 'Mode sombre'
    },
    pt: {
      name: 'Português',
      title_join: 'Entrar na sala · CouchPad', title_room: 'Sala {code} · CouchPad',
      checking: 'Procurando a sala…', not_found: 'Sala não encontrada',
      invalid_link: 'Link inválido', no_code: 'Este link não tem código de sala. Escaneia o código na TV.',
      ways_to_play: 'Formas de jogar', play_browser: 'Jogar no navegador',
      ios_app: 'Baixar o app para iOS', android_app: 'Baixar o app para Android', coming_soon: 'Em breve', app_size: 'só {mb} MB',
      privacy: 'Privacidade', imprint: 'Aviso legal', contact: 'Contato', language: 'Idioma', dark_mode: 'Modo escuro'
    },
    es: {
      name: 'Español',
      title_join: 'Unirse a la sala · CouchPad', title_room: 'Sala {code} · CouchPad',
      checking: 'Buscando la sala…', not_found: 'Sala no encontrada',
      invalid_link: 'Enlace no válido', no_code: 'Este enlace no tiene código de sala. Escanea el código de tu tele.',
      ways_to_play: 'Formas de jugar', play_browser: 'Jugar en el navegador',
      ios_app: 'Descargar la app de iOS', android_app: 'Descargar la app de Android', coming_soon: 'Próximamente', app_size: 'solo {mb} MB',
      privacy: 'Privacidad', imprint: 'Aviso legal', contact: 'Contacto', language: 'Idioma', dark_mode: 'Modo oscuro'
    },
    zh: {
      name: '中文',
      title_join: '加入房间 · CouchPad', title_room: '房间 {code} · CouchPad',
      checking: '正在查找房间…', not_found: '房间未找到',
      invalid_link: '链接无效', no_code: '此链接中没有房间代码。请扫描电视上的二维码。',
      ways_to_play: '游戏方式', play_browser: '在浏览器中玩',
      ios_app: '下载 iOS 应用', android_app: '下载 Android 应用', coming_soon: '即将推出', app_size: '仅 {mb} MB',
      privacy: '隐私', imprint: '法律声明', contact: '联系', language: '语言', dark_mode: '深色模式'
    },
    ja: {
      name: '日本語',
      title_join: 'ルームに参加 · CouchPad', title_room: 'ルーム {code} · CouchPad',
      checking: 'ルームを確認中…', not_found: 'ルームが見つからない',
      invalid_link: '無効なリンク', no_code: 'このリンクにはルームコードがない。テレビのコードをスキャンしてね。',
      ways_to_play: 'プレイ方法', play_browser: 'ブラウザでプレイ',
      ios_app: 'iOSアプリをダウンロード', android_app: 'Androidアプリをダウンロード', coming_soon: '近日公開', app_size: 'わずか{mb}MB',
      privacy: 'プライバシー', imprint: '運営者情報', contact: 'お問い合わせ', language: '言語', dark_mode: 'ダークモード'
    },
    ko: {
      name: '한국어',
      title_join: '방 참가 · CouchPad', title_room: '방 {code} · CouchPad',
      checking: '방을 확인하는 중…', not_found: '방을 찾을 수 없어',
      invalid_link: '잘못된 링크', no_code: '이 링크에는 방 코드가 없어. TV의 코드를 스캔해.',
      ways_to_play: '플레이 방법', play_browser: '브라우저에서 플레이',
      ios_app: 'iOS 앱 다운로드', android_app: 'Android 앱 다운로드', coming_soon: '출시 예정', app_size: '단 {mb}MB',
      privacy: '개인정보', imprint: '법적 고지', contact: '문의', language: '언어', dark_mode: '다크 모드'
    },
    ru: {
      name: 'Русский',
      title_join: 'Войти в комнату · CouchPad', title_room: 'Комната {code} · CouchPad',
      checking: 'Ищем комнату…', not_found: 'Комната не найдена',
      invalid_link: 'Неверная ссылка', no_code: 'В этой ссылке нет кода комнаты. Сканируй код на телевизоре.',
      ways_to_play: 'Как играть', play_browser: 'Играть в браузере',
      ios_app: 'Скачать приложение для iOS', android_app: 'Скачать приложение для Android', coming_soon: 'Скоро', app_size: 'всего {mb} МБ',
      privacy: 'Конфиденциальность', imprint: 'Выходные данные', contact: 'Контакты', language: 'Язык', dark_mode: 'Тёмная тема'
    },
    it: {
      name: 'Italiano',
      title_join: 'Unisciti alla stanza · CouchPad', title_room: 'Stanza {code} · CouchPad',
      checking: 'Ricerca della stanza…', not_found: 'Stanza non trovata',
      invalid_link: 'Link non valido', no_code: 'Questo link non contiene un codice stanza. Scansiona il codice sulla TV.',
      ways_to_play: 'Modi per giocare', play_browser: 'Gioca nel browser',
      ios_app: 'Scarica l’app iOS', android_app: 'Scarica l’app Android', coming_soon: 'Prossimamente', app_size: 'solo {mb} MB',
      privacy: 'Privacy', imprint: 'Note legali', contact: 'Contatti', language: 'Lingua', dark_mode: 'Modalità scura'
    },
    tr: {
      name: 'Türkçe',
      title_join: 'Odaya katıl · CouchPad', title_room: 'Oda {code} · CouchPad',
      checking: 'Oda aranıyor…', not_found: 'Oda bulunamadı',
      invalid_link: 'Geçersiz bağlantı', no_code: 'Bu bağlantıda oda kodu yok. Televizyondaki kodu tara.',
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
    androidSub: document.getElementById('app-android-sub')
  };

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
    setStatus(t('invalid_link'), 'err');
    metaMessage(t('no_code'));
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

  // One headline, no badge — the viewfinder-with-question-mark carries the
  // rest. (People land here from a QR/link, so a stale link is the usual
  // cause; the looked-up code stays visible below.)
  function notFound() {
    el.status.hidden = true;
    // SVG elements lack the HTMLElement `hidden` property — toggle the attribute.
    el.mark.removeAttribute('hidden');
    el.game.textContent = t('not_found');
    el.game.hidden = false;
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
        notFound();
      });
    });
})();
