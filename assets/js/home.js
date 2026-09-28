// Homepage interactions: tabs, publication filter + detail pane, glitch news band.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toArray = function (list) { return Array.prototype.slice.call(list); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  document.documentElement.classList.add('home-js');

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

  // ------------------------------------------------- publications + pane
  function initPubs() {
    var root = document.querySelector('.pub-section');
    if (!root) return;
    var layout = root.querySelector('.pub-layout');
    var rows = toArray(root.querySelectorAll('.pub-row'));
    var pane = root.querySelector('.pub-pane');
    var paneBody = root.querySelector('[data-pane-body]');
    var panePos = root.querySelector('[data-pane-pos]');
    var hint = root.querySelector('[data-pub-hint]');
    var chips = toArray(root.querySelectorAll('.pub-chip'));
    var count = document.querySelector('[data-pub-count]');
    var wide = window.matchMedia('(min-width: 992px)');
    var active = null;

    if (count) count.textContent = rows.length;

    // Show the year only on the first paper of each year.
    var lastYear = null;
    rows.forEach(function (r) {
      var y = r.getAttribute('data-year');
      if (y !== lastYear) r.classList.add('is-year-start');
      lastYear = y;
    });

    function topicsOf(r) {
      return (r.getAttribute('data-topics') || '').split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }
    function visibleRows() {
      return rows.filter(function (r) { return !r.classList.contains('is-dim'); });
    }
    function updatePos() {
      var v = visibleRows(), i = v.indexOf(active);
      panePos.textContent = i >= 0 ? pad2(i + 1) + ' / ' + pad2(v.length) : '';
    }

    chips.forEach(function (chip) {
      var key = chip.getAttribute('data-topic');
      var n = key === 'all' ? rows.length : rows.filter(function (r) { return topicsOf(r).indexOf(key) >= 0; }).length;
      var badge = chip.querySelector('.pub-chip-n');
      if (badge) badge.textContent = n;
      if (key !== 'all' && n === 0) chip.hidden = true;
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        rows.forEach(function (r) {
          r.classList.toggle('is-dim', key !== 'all' && topicsOf(r).indexOf(key) < 0);
        });
        if (active) updatePos();
      });
    });

    function setActive(r, on) {
      r.classList.toggle('is-active', on);
      r.querySelector('.pub-row-btn').setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    function close() {
      if (active) setActive(active, false);
      active = null;
      layout.classList.remove('pane-open');
      pane.hidden = true;
      paneBody.innerHTML = '';
      if (hint) hint.textContent = 'click a paper for details';
    }
    function open(r) {
      if (!wide.matches) {
        var isOpen = r.classList.toggle('is-open');
        r.querySelector('.pub-row-btn').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        return;
      }
      if (active === r) { close(); return; }
      if (active) setActive(active, false);
      active = r;
      setActive(r, true);
      paneBody.innerHTML = r.querySelector('.pub-detail').innerHTML;
      pane.hidden = false;
      layout.classList.add('pane-open');
      pane.classList.remove('is-entering');
      void pane.offsetWidth; // restart the entrance animation
      pane.classList.add('is-entering');
      updatePos();
      if (hint) hint.textContent = 'click again or × to close';
      // If the pane would run past the bottom of the window, scroll so it fits.
      var rect = pane.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        var top = parseFloat(getComputedStyle(pane).top) || 0;
        window.scrollBy({ top: rect.top - top, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
    function step(d) {
      var v = visibleRows();
      if (!v.length) return;
      var i = v.indexOf(active);
      var next = v[i < 0 ? 0 : (i + d + v.length) % v.length];
      if (next !== active) open(next);
    }

    rows.forEach(function (r) {
      r.querySelector('.pub-row-btn').addEventListener('click', function () { open(r); });
    });
    root.querySelector('[data-pane-prev]').addEventListener('click', function () { step(-1); });
    root.querySelector('[data-pane-next]').addEventListener('click', function () { step(1); });
    root.querySelector('[data-pane-close]').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && active) close();
    });
    var onBreakpoint = function () {
      if (!wide.matches) close();
      else rows.forEach(function (r) { r.classList.remove('is-open'); });
    };
    if (wide.addEventListener) wide.addEventListener('change', onBreakpoint);
    else if (wide.addListener) wide.addListener(onBreakpoint);
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

  initTabs();
  initPubs();
  initNews();
})();
