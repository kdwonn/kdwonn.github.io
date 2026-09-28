// Homepage interactions: tabs, publication list + topic filter, glitch news band.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toArray = function (list) { return Array.prototype.slice.call(list); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  document.documentElement.classList.add('home-js');

  // ------------------------------------------------------ fit to viewport
  // On wide screens the page doesn't scroll: header, news band, tabs and
  // filters stay put, and only the content under them scrolls.
  function initFit() {
    var article = document.querySelector('article.home');
    if (!article) return;
    var root = document.documentElement;
    var fits = window.matchMedia('(min-width: 992px) and (min-height: 680px)');

    function apply() {
      if (!fits.matches) {
        root.classList.remove('home-fit', 'home-fit-compact');
        article.style.height = '';
        return;
      }
      root.classList.add('home-fit');
      root.classList.toggle('home-fit-compact', window.innerHeight < 960);
      window.scrollTo(0, 0);
      var footer = document.querySelector('footer.fixed-bottom');
      var bottom = (footer ? footer.offsetHeight : 0) + 16;
      var top = article.getBoundingClientRect().top;
      article.style.height = Math.max(320, window.innerHeight - top - bottom) + 'px';
    }

    window.addEventListener('resize', apply);
    // Keep the page pinned: focusing a control must not scroll the window.
    window.addEventListener('scroll', function () {
      if (root.classList.contains('home-fit') && window.scrollY !== 0) window.scrollTo(0, 0);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
    apply();
  }

  // ---------------------------------------------------------------- tabs
  function initTabs() {
    var list = document.querySelector('.home-tabs');
    if (!list) return;
    var tabs = toArray(list.querySelectorAll('[role="tab"]'));
    var ind = list.querySelector('.home-tabs-ind');
    if (!tabs.length) return;

    function current() {
      return tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    }
    function moveIndicator(tab) {
      if (!ind) return;
      ind.style.left = tab.offsetLeft + 'px';
      ind.style.width = tab.offsetWidth + 'px';
    }
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      moveIndicator(tab);
      if (focus) tab.focus();
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var j;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        else return;
        e.preventDefault();
        select(tabs[j], true);
      });
    });
    window.addEventListener('resize', function () { moveIndicator(current()); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveIndicator(current()); });
    select(current());
  }

  // ------------------------------------------------- publications list
  // Papers are grouped under a year column; the topic chips show only the
  // papers of that topic (and hide years left empty).
  function initPubs() {
    var root = document.querySelector('.pub-section');
    if (!root) return;
    var list = root.querySelector('.pub-list');
    var rows = toArray(root.querySelectorAll('.pub-row'));
    var chips = toArray(root.querySelectorAll('.pub-chip'));
    var count = document.querySelector('[data-pub-count]');
    if (count) count.textContent = rows.length;

    // Regroup the flat bibliography into one block per year.
    var groups = [], byYear = {};
    rows.forEach(function (r) {
      var y = r.getAttribute('data-year');
      var g = byYear[y];
      if (!g) {
        g = document.createElement('div');
        g.className = 'pub-group';
        g.innerHTML = '<div class="pub-group-year"><span>' + y + '</span></div><ol class="bibliography pub-group-items"></ol>';
        byYear[y] = g;
        groups.push(g);
      }
      g.lastChild.appendChild(r.closest('li') || r);
    });
    list.innerHTML = '';
    groups.forEach(function (g) { list.appendChild(g); });
    list.classList.add('is-grouped');

    function topicsOf(r) {
      return (r.getAttribute('data-topics') || '').split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }

    function filter(key) {
      rows.forEach(function (r) {
        var show = key === 'all' || topicsOf(r).indexOf(key) >= 0;
        var item = r.closest('li') || r;
        item.hidden = !show;
        if (show && !reduceMotion) {
          item.classList.remove('is-entering');
          void item.offsetWidth; // restart the fade-in
          item.classList.add('is-entering');
        }
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector('.pub-group-items > li:not([hidden])');
      });
      list.scrollTop = 0;
    }

    chips.forEach(function (chip) {
      var key = chip.getAttribute('data-topic');
      var n = key === 'all' ? rows.length : rows.filter(function (r) { return topicsOf(r).indexOf(key) >= 0; }).length;
      var badge = chip.querySelector('.pub-chip-n');
      if (badge) badge.textContent = n;
      if (key !== 'all' && n === 0) chip.hidden = true;
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        filter(key);
      });
    });
  }

  // ------------------------------------------------------ glitch news band
  function initNews() {
    var band = document.querySelector('[data-news-band]');
    if (!band) return;
    var items = toArray(band.querySelectorAll('.news-band-items > li'));
    var dateEl = band.querySelector('[data-date]');
    var textEl = band.querySelector('[data-text]');
    var posEl = band.querySelector('[data-pos]');
    if (items.length < 2) return;

    var GLYPHS = '#%&*+=<>/\\|_~^$@!?01';
    var STEP_MS = 35, HOLD_MS = 6000;
    var idx = 0, anim = null, hold = null, paused = false;

    function plain(el) { return el.textContent.replace(/\s+/g, ' ').trim(); }

    // Characters switch left to right; each one shows a few random glyphs first.
    function glitch(from, to, offset, t) {
      var len = Math.max(from.length, to.length), out = '';
      for (var i = 0; i < len; i++) {
        var start = Math.round((offset + i) * 0.35), span = 3 + ((offset + i) * 7) % 5;
        var target = to.charAt(i);
        if (t < start) out += from.charAt(i);
        else if (t < start + span) out += (target || from.charAt(i)) === ' ' ? ' ' : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        else out += target;
      }
      return out;
    }

    function schedule() {
      clearTimeout(hold);
      if (!paused && !document.hidden) hold = setTimeout(function () { go(idx + 1); }, HOLD_MS);
    }

    function show(i) {
      var li = items[i];
      var toDate = li.getAttribute('data-date') || '';
      var toText = plain(li);
      var finish = function () {
        anim = null;
        dateEl.textContent = toDate;
        textEl.innerHTML = li.innerHTML;
        schedule();
      };
      posEl.textContent = pad2(i + 1) + ' / ' + pad2(items.length);
      clearInterval(anim);
      clearTimeout(hold);
      if (reduceMotion) { finish(); return; }
      var fromDate = dateEl.textContent, fromText = plain(textEl);
      var total = Math.max(fromDate.length, toDate.length) + 3 + Math.max(fromText.length, toText.length);
      var t = 0;
      anim = setInterval(function () {
        t++;
        dateEl.textContent = glitch(fromDate, toDate, 0, t);
        textEl.textContent = glitch(fromText, toText, Math.max(fromDate.length, toDate.length) + 3, t);
        if (t > Math.round(total * 0.35) + 8) {
          clearInterval(anim);
          finish();
        }
      }, STEP_MS);
    }

    function go(i) {
      idx = (i + items.length) % items.length;
      show(idx);
    }

    band.querySelector('[data-prev]').addEventListener('click', function () { go(idx - 1); });
    band.querySelector('[data-next]').addEventListener('click', function () { go(idx + 1); });
    var pause = function () { paused = true; clearTimeout(hold); };
    var resume = function () { paused = false; if (!anim) schedule(); };
    band.addEventListener('mouseenter', pause);
    band.addEventListener('mouseleave', resume);
    band.addEventListener('focusin', pause);
    band.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(hold);
      else if (!anim) schedule();
    });
    schedule();
  }

  initFit();
  initTabs();
  initPubs();
  initNews();
})();
