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

  // ---------------------------------------------------- condensed header
  // In fit mode, scrolling the content squeezes the header into one line
  // (name, position, email, icons); scrolling back to the top restores it.
  // The change is animated FLIP-style: measure, switch class, animate back.
  function initCondense() {
    var article = document.querySelector('article.home');
    var header = document.querySelector('.home-header');
    if (!article || !header) return;
    var root = document.documentElement;
    var condensed = false, busy = false;
    var EASE = 'cubic-bezier(.65, 0, .35, 1)', MS = 560;

    function fit() { return root.classList.contains('home-fit'); }
    function activeScroller() {
      var panel = article.querySelector('.home-panel:not([hidden])');
      if (!panel) return null;
      return panel.classList.contains('pub-section') ? panel.querySelector('.pub-list') : panel;
    }

    function morph(on) {
      if (on === condensed || busy) return;
      condensed = on;
      if (reduceMotion || !header.animate) {
        header.classList.toggle('is-condensed', on);
        return;
      }
      busy = true;
      var moving = toArray(header.querySelectorAll('.home-id > .post-title, .home-contact > a, .home-id > .contact-icons'));
      var fading = toArray(header.querySelectorAll('.home-header > .home-photo, .home-header > .home-bio, .home-id > .home-tagline'));
      var below = toArray(article.querySelectorAll('.news-band, .home-tabs, .home-panel:not([hidden])'));
      var hr = header.getBoundingClientRect();
      var first = moving.map(function (el) {
        return { r: el.getBoundingClientRect(), fs: parseFloat(getComputedStyle(el).fontSize) };
      });
      var belowTop = below.length ? below[0].getBoundingClientRect().top : 0;

      // Collapsing: leave copies of the photo, tagline and bio in place; the
      // news band slides up over them while they fade.
      var ghosts = [];
      if (on) {
        fading.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var g = el.cloneNode(true);
          g.classList.add('home-ghost');
          g.removeAttribute('id');
          g.setAttribute('aria-hidden', 'true');
          g.style.left = (r.left - hr.left) + 'px';
          g.style.top = (r.top - hr.top) + 'px';
          g.style.width = r.width + 'px';
          g.style.height = r.height + 'px';
          el.parentNode.appendChild(g);
          ghosts.push(g);
        });
      }

      // Expanding: keep the panel at its taller height until the end, so its
      // bottom edge stays put while it slides down (the article clips it).
      var panel = article.querySelector('.home-panel:not([hidden])');
      var panelH = panel ? panel.getBoundingClientRect().height : 0;

      article.classList.add('is-morphing');
      header.classList.add('is-morphing');
      header.classList.toggle('is-condensed', on);
      if (!on && panel) {
        panel.style.flex = 'none';
        panel.style.height = panelH + 'px';
      }
      var hr2 = header.getBoundingClientRect();
      var shift = below.length ? belowTop - below[0].getBoundingClientRect().top : 0;
      var opts = { duration: MS, easing: EASE };
      var anims = [];

      // Everything is animated with transforms and opacity only, from the old
      // positions back to the new layout.
      moving.forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        var k = first[i].fs / (parseFloat(getComputedStyle(el).fontSize) || first[i].fs);
        var dx = (first[i].r.left - hr.left) - (r.left - hr2.left);
        var dy = (first[i].r.top - hr.top) - (r.top - hr2.top);
        anims.push(el.animate([
          { transformOrigin: '0 0', transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + k + ')' },
          { transformOrigin: '0 0', transform: 'none' }
        ], opts));
      });
      below.forEach(function (el) {
        anims.push(el.animate([
          { transform: 'translateY(' + shift + 'px)' },
          { transform: 'none' }
        ], opts));
      });
      ghosts.forEach(function (g) {
        anims.push(g.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-12px)' }
        ], { duration: MS * 0.7, easing: 'ease-in', fill: 'forwards' }));
      });
      if (!on) {
        fading.forEach(function (el) {
          anims.push(el.animate([
            { opacity: 0, transform: 'translateY(-12px)' },
            { opacity: 1, transform: 'none' }
          ], { duration: MS * 0.7, delay: MS * 0.3, easing: 'ease-out', fill: 'backwards' }));
        });
      }

      var done = 0;
      var finish = function () {
        if (++done < anims.length) return;
        ghosts.forEach(function (g) { g.remove(); });
        if (panel) { panel.style.flex = ''; panel.style.height = ''; }
        header.classList.remove('is-morphing');
        article.classList.remove('is-morphing');
        busy = false;
        // Catch up if the content moved while animating.
        var sc = activeScroller();
        if (sc) update(sc);
      };
      anims.forEach(function (a) { a.onfinish = finish; a.oncancel = finish; });
    }

    function update(sc) {
      if (!fit()) return;
      var top = sc.scrollTop;
      var last = sc._homeLastTop || 0;
      if (!condensed && top > 24 && sc.scrollHeight - sc.clientHeight > header.offsetHeight) morph(true);
      else if (condensed && top <= 2 && top <= last) morph(false);
      sc._homeLastTop = top;
    }

    // Scroll events don't bubble; listen in the capture phase.
    article.addEventListener('scroll', function (e) {
      if (e.target === activeScroller()) update(e.target);
    }, true);
    // Already at the top, a scroll up doesn't fire "scroll"; use the wheel.
    article.addEventListener('wheel', function (e) {
      if (!condensed || e.deltaY >= 0 || !fit()) return;
      var sc = activeScroller();
      if (!sc || sc.scrollTop <= 0) morph(false);
    }, { passive: true });
    window.addEventListener('resize', function () {
      if (!fit() && condensed) {
        condensed = false;
        header.classList.remove('is-condensed');
      }
    });
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
    var GLYPHS = '#%&*+=<>/\\|_~^$@!?01';
    var STEP_MS = 35, HOLD_MS = 6000, END_HOLD_MS = 3000, SLIDE_DELAY_MS = 1500, SLIDE_PX_PER_S = 60;
    var idx = 0, anim = null, hold = null, slide = null, pending = 0, paused = false;
    var items = toArray(band.querySelectorAll('.news-band-items > .news-item'));
    var dateEl = band.querySelector('[data-date]');
    var textEl = band.querySelector('[data-text]');
    var posEl = band.querySelector('[data-pos]');
    var list = band.querySelector('.news-band-items');
    var toggle = band.querySelector('[data-news-toggle]');
    var open = false;

    var pause = function () { paused = true; clearTimeout(hold); if (slide) slide.pause(); };
    var resume = function () {
      if (open || items.length < 2) return;
      paused = false;
      if (slide) slide.play();
      else if (pending) slideLater();
      else if (!anim) schedule(textEl.classList.contains('is-end') ? END_HOLD_MS : HOLD_MS);
    };

    // "all news" expands the full list under the band instead of leaving the page.
    function setOpen(next) {
      open = next;
      list.hidden = !open;
      band.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        pause();
        // In the pinned layout, keep the list inside the window above the footer.
        list.style.maxHeight = '';
        if (document.documentElement.classList.contains('home-fit')) {
          var footer = document.querySelector('footer.fixed-bottom');
          var room = window.innerHeight - band.getBoundingClientRect().bottom - (footer ? footer.offsetHeight : 0) - 16;
          list.style.maxHeight = Math.max(160, Math.min(room, 440)) + 'px';
        }
        list.scrollTop = 0;
      }
      else if (!band.matches(':hover') && !band.contains(document.activeElement)) resume();
    }
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (e) { e.preventDefault(); setOpen(!open); });
    toggle.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); setOpen(!open); }
    });
    document.addEventListener('click', function (e) {
      if (open && !band.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (open && e.key === 'Escape') { setOpen(false); toggle.focus(); }
    });

    if (items.length < 2) return;

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

    function schedule(ms) {
      clearTimeout(hold);
      if (!paused && !document.hidden) hold = setTimeout(function () { go(idx + 1); }, ms || HOLD_MS);
    }

    // A message wider than the band scrolls to its end once, then holds.
    function settle() {
      stopSlide();
      var run = textEl.querySelector('.news-band-run');
      var over = run ? Math.ceil(run.offsetWidth - textEl.clientWidth) : 0;
      textEl.classList.toggle('is-long', over > 0);
      if (over <= 0 || reduceMotion || !run.animate) { schedule(); return; }
      pending = over;
      slideLater();
    }
    function slideLater() {
      clearTimeout(hold);
      if (!paused && !document.hidden) hold = setTimeout(startSlide, SLIDE_DELAY_MS);
    }
    function startSlide() {
      var run = textEl.querySelector('.news-band-run');
      var over = pending;
      pending = 0;
      if (!run || over <= 0) { schedule(); return; }
      textEl.classList.add('is-moving');
      slide = run.animate([
        { transform: 'none' },
        { transform: 'translateX(' + -over + 'px)' }
      ], { duration: Math.max(1500, over / SLIDE_PX_PER_S * 1000), easing: 'ease-in-out', fill: 'forwards' });
      slide.onfinish = function () {
        slide = null;
        textEl.classList.remove('is-moving');
        textEl.classList.add('is-end');
        schedule(END_HOLD_MS);
      };
    }
    function stopSlide() {
      pending = 0;
      textEl.classList.remove('is-moving', 'is-end');
      if (!slide) return;
      slide.onfinish = null;
      slide.cancel();
      slide = null;
    }
    function wrap(html) { return '<span class="news-band-run">' + html + '</span>'; }

    function show(i) {
      var li = items[i];
      var liText = li.querySelector('.news-item-text');
      var toDate = li.getAttribute('data-date');
      var toText = plain(liText);
      items.forEach(function (el, j) { el.classList.toggle('is-current', j === i); });
      var finish = function () {
        anim = null;
        dateEl.textContent = toDate;
        textEl.innerHTML = wrap(liText.innerHTML);
        settle();
      };
      posEl.textContent = pad2(i + 1) + ' / ' + pad2(items.length);
      clearInterval(anim);
      clearTimeout(hold);
      stopSlide();
      textEl.classList.remove('is-long', 'is-end');
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
    band.addEventListener('mouseenter', pause);
    band.addEventListener('mouseleave', resume);
    band.addEventListener('focusin', pause);
    band.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(hold);
      else if (pending) slideLater();
      else if (!anim && !slide) schedule();
    });
    items[0].classList.add('is-current');
    // The first message is rendered by the page; measure it once fonts load.
    textEl.innerHTML = wrap(textEl.innerHTML);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    else settle();
  }

  initFit();
  initCondense();
  initTabs();
  initPubs();
  initNews();
})();
