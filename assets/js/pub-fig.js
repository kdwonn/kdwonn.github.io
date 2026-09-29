// pub-fig.js: interactive publication preview figures.
//   ACID: cycle, lens · CompACT: tokens, squeeze, race, rollout, touch
// Mounts itself on every <canvas data-fig-scene="...">. Other data attributes,
// re-read every frame so they can change live:
//   data-fig-style    = drafting | sketch
//   data-fig-colorway = ultramarine | signal | inverse
//   data-fig-boil     = true | false
// (the older data-acid-* names are still read)
(function () {
  if (window.__pubFig) return;
  window.__pubFig = true;

  const W = 400, H = 225, TAU = Math.PI * 2;
  const BASE = {
    bg: '#ffffff', ink: '#15181d', mute: '#7c828c', faint: 'rgba(20,30,50,.18)',
    grid: 'rgba(20,30,50,.13)', acc: '#1a3190', accSoft: 'rgba(26,49,144,.07)',
    bad: '#15181d', badSoft: 'rgba(20,30,50,.04)',
  };
  const THEMES = {
    ultramarine: BASE,
    signal: { ...BASE, bad: '#e0531f', badSoft: 'rgba(224,83,31,.08)' },
    inverse: {
      bg: '#15181d', ink: '#eceef1', mute: '#8b919b', faint: 'rgba(236,238,241,.2)',
      grid: 'rgba(236,238,241,.1)', acc: '#8ea2ff', accSoft: 'rgba(142,162,255,.1)',
      bad: '#ff8a5b', badSoft: 'rgba(255,138,91,.1)',
    },
  };

  // ---------------------------------------------------------------- math
  const wrap = (a) => (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function hash(n) {
    n = (n | 0) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  function noise(seed, s) {
    const p1 = hash(seed * 3 + 1) * TAU, p2 = hash(seed * 3 + 2) * TAU, p3 = hash(seed * 3 + 3) * TAU;
    return 0.55 * Math.sin(s / 31 + p1) + 0.3 * Math.sin(s / 13.7 + p2) + 0.15 * Math.sin(s / 5.9 + p3);
  }
  function cubic(p0, c0, c1, p1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1],
      ]);
    }
    return out;
  }
  function arcPts(c, r, a0, a1, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(polar(c, r, a0 + (a1 - a0) * i / n));
    return out;
  }
  function resample(pts, step) {
    const out = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const nx = -dy / L, ny = dx / L, n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) out.push({ x: a[0] + dx * k / n, y: a[1] + dy * k / n, s: s + L * k / n, nx, ny });
      s += L;
    }
    const last = pts[pts.length - 1], prev = out[out.length - 1] || { nx: 0, ny: 0 };
    out.push({ x: last[0], y: last[1], s, nx: prev.nx, ny: prev.ny });
    return out;
  }

  // ---------------------------------------------------------------- pen
  // One pen per frame: knows the theme, the rendering style and the scale.
  function makePen(ctx, cfg) {
    const T = cfg.theme, sketch = cfg.style === 'sketch';
    const minW = 1.05 / cfg.k;                 // never thinner than ~1 css px
    const lw = (w) => Math.max(w, minW);
    const amp = sketch ? 0.85 : cfg.boil ? 0.3 : 0;
    const sd = (s) => (cfg.boil ? s + cfg.phase * 7919 : s);
    const P = { T, sketch, small: cfg.small, k: cfg.k };

    // polyline; returns the (wobbled) points actually drawn
    P.line = (pts, o = {}) => {
      if (pts.length < 2) return null;
      const seed = sd(o.seed || 1), a = o.amp ?? amp;
      const r = resample(pts, o.dash ? 1.5 : 3);
      const total = r[r.length - 1].s, lim = (o.upto ?? 1) * total;
      const q = [];
      for (const p of r) {
        if (p.s > lim) break;
        const edge = Math.min(1, p.s / 8, (total - p.s) / 8 + 0.3);
        const d = a ? a * noise(seed, p.s) * edge : 0;
        q.push([p.x + p.nx * d, p.y + p.ny * d, p.s]);
      }
      if (q.length < 2) return q;
      ctx.save();
      ctx.lineCap = sketch ? 'round' : (o.cap || 'butt');
      ctx.lineJoin = sketch ? 'round' : 'miter';
      ctx.strokeStyle = o.color || T.ink;
      ctx.lineWidth = lw(o.w ?? 1.4);
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.beginPath();
      if (o.dash) {
        const [on, off] = o.dash, per = on + off, ph = o.dashOffset || 0;
        let pen = false;
        for (const p of q) {
          const onNow = ((p[2] + ph) % per + per) % per < on;
          if (onNow && !pen) ctx.moveTo(p[0], p[1]);
          else if (onNow) ctx.lineTo(p[0], p[1]);
          pen = onNow;
        }
      } else q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.restore();
      return q;
    };

    P.head = (tip, ang, o = {}) => {
      const h = o.head ?? 7, color = o.color || T.ink;
      if (sketch) {
        for (const s of [-1, 1]) {
          const a = ang + Math.PI + s * 0.5;
          P.line([tip, [tip[0] + h * Math.cos(a), tip[1] + h * Math.sin(a)]], { ...o, dash: null, amp: 0.3, seed: (o.seed || 1) * 5 + s, upto: 1 });
        }
        return;
      }
      const hw = h * 0.36;
      const b = [tip[0] - h * Math.cos(ang), tip[1] - h * Math.sin(ang)];
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(b[0] - hw * Math.sin(ang), b[1] + hw * Math.cos(ang));
      ctx.lineTo(b[0] + hw * Math.sin(ang), b[1] - hw * Math.cos(ang));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    P.arrow = (pts, o = {}) => {
      const h = o.head ?? 7;
      // stop the shaft short of the tip so a filled head stays crisp
      const n = pts.length, tip = pts[n - 1], prev = pts[n - 2];
      const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
      const shaft = sketch ? pts : [...pts.slice(0, -1), [tip[0] - h * 0.6 * Math.cos(ang), tip[1] - h * 0.6 * Math.sin(ang)]];
      const q = P.line(shaft, o);
      if (!q || q.length < 2) return;
      if (sketch) {
        const t = q[q.length - 1];
        let j = q.length - 2;
        while (j > 0 && t[2] - q[j][2] < 6) j--;
        P.head(t, Math.atan2(t[1] - q[j][1], t[0] - q[j][0]), o);
      } else if ((o.upto ?? 1) >= 1) P.head(tip, ang, o);
    };
    P.ray = (a, b, o) => P.arrow([a, b], o);

    P.circle = (c, r, o = {}) => {
      const n = Math.max(32, r * 1.2 | 0);
      if (o.fill) {
        ctx.save();
        ctx.fillStyle = o.fill;
        ctx.globalAlpha = o.fillAlpha ?? 1;
        ctx.beginPath();
        ctx.arc(c[0], c[1], r, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      if (o.w === 0) return;
      if (sketch) {
        const a0 = hash(o.seed || 3) * TAU;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const th = a0 + (TAU + 0.3) * i / n;
          pts.push(polar(c, r * (1 + 0.03 * (i / n - 0.5)), th));
        }
        P.line(pts, { ...o, amp: 0.45 });
      } else P.line(arcPts(c, r, 0, TAU, n), o);
    };

    P.rect = (x, y, w, h, o = {}) => {
      if (o.fill) {
        ctx.save();
        ctx.fillStyle = o.fill;
        ctx.globalAlpha = o.fillAlpha ?? 1;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
      if (o.w === 0) return;
      if (sketch) {
        const e = 1.5;
        P.line([[x - e, y], [x + w + e * 0.5, y]], { ...o, seed: (o.seed || 1) });
        P.line([[x + w, y - e], [x + w, y + h + e * 0.5]], { ...o, seed: (o.seed || 1) + 1 });
        P.line([[x + w + e, y + h], [x - e * 0.5, y + h]], { ...o, seed: (o.seed || 1) + 2 });
        P.line([[x, y + h + e], [x, y - e * 0.5]], { ...o, seed: (o.seed || 1) + 3 });
      } else P.line([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], o);
    };

    // 45-degree hatching clipped to a path
    P.hatch = (build, bbox, o = {}) => {
      const gap = o.gap ?? 3.2;
      ctx.save();
      ctx.beginPath();
      build(ctx);
      ctx.clip();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      const [x0, y0, x1, y1] = bbox, span = (x1 - x0) + (y1 - y0);
      for (let k = -span; k < span; k += gap) {
        P.line([[x0 + k, y1], [x0 + k + (y1 - y0), y0]], { seed: 9 + k, w: o.w ?? 0.8, color: o.color, amp: sketch ? 0.3 : 0, alpha: o.alpha ?? 1 });
      }
      ctx.restore();
    };

    P.text = (str, x, y, o = {}) => {
      if (o.detail && (cfg.small || (o.size ?? 8) * cfg.k < 6.2)) return;
      const size = o.size ?? 8;
      const s = sketch ? str.toLowerCase() : (o.keepCase ? str : str.toUpperCase());
      ctx.save();
      ctx.font = `${o.bold ? 700 : 400} ${size}px "iA Writer Mono", ui-monospace, Menlo, monospace`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = sketch || o.keepCase ? '0px' : `${(size * 0.12).toFixed(2)}px`;
      ctx.fillStyle = o.color || T.mute;
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
      const m = ctx.measureText(s).width;
      ctx.restore();
      return m;
    };

    // a small label box sitting on a wire
    P.chip = (cx, cy, str, o = {}) => {
      const h = 13, w = cfg.small ? 18 : Math.max(24, str.length * 5.1 + 14);
      P.rect(cx - w / 2, cy - h / 2, w, h, { fill: T.bg, w: 1.2, color: o.color || T.ink, seed: o.seed || 60 });
      if (!cfg.small) P.text(str, cx, cy + 0.5, { align: 'center', size: 7, color: o.color || T.ink });
    };

    P.target = (c, r, o = {}) => {
      P.circle(c, r, { w: 1.3, color: o.color || T.ink, seed: 71, fill: o.fill });
      const e = r + 4;
      P.line([[c[0] - e, c[1]], [c[0] + e, c[1]]], { w: 1, color: o.color || T.ink, seed: 72 });
      P.line([[c[0], c[1] - e], [c[0], c[1] + e]], { w: 1, color: o.color || T.ink, seed: 73 });
    };

    P.crosshair = (p, o = {}) => {
      const r = o.r ?? 5, c = o.color || T.mute;
      P.line([[p[0] - r - 3, p[1]], [p[0] - 2, p[1]]], { w: 1, color: c, amp: 0 });
      P.line([[p[0] + 2, p[1]], [p[0] + r + 3, p[1]]], { w: 1, color: c, amp: 0 });
      P.line([[p[0], p[1] - r - 3], [p[0], p[1] - 2]], { w: 1, color: c, amp: 0 });
      P.line([[p[0], p[1] + 2], [p[0], p[1] + r + 3]], { w: 1, color: c, amp: 0 });
    };

    P.check = (x, y, s, o = {}) => P.line([[x - 4 * s, y], [x - 1.2 * s, y + 3 * s], [x + 4.5 * s, y - 4 * s]], { w: 1.6, amp: sketch ? 0.3 : 0, ...o });
    P.cross = (x, y, s, o = {}) => {
      P.line([[x - 3.2 * s, y - 3.2 * s], [x + 3.2 * s, y + 3.2 * s]], { w: 1.6, amp: sketch ? 0.3 : 0, ...o });
      P.line([[x + 3.2 * s, y - 3.2 * s], [x - 3.2 * s, y + 3.2 * s]], { w: 1.6, amp: sketch ? 0.3 : 0, seed: 5, ...o });
    };

    // the mismatch between two directions at c: hatched sector + dimension arc
    P.gap = (c, a0, a1, r, o = {}) => {
      const d = wrap(a1 - a0);
      if (Math.abs(d) < 0.06) return;
      P.hatch((g) => { g.moveTo(c[0], c[1]); g.arc(c[0], c[1], r, a0, a0 + d, d < 0); g.closePath(); },
        [c[0] - r, c[1] - r, c[0] + r, c[1] + r], { color: T.bad, fill: T.badSoft, gap: o.gap ?? 3, w: 0.8 });
      if (o.dim) {
        const R = o.dim, pts = arcPts(c, R, a0, a0 + d, 20);
        P.line(pts, { w: 1, color: T.bad, seed: 88 });
        if (Math.abs(d) > 0.25 && !sketch) {
          const s = Math.sign(d);
          P.head(pts[pts.length - 1], a0 + d + s * Math.PI / 2, { color: T.bad, head: 5 });
          P.head(pts[0], a0 - s * Math.PI / 2, { color: T.bad, head: 5 });
        }
        // extension lines out to the dimension arc
        P.line([polar(c, r + 2, a0), polar(c, R + 3, a0)], { w: 0.8, color: T.bad, alpha: 0.7, seed: 89 });
        P.line([polar(c, r + 2, a0 + d), polar(c, R + 3, a0 + d)], { w: 0.8, color: T.bad, alpha: 0.7, seed: 90 });
      }
    };

    P.dots = (x0, y0, x1, y1, pitch, o = {}) => {
      ctx.save();
      ctx.fillStyle = o.color || T.grid;
      for (let x = x0; x <= x1 + 0.1; x += pitch)
        for (let y = y0; y <= y1 + 0.1; y += pitch) ctx.fillRect(x - 0.5 / cfg.k * 1.2, y - 0.5 / cfg.k * 1.2, 1.2 / cfg.k, 1.2 / cfg.k);
      ctx.restore();
    };

    P.marks = () => {
      if (cfg.small) return;
      for (const [x, y] of [[9, 9], [W - 9, H - 9]]) {
        P.line([[x - 3.5, y], [x + 3.5, y]], { w: 0.9, color: T.faint, amp: 0 });
        P.line([[x, y - 3.5], [x, y + 3.5]], { w: 0.9, color: T.faint, amp: 0 });
      }
    };
    return P;
  }

  // ---------------------------------------------------------------- A: cycle
  // action dial -> world model -> prediction panel -> inverse dynamics -> dial.
  // The pointer steers the commanded action a. The world model bends every
  // prediction toward the goal, so the recovered action matches a only when
  // the step is honest; otherwise the cycle stays open by the hatched gap.
  function cycleScene() {
    const C = [98, 113], R = 48;
    const PX = 262, PY = 58, PW = 112, PH = 110;
    const S = [290, 138], G = [346, 86];
    const thG = Math.atan2(G[1] - S[1], G[0] - S[0]);
    const WX = PX + PW - 26;
    const topWire = [[C[0], C[1] - R - 12], [C[0], 26], [WX, 26], [WX, PY - 1]];
    const botWire = [[WX, PY + PH + 1], [WX, 202], [C[0], 202], [C[0], C[1] + R + 12]];
    const along = (pts, u) => {
      const segs = [];
      let tot = 0;
      for (let i = 0; i < pts.length - 1; i++) { const l = dist(pts[i], pts[i + 1]); segs.push(l); tot += l; }
      let s = u * tot;
      for (let i = 0; i < segs.length; i++) {
        if (s <= segs[i]) { const t = s / segs[i]; return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]; }
        s -= segs[i];
      }
      return pts[pts.length - 1];
    };
    return {
      idle: (t) => polar(C, 120, -0.9 + 1.25 * Math.sin(t * 0.42) + 0.35 * Math.sin(t * 1.1)),
      draw(P, st) {
        const T = P.T, t = st.t;
        P.marks();

        // wires + chips
        P.arrow(topWire, { w: 1.4, color: T.ink, seed: 3, head: 7 });
        P.arrow(botWire, { w: 1.4, color: T.ink, seed: 4, head: 7, dash: P.sketch ? [5, 4] : null });
        const tok = (pts, u, fill) => {
          const p = along(pts, u);
          P.rect(p[0] - 3, p[1] - 3, 6, 6, { fill, w: 1, color: T.ink, seed: 5 });
        };
        const ph = (t * 0.32) % 1;
        tok(topWire, ph, T.ink);
        tok(botWire, (ph + 0.5) % 1, T.acc);
        P.chip((C[0] + WX) / 2, 26, 'world model', { seed: 61 });
        P.chip((C[0] + WX) / 2, 202, 'inverse dynamics', { seed: 62, color: T.acc });

        // angles
        const thU = Math.atan2(st.ptr[1] - C[1], st.ptr[0] - C[0]);
        const thD = thU + 0.75 * Math.sin(wrap(thG - thU));
        const gap = wrap(thD - thU), ok = Math.abs(gap) < 0.1;

        // prediction panel
        P.rect(PX, PY, PW, PH, { fill: T.bg, w: 1.2, color: T.ink, seed: 20 });
        P.dots(PX + 8, PY + 8, PX + PW - 8, PY + PH - 8, 10.25);
        P.text('prediction', PX, PY - 9, { detail: true });
        P.target(G, 6.5, { fill: T.bg });
        const L = 44, Pd = polar(S, L, thD);
        P.ray(S, polar(S, L, thU), { w: 1.1, color: T.mute, dash: [3, 3], head: 5, seed: 21 });
        const e = ease(((t % 2.6) / 2.6) / 0.5);
        if (e > 0.03) P.arrow([S, [lerp(S[0], Pd[0], e), lerp(S[1], Pd[1], e)]], { w: 2, color: T.acc, head: 7, seed: 22 });
        P.rect(S[0] - 3, S[1] - 3, 6, 6, { fill: T.bg, w: 1.3, color: T.ink, seed: 23 });

        // action dial
        P.text('action', C[0] - R, C[1] - R - 16, { detail: true });
        P.circle(C, R, { w: 1, color: T.faint, seed: 30 });
        for (let i = 0; i < 24; i++) {
          const a = i * TAU / 24, long = i % 6 === 0;
          P.line([polar(C, R - (long ? 7 : 3.5), a), polar(C, R, a)], { w: long ? 1.1 : 0.8, color: long ? T.mute : T.faint, amp: 0 });
        }
        P.gap(C, thU, thD, 28, { dim: R + 9 });
        P.ray(C, polar(C, R - 5, thD), { w: 2, color: T.acc, head: 7, seed: 32, dash: P.sketch ? [5, 3] : null });
        P.ray(C, polar(C, R - 5, thU), { w: 2.4, color: T.ink, head: 8, seed: 31 });
        P.rect(C[0] - 2.5, C[1] - 2.5, 5, 5, { fill: T.ink, w: 0 });
        const sep = ok ? 0.28 : 0;
        P.text('a', ...polar(C, R + 17, thU - sep), { align: 'center', size: 11, color: T.ink, bold: true, keepCase: true, detail: true });
        P.text('â', ...polar(C, R + 17, thD + sep), { align: 'center', size: 11, color: T.acc, bold: true, keepCase: true, detail: true });

        // pointer guide (construction line + crosshair)
        if (!P.small) {
          P.line([C, st.ptr], { w: 0.8, color: T.faint, dash: [2, 3], amp: 0 });
          P.crosshair(st.ptr, { color: T.mute });
        }

        // status readout
        const deg = Math.round(Math.abs(gap) * 180 / Math.PI);
        if (ok) P.text('cycle closed', W - 12, 12, { align: 'right', size: 7.5, color: T.acc, detail: true });
        else P.text(`cycle open  Δ ${String(deg).padStart(2, '0')}°`, W - 12, 12, { align: 'right', size: 7.5, color: T.bad, detail: true });
      },
    };
  }

  // ---------------------------------------------------------------- B: lens
  // Two imagined routes, both ending at the goal. The pointer is the IDM
  // loupe: under it every step shows its commanded action (ink) and the
  // action that explains the step (accent). One route fails the check.
  function lensScene() {
    const S = [34, 150], G = [364, 60], N = 9;
    const upC = [[100, 22], [250, 14]], loC = [[175, 236], [335, 218]];
    const route = (c) => { const p = cubic(S, c[0], c[1], G, N * 6); return Array.from({ length: N + 1 }, (_, i) => p[i * 6]); };
    const mk = (pts, bad, id) => pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1], d = Math.atan2(q[1] - p[1], q[0] - p[0]);
      return { p, d, u: bad ? d + 0.2 + 0.7 * (i / (N - 1)) : d, bad: bad && i > 0, id, i, seen: -1e9 };
    });
    const up = route(upC), lo = route(loC);
    const steps = [...mk(up, false, 0), ...mk(lo, true, 1)];
    const RL = 36;
    return {
      idle: (t) => [200 + 150 * Math.sin(t * 0.3), 112 + 58 * Math.sin(t * 0.6 + 1.1)],
      draw(P, st) {
        const T = P.T, t = st.t, L = st.ptr;
        P.marks();
        P.line(cubic(S, upC[0], upC[1], G, 60), { w: 1.1, color: T.mute, dash: [2.5, 3.5], seed: 3 });
        P.line(cubic(S, loC[0], loC[1], G, 60), { w: 1.1, color: T.mute, dash: [2.5, 3.5], seed: 4 });
        P.rect(S[0] - 5, S[1] - 5, 10, 10, { fill: T.ink, w: 0 });
        P.text('start', S[0] - 5, S[1] + 16, { detail: true });
        P.target(G, 7, { fill: T.bg });
        P.text('goal', G[0] + 12, G[1] + 18, { align: 'right', detail: true });

        let fails = 0, passes = 0, near = null;
        for (const s of steps) {
          const d = dist(s.p, L);
          if (d < RL - 3) { s.seen = t; if (!near || d < near.dd) near = { ...s, dd: d }; }
          const age = t - s.seen, fade = clamp(1 - (age - 4) / 2.5, 0, 1);
          if (fade > 0 && s.i > 0) (s.bad ? (fails += fade) : (passes += fade));
          P.rect(s.p[0] - 2.8, s.p[1] - 2.8, 5.6, 5.6, { fill: T.bg, w: 1.1, color: T.ink, seed: 20 + s.i });
          if (d >= RL - 3 && fade > 0 && s.i > 0) {
            if (s.bad) P.cross(s.p[0] + 8, s.p[1] - 8, 0.75, { color: T.bad, alpha: fade });
            else P.check(s.p[0] + 8, s.p[1] - 8, 0.75, { color: T.acc, alpha: fade });
          }
        }

        // route verdict tags
        if (!P.small) {
          const a1 = clamp(passes / 2, 0, 1), a2 = clamp(fails / 2, 0, 1);
          if (a1 > 0) P.text('realizable', 150, 16, { align: 'center', color: T.acc, alpha: a1, size: 7.5 });
          if (a2 > 0) P.text('looks right, is not', 238, 214, { align: 'center', color: T.bad, alpha: a2, size: 7.5 });
        }

        // loupe contents
        const ctx = st.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(L[0], L[1], RL, 0, TAU);
        ctx.clip();
        ctx.fillStyle = T.bg;
        ctx.fillRect(L[0] - RL, L[1] - RL, 2 * RL, 2 * RL);
        ctx.fillStyle = T.accSoft;
        ctx.fillRect(L[0] - RL, L[1] - RL, 2 * RL, 2 * RL);
        P.dots(Math.floor((L[0] - RL) / 8) * 8, Math.floor((L[1] - RL) / 8) * 8, L[0] + RL, L[1] + RL, 8);
        P.line(cubic(S, upC[0], upC[1], G, 60), { w: 1.1, color: T.mute, dash: [2.5, 3.5], seed: 3 });
        P.line(cubic(S, loC[0], loC[1], G, 60), { w: 1.1, color: T.mute, dash: [2.5, 3.5], seed: 4 });
        for (const s of steps) {
          if (dist(s.p, L) > RL + 22) continue;
          if (s.bad) P.gap(s.p, s.u, s.d, 13);
          P.ray(s.p, polar(s.p, 19, s.d), { w: 1.6, color: T.acc, head: 5.5, seed: 60 + s.i });
          P.ray(s.p, polar(s.p, 19, s.u), { w: 1.9, color: T.ink, head: 5.5, seed: 61 + s.i });
          P.rect(s.p[0] - 2.8, s.p[1] - 2.8, 5.6, 5.6, { fill: T.bg, w: 1.1, color: T.ink, seed: 20 + s.i });
        }
        ctx.restore();

        // reticle
        P.circle(L, RL, { w: 1.6, color: T.ink, seed: 80 });
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          P.line([polar(L, RL + 1, a), polar(L, RL + 6, a)], { w: 1.4, color: T.ink, amp: 0 });
        }
        for (let i = 0; i < 36; i++) {
          if (i % 9 === 0) continue;
          const a = i * TAU / 36;
          P.line([polar(L, RL - 3, a), polar(L, RL, a)], { w: 0.7, color: T.mute, amp: 0 });
        }
        P.text('idm', L[0] + RL * 0.72 + 4, L[1] - RL * 0.72 - 5, { size: 7.5, color: T.ink, detail: true });
        if (near && near.i > 0) {
          const deg = Math.round(Math.abs(wrap(near.u - near.d)) * 180 / Math.PI);
          P.text(`Δ ${String(deg).padStart(2, '0')}°`, L[0] + RL * 0.72 + 4, L[1] + RL * 0.72 + 6, { size: 7.5, color: deg > 3 ? T.bad : T.acc, keepCase: true, detail: true });
        }
      },
    };
  }

  // ================================================================ CompACT
  // A tabletop observation, 150x150 in frame-local units. Eight semantic
  // regions stand in for the eight tokens the resampler learns to attend to.
  const TOKENS = ['arm', 'gripper', 'cube', 'cup', 'goal', 'table', 'wall', 'space'];
  const TGT = [116, 131];
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function owner(x, y) {
    if (x > 72 && x < 97 && y > 57 && y < 82) return 1;
    if (x > 69 && x < 96 && y > 87 && y < 113) return 2;
    if (x > 105 && x < 131 && y > 81 && y < 113) return 3;
    if (Math.hypot(x - TGT[0], y - TGT[1]) < 11) return 4;
    if (segDist([x, y], [18, 102], [42, 52]) < 8 || segDist([x, y], [42, 52], [84, 58]) < 8 || (x > 5 && x < 31 && y > 97 && y < 113)) return 0;
    if (y < 34) return 6;
    if (y > 112) return 5;
    return 7;
  }
  // centroids of each region, sampled once
  const CENT = (() => {
    const acc = TOKENS.map(() => [0, 0, 0]);
    for (let y = 1; y < 150; y += 2) for (let x = 1; x < 150; x += 2) { const k = owner(x, y); acc[k][0] += x; acc[k][1] += y; acc[k][2]++; }
    return acc.map(([x, y, n]) => [x / n, y / n]);
  })();

  // Scene state: wrist position and cube centre (frame units). The arm is a
  // two-link chain from a fixed base, solved by IK so the wrist can move.
  const ARM0 = [18, 100], L1 = Math.hypot(24, 48), L2 = Math.hypot(42, 6);
  const HOME = { wrist: [84, 58], cube: [83, 101] };
  function elbowOf(w) {
    const d = clamp(dist(w, ARM0), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
    const th = Math.atan2(w[1] - ARM0[1], w[0] - ARM0[0]);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    return polar(ARM0, L1, th - a);
  }
  // which of the 8 tokens a frame point belongs to, for a given state
  function ownerS(x, y, S) {
    const w = S.wrist, c = S.cube, el = elbowOf(w);
    if (x > w[0] - 12 && x < w[0] + 12 && y > w[1] - 1 && y < w[1] + 24) return 1;
    if (Math.abs(x - c[0]) < 13 && y > c[1] - 13 && y < 113) return 2;
    if (x > 105 && x < 131 && y > 81 && y < 113) return 3;
    if (Math.hypot(x - TGT[0], y - TGT[1]) < 11) return 4;
    if (segDist([x, y], ARM0, el) < 8 || segDist([x, y], el, w) < 8 || (x > 5 && x < 31 && y > 97 && y < 113)) return 0;
    if (y < 34) return 6;
    if (y > 112) return 5;
    return 7;
  }

  // draws the scene into the frame at (fx, fy), s units per frame unit
  function drawTabletop(P, fx, fy, s, o = {}) {
    const T = P.T, m = (x, y) => [fx + x * s, fy + y * s];
    const S = o.state || HOME, w0 = S.wrist, cb = S.cube, el = elbowOf(w0);
    const w = o.w ?? 1.3, c = o.color || T.ink;
    if (!o.only) {
      P.line([m(0, 34), m(150, 34)], { w: w * 0.8, color: T.mute, seed: 101 });
      P.rect(fx + 16 * s, fy + 10 * s, 36 * s, 16 * s, { w: w * 0.8, color: T.mute, seed: 102 });
      P.line([m(0, 112), m(150, 112)], { w, color: c, seed: 103 });
      P.rect(fx + 108 * s, fy + 84 * s, 20 * s, 28 * s, { fill: T.bg, w, color: c, seed: 111 });
      P.line([m(108, 89), m(128, 89)], { w: w * 0.7, color: c, seed: 112 });
      P.target(m(TGT[0], TGT[1]), 4.5 * s, {});
      P.rect(fx + 7 * s, fy + 100 * s, 22 * s, 12 * s, { fill: T.bg, w, color: c, seed: 104 });
    }
    const lo = { color: c, alpha: o.alpha ?? 1, dash: o.dash || null };
    // cube
    P.rect(fx + (cb[0] - 11) * s, fy + (cb[1] - 11) * s, 22 * s, 22 * s, { fill: o.dash ? null : T.bg, w, ...lo, seed: 110 });
    // arm
    P.line([m(...ARM0), m(...el), m(...w0)], { w: w * 2.2, ...lo, seed: 105 });
    if (!o.dash) {
      P.circle(m(...el), 3.2 * s, { fill: T.bg, w, color: c, seed: 106 });
      P.circle(m(...ARM0), 3.2 * s, { fill: T.bg, w, color: c, seed: 107 });
    }
    // gripper
    const g = (dx, dy) => m(w0[0] + dx, w0[1] + dy);
    P.line([g(0, 0), g(0, 6)], { w: w * 1.6, ...lo, seed: 108 });
    P.line([g(-8, 20), g(-8, 6), g(8, 6), g(8, 20)], { w, ...lo, seed: 109 });
  }

  // one world-model step of the toy dynamics: move the wrist by a, push the cube
  function stepState(S, a) {
    const w = [clamp(S.wrist[0] + a[0], 36, 140), clamp(S.wrist[1] + a[1], 40, 90)];
    let c = S.cube.slice();
    const touching = Math.abs(w[0] - c[0]) < 19 && w[1] + 20 > c[1] - 11;
    if (touching && Math.abs(a[0]) > 0.3) {
      c[0] = clamp(w[0] + Math.sign(a[0]) * 19, 14, 136);
      if (w[1] + 20 > c[1] - 11 && Math.abs(w[0] - c[0]) < 19) w[1] = Math.min(w[1], c[1] - 31);
    }
    if (w[1] + 20 > c[1] - 11 && Math.abs(w[0] - c[0]) < 19) w[1] = c[1] - 31;
    return { wrist: w, cube: c };
  }
  // per-token 4-bit codes, so a token visibly "changes value" when its object moves
  function codes(S) {
    const q = (v) => Math.round(v / 6);
    const k = [q(S.wrist[0]) * 3 + q(S.wrist[1]), q(S.wrist[0]) * 5 + q(S.wrist[1]) * 7, q(S.cube[0]) * 11, 3, 5, 9, 12, 6];
    return k.map((v, i) => Math.floor(hash(v * 131 + i * 17) * 16));
  }
  function changed(A, B) {
    const ca = codes(A), cb = codes(B);
    return ca.map((v, i) => v !== cb[i]);
  }
  // an 8-token column; `hot` marks tokens that changed at this step
  function tokenColumn(P, x, y0, size, pitch, S, hot, o = {}) {
    const T = P.T, cs = codes(S);
    for (let q = 0; q < 8; q++) {
      const y = y0 + q * pitch, on = hot && hot[q];
      P.rect(x, y, size, size, { fill: on ? T.acc : T.bg, w: 1.1, color: on ? T.acc : T.ink, alpha: o.alpha ?? 1, fillAlpha: o.alpha ?? 1, seed: 300 + q + Math.round(x) });
      if (!P.small && size >= 9) {
        const b = size / 2 - 1.2;
        for (let bit = 0; bit < 4; bit++) {
          if (!((cs[q] >> bit) & 1)) continue;
          const bx = x + 1.2 + (bit % 2) * b, by = y + 1.2 + Math.floor(bit / 2) * b;
          P.rect(bx + 0.4, by + 0.4, b - 0.8, b - 0.8, { fill: on ? T.bg : T.ink, fillAlpha: (o.alpha ?? 1) * (on ? 0.9 : 0.55), w: 0 });
        }
      }
    }
  }
  function actionGlyph(P, c, a, o = {}) {
    const T = P.T, r = o.r ?? 8, L = Math.hypot(a[0], a[1]);
    P.circle(c, r, { fill: T.bg, w: 1, color: o.active ? T.ink : T.faint, seed: 320 });
    if (L > 0.3) P.ray(c, [c[0] + a[0] / L * (r - 1.5), c[1] + a[1] / L * (r - 1.5)], { w: 1.4, head: 4, color: T.ink, alpha: o.alpha ?? 1, seed: 321 });
  }
  // pointer offset from a centre -> an action vector of length <= mag
  function actionFrom(ptr, c, mag) {
    const d = [ptr[0] - c[0], ptr[1] - c[1]], L = Math.hypot(d[0], d[1]);
    if (L < 1e-3) return [0, 0];
    const k = Math.min(1, L / 60) * mag / L;
    return [d[0] * k, d[1] * k];
  }

  // ---------------------------------------------------------------- C1
  // 196 patches -> 8 tokens. Each token is shown with the patches it
  // attends to; the pointer picks a token (on the stack) or a patch (in the
  // frame). With no pointer the tokens take turns.
  function tokensScene() {
    const FX = 34, FY = 40, FS = 150, G = 14, cell = FS / G;
    const RX0 = 222, RX1 = 240, TX = 304, TY0 = 48, TP = 18.5, TS = 12;
    const ty = (k) => TY0 + k * TP;
    const patches = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell;
      patches.push({ i, j, k: owner(cx, cy), c: [FX + cx, FY + cy] });
    }
    let active = 0, since = 0;
    return {
      idle: (t) => [TX + 6, ty(Math.floor(t / 1.6) % 8)],
      draw(P, st) {
        const T = P.T, t = st.t, p = st.ptr;
        P.marks();
        // pick the active token
        let k = active;
        if (p[0] > RX1 + 10) k = clamp(Math.round((p[1] - TY0) / TP), 0, 7);
        else if (p[0] > FX && p[0] < FX + FS && p[1] > FY && p[1] < FY + FS) k = owner(p[0] - FX, p[1] - FY);
        if (k !== active) { active = k; since = t; }
        const grow = ease((t - since) / 0.45);

        P.text('196 patches', FX, FY - 11, { detail: true });
        // highlighted patches under the scene
        for (const q of patches) {
          if (q.k !== active) continue;
          P.rect(FX + q.i * cell, FY + q.j * cell, cell, cell, { fill: T.acc, fillAlpha: 0.14 * grow + 0.02, w: 0 });
        }
        drawTabletop(P, FX, FY, 1);
        // patch grid over it
        for (let g = 0; g <= G; g++) {
          P.line([[FX + g * cell, FY], [FX + g * cell, FY + FS]], { w: 0.5, color: T.faint, amp: 0 });
          P.line([[FX, FY + g * cell], [FX + FS, FY + g * cell]], { w: 0.5, color: T.faint, amp: 0 });
        }
        P.rect(FX, FY, FS, FS, { w: 1.2, color: T.ink, seed: 120 });
        for (const q of patches) {
          if (q.k !== active) continue;
          P.rect(FX + q.i * cell, FY + q.j * cell, cell, cell, { w: 0.9, color: T.acc, amp: 0 });
        }

        // attention lines: patch -> resampler -> token
        const yT = ty(active) + TS / 2;
        let n = 0;
        for (const q of patches) {
          if (q.k !== active || (q.i + q.j) % 2) continue;
          n++;
          const a = q.c, b = [RX0, yT];
          P.line(cubic(a, [lerp(a[0], b[0], 0.55), a[1]], [lerp(a[0], b[0], 0.55), b[1]], b, 14),
            { w: 0.7, color: T.acc, alpha: 0.55, upto: grow, seed: 200 + q.i * 17 + q.j });
        }
        // resampler block
        P.rect(RX0, FY, RX1 - RX0, FS, { fill: T.bg, w: 1.2, color: T.ink, seed: 130 });
        for (let q = 1; q < 8; q++) P.line([[RX0 + 3, FY + q * FS / 8], [RX1 - 3, FY + q * FS / 8]], { w: 0.6, color: T.faint, amp: 0 });
        P.text('resampler', (RX0 + RX1) / 2, FY - 11, { align: 'center', detail: true });
        P.arrow([[RX1, yT], [TX - 3, yT]], { w: 1.4, color: T.acc, head: 5.5, upto: 1, seed: 131 });

        // eight tokens
        P.text('8 tokens', TX, FY - 11, { detail: true });
        for (let q = 0; q < 8; q++) {
          const on = q === active, y = ty(q);
          P.rect(TX, y, TS, TS, { fill: on ? T.acc : T.bg, w: 1.2, color: on ? T.acc : T.ink, seed: 140 + q });
          P.text(TOKENS[q], TX + TS + 8, y + TS / 2 + 0.5, { size: 7.5, color: on ? T.acc : T.mute, detail: true });
        }
        if (!P.small && !st.idle) P.crosshair(p, { color: T.mute });
      },
    };
  }

  // ---------------------------------------------------------------- C2
  // Squeeze: pointer x sweeps the token budget 784 -> 256 -> 64 -> 8. A
  // uniform grid over the scene gives way, at 8, to one token per thing.
  function squeezeScene() {
    const FX = 22, FY = 40, FS = 150;
    const STOPS = [784, 256, 64, 8];
    const BX = 206, BY = 58, BW = 172, BH = 82;
    const fine = 50, fc = FS / fine;
    const own = [];
    for (let j = 0; j < fine; j++) for (let i = 0; i < fine; i++) own.push(owner((i + 0.5) * fc, (j + 0.5) * fc));
    const O = (i, j) => own[j * fine + i];
    return {
      idle: (t) => [200 + 175 * Math.sin(t * 0.28), 120],
      draw(P, st) {
        const T = P.T, t = st.t;
        P.marks();
        const u = clamp((st.ptr[0] - 30) / (W - 60), 0, 1) * (STOPS.length - 1);
        const i0 = Math.min(STOPS.length - 2, Math.floor(u)), f = ease(clamp((u - i0 - 0.3) / 0.4, 0, 1));
        const layer = (idx, alpha) => {
          if (alpha <= 0.01) return;
          const N = STOPS[idx];
          if (N === 8) {
            // semantic partition: region boundaries on the fine grid + token markers
            for (let j = 0; j < fine; j++) for (let i = 0; i < fine; i++) {
              const k = O(i, j), x = FX + i * fc, y = FY + j * fc;
              if (i + 1 < fine && O(i + 1, j) !== k) P.line([[x + fc, y], [x + fc, y + fc]], { w: 1.2, color: T.acc, alpha, amp: 0, cap: 'square' });
              if (j + 1 < fine && O(i, j + 1) !== k) P.line([[x, y + fc], [x + fc, y + fc]], { w: 1.2, color: T.acc, alpha, amp: 0, cap: 'square' });
            }
            CENT.forEach(([cx, cy], k) => {
              const c = [FX + cx, FY + cy];
              P.rect(c[0] - 4.5, c[1] - 4.5, 9, 9, { fill: T.acc, fillAlpha: alpha, w: 0 });
              if (!P.small) P.text(String(k + 1), c[0], c[1] + 0.5, { size: 6.5, color: T.bg, alpha, align: 'center', keepCase: true });
            });
          } else {
            const g = Math.round(Math.sqrt(N)), c = FS / g;
            for (let q = 1; q < g; q++) {
              P.line([[FX + q * c, FY], [FX + q * c, FY + FS]], { w: 0.6, color: T.acc, alpha: alpha * 0.55, amp: 0 });
              P.line([[FX, FY + q * c], [FX + FS, FY + q * c]], { w: 0.6, color: T.acc, alpha: alpha * 0.55, amp: 0 });
            }
          }
        };
        drawTabletop(P, FX, FY, 1);
        layer(i0, 1 - f);
        layer(i0 + 1, f);
        P.rect(FX, FY, FS, FS, { w: 1.2, color: T.ink, seed: 150 });
        P.text('observation', FX, FY - 11, { detail: true });

        // token sequence block: N cells packed into the box
        const N = Math.round(Math.exp(lerp(Math.log(STOPS[i0]), Math.log(STOPS[i0 + 1]), f)));
        P.text('token sequence', BX, BY - 11, { detail: true });
        const cols = Math.max(8, Math.ceil(Math.sqrt(N * BW / BH)));
        const cs = Math.min(BW / cols, 20), gap = cs > 8 ? 2.5 : cs > 4 ? 1 : 0.4;
        const rows = Math.ceil(N / cols);
        const oy = BY + (BH - rows * cs) / 2;
        for (let q = 0; q < N; q++) {
          const x = BX + (q % cols) * cs, y = oy + Math.floor(q / cols) * cs;
          if (cs > 8) P.rect(x + gap / 2, y + gap / 2, cs - gap, cs - gap, { fill: T.acc, w: 1, color: T.acc, seed: 160 + q });
          else P.rect(x + gap / 2, y + gap / 2, cs - gap, cs - gap, { fill: T.acc, fillAlpha: 0.85, w: 0 });
        }

        // readouts
        const pairs = N * N;
        P.text(`${N} tokens`, BX, BY + BH + 16, { size: 11, color: T.ink, bold: true, keepCase: true });
        P.text('attention pairs', BX, BY + BH + 34, { size: 7, detail: true });
        const bw = BW * Math.log(pairs) / Math.log(784 * 784);
        P.rect(BX, BY + BH + 41, BW, 6, { w: 0.8, color: T.faint, amp: 0 });
        P.rect(BX, BY + BH + 41, bw, 6, { fill: T.ink, w: 0 });
        P.text(pairs.toLocaleString('en-US'), BX + BW, BY + BH + 34, { size: 7, align: 'right', keepCase: true, detail: true, color: T.ink });

        // stop ticks along the bottom (the pointer's track)
        const sx = (idx) => 30 + (W - 60) * idx / (STOPS.length - 1);
        P.line([[30, 212], [W - 30, 212]], { w: 0.8, color: T.faint, amp: 0 });
        STOPS.forEach((n, idx) => {
          P.line([[sx(idx), 208], [sx(idx), 216]], { w: 1, color: T.mute, amp: 0 });
          P.text(String(n), sx(idx), 203, { size: 7, align: 'center', keepCase: true, detail: true });
        });
        const px = 30 + (W - 60) * u / (STOPS.length - 1);
        P.rect(px - 3, 209, 6, 6, { fill: T.acc, w: 0 });
      },
    };
  }

  // ---------------------------------------------------------------- C3
  // Race: two planners chase the same goal. The 784-token one needs 178.8 s
  // per plan, the 8-token one 4.8 s (RECON, the paper's Table), so the top
  // lane is still thinking while the bottom lane keeps arriving.
  function raceScene() {
    const LANES = [
      { y0: 16, n: 784, secs: '178.8 s', label: '784 tokens' },
      { y0: 122, n: 8, secs: '4.8 s', label: '8 tokens' },
    ];
    const LH = 88, SX = 128, MAPX1 = 388;
    const FAST = 1.7, RATIO = 178.78 / 4.83;
    const lanes = LANES.map((L, li) => ({ ...L, li, plan: null, done: 0 }));
    function newPlan(L, t, g) {
      const S = [SX, L.y0 + LH / 2];
      return { t0: t, S, G: g.slice(), seed: Math.floor(t * 1000) + L.li * 7 };
    }
    function sample(pl, it, k) {
      const { S, G } = pl, L = Math.hypot(G[0] - S[0], G[1] - S[1]) || 1;
      const spread = [0.5, 0.32, 0.17, 0.06][it] ?? 0;
      const b = (hash(pl.seed * 31 + it * 7 + k) - 0.5) * spread * L;
      const m = [(S[0] + G[0]) / 2 - (G[1] - S[1]) / L * b, (S[1] + G[1]) / 2 + (G[0] - S[0]) / L * b];
      const e = [G[0] + (hash(pl.seed * 13 + it * 5 + k) - 0.5) * spread * 60, G[1] + (hash(pl.seed * 17 + it * 3 + k) - 0.5) * spread * 40];
      return cubic(S, m, m, e, 16);
    }
    return {
      idle: (t) => [300 + 60 * Math.cos(t * 0.35), 50 + 25 * Math.sin(t * 0.5)],
      draw(P, st) {
        const T = P.T, t = st.t;
        for (const L of lanes) {
          const top = L.y0, mid = top + LH / 2;
          const g = [clamp(st.ptr[0], 250, MAPX1 - 10), clamp(((st.ptr[1] - 16) % 106 + 106) % 106 + top, top + 12, top + LH - 12)];
          const dur = L.n === 8 ? FAST : FAST * RATIO;
          if (!L.plan || t - L.plan.t0 > dur) { if (L.plan) L.done++; L.plan = newPlan(L, t, g); }
          const ph = (t - L.plan.t0) / dur;
          // lane frame
          P.rect(8, top, W - 16, LH, { w: 0.9, color: T.faint, amp: 0 });
          // token block
          const bx = 20, by = mid - 26, bs = 52;
          if (L.n === 8) {
            for (let q = 0; q < 8; q++) P.rect(bx + (q % 4) * 13.5, by + 12 + Math.floor(q / 4) * 15, 10.5, 10.5, { fill: T.acc, w: 1, color: T.acc, seed: 170 + q });
          } else {
            const g2 = 28, c = bs / g2;
            for (let j = 0; j < g2; j++) for (let i = 0; i < g2; i++) P.rect(bx + i * c + 0.2, by + j * c + 0.2, c - 0.4, c - 0.4, { fill: T.ink, fillAlpha: 0.55, w: 0 });
          }
          P.text(L.label, bx, top + LH - 8, { size: 7, detail: true });
          // planning map (clipped to the lane)
          const ctx = st.ctx;
          ctx.save();
          ctx.beginPath();
          ctx.rect(SX - 10, top + 1, W - 8 - (SX - 10) - 1, LH - 2);
          ctx.clip();
          const pl = L.plan, planEnd = 0.72;
          const pPlan = clamp(ph / planEnd, 0, 1), it = Math.min(3, Math.floor(pPlan * 4)), itp = pPlan * 4 - it;
          P.target(pl.G, 5, {});
          for (let k = 0; k < 6; k++) {
            if (it > 0) P.line(sample(pl, it - 1, k), { w: 0.7, color: T.mute, alpha: 0.35, seed: 180 + k });
            const up = ph < planEnd ? ease(itp * 1.3) : 1, path = sample(pl, it, k);
            P.line(path, { w: 0.9, color: T.mute, alpha: 0.8, upto: up, seed: 190 + k });
            // each imagined state along a rollout is a token block
            if (ph < planEnd && !P.small) for (const wi of [5, 10, 15]) {
              if (wi / 16 > up) break;
              const [x, y] = path[wi];
              if (L.n === 8) {
                for (let q = 0; q < 8; q++) P.rect(x - 4.6 + (q % 4) * 2.4, y - 2.4 + Math.floor(q / 4) * 2.4, 1.9, 1.9, { fill: T.acc, w: 0 });
              } else {
                P.rect(x - 4, y - 4, 8, 8, { fill: T.ink, fillAlpha: 0.12, w: 0 });
                for (let q = 0; q < 7; q++) {
                  P.line([[x - 4 + q * 8 / 6, y - 4], [x - 4 + q * 8 / 6, y + 4]], { w: 0.4, color: T.ink, alpha: 0.6, amp: 0 });
                  P.line([[x - 4, y - 4 + q * 8 / 6], [x + 4, y - 4 + q * 8 / 6]], { w: 0.4, color: T.ink, alpha: 0.6, amp: 0 });
                }
              }
            }
          }
          const best = cubic(pl.S, pl.S, pl.G, pl.G, 16);
          let agent = pl.S;
          if (ph >= planEnd) {
            const e = ease((ph - planEnd) / (0.92 - planEnd));
            P.line(best, { w: 2, color: T.acc, upto: e, seed: 195 });
            agent = [lerp(pl.S[0], pl.G[0], e), lerp(pl.S[1], pl.G[1], e)];
          }
          P.rect(agent[0] - 4.5, agent[1] - 4.5, 9, 9, { fill: T.ink, w: 0 });
          ctx.restore();
          // readouts
          const status = ph < planEnd ? `world-model rollouts ${'.'.repeat(1 + Math.floor(t * 3) % 3)}` : 'executing';
          P.text(status, SX - 6, top + 12, { size: 7, color: ph < planEnd ? T.mute : T.acc, detail: true });
          P.text(`${L.secs} / plan`, W - 16, top + 12, { size: 7, align: 'right', color: T.ink, keepCase: true, detail: true });
          P.text(`plans ${String(L.done).padStart(3, '0')}`, W - 16, top + LH - 8, { size: 7, align: 'right', keepCase: true, detail: true });
          // progress bar of the current plan
          P.rect(SX - 6, top + LH - 10, 100, 3, { w: 0, fill: T.faint });
          P.rect(SX - 6, top + LH - 10, 100 * clamp(ph, 0, 1), 3, { w: 0, fill: L.n === 8 ? T.acc : T.ink });
        }
        if (!P.small) P.text('~40× faster planning', W / 2, 114.5, { align: 'center', size: 7, color: T.acc });
      },
    };
  }

  // ---------------------------------------------------------------- C4
  // Rollout: observation -> 8 tokens -> world model, step by step, entirely
  // in token space -> decode only at the end. The pointer is the action;
  // only the tokens of the things it moves change value.
  function rolloutScene() {
    const DY = 12, OX = 10, OY = 68 + DY, OS = 80, sc = OS / 150;
    const CX0 = 114, CDX = 56, TS = 9, TP = 11, TY = 66 + DY, H4 = 3;
    const PX = 310, PY = OY;
    return {
      idle: (t) => [200 + 90 * Math.cos(t * 0.45), 112 + 70 * Math.sin(t * 0.9)],
      draw(P, st) {
        const T = P.T, t = st.t;
        P.marks();
        const a = actionFrom(st.ptr, [200, 112], 9);
        const states = [HOME];
        for (let k = 0; k < H4; k++) states.push(stepState(states[k], a));
        const step = Math.floor(t / 0.6) % (H4 + 3);      // 0..H4 then a short hold
        const shown = Math.min(step, H4);

        // observation
        P.text('observation', OX, 26 + DY, { detail: true });
        P.rect(OX, OY, OS, OS, { fill: T.bg, w: 0, });
        drawTabletop(P, OX, OY, sc, { w: 1 });
        P.rect(OX, OY, OS, OS, { w: 1.2, color: T.ink, seed: 400 });
        P.arrow([[OX + OS + 3, OY + OS / 2], [CX0 - 4, OY + OS / 2]], { w: 1.2, head: 5, seed: 401 });

        // token columns + world-model steps
        P.text('world model, in token space', CX0, 26 + DY, { detail: true });
        for (let k = 0; k <= H4; k++) {
          const x = CX0 + k * CDX, vis = k <= shown ? 1 : 0.22;
          const hot = k > 0 && k <= shown ? changed(states[k - 1], states[k]) : null;
          tokenColumn(P, x, TY, TS, TP, states[k], hot, { alpha: vis });
          P.text(k ? `z${k}` : 'z0', x + TS / 2, TY + 8 * TP + 8, { size: 7, align: 'center', keepCase: true, detail: true, alpha: vis });
          if (k === H4) break;
          const cx = x + TS + (CDX - TS) / 2, active = step === k + 1;
          P.rect(cx - 12, OY + OS / 2 - 7, 24, 14, { fill: active ? T.acc : T.bg, w: 1.2, color: active ? T.acc : T.ink, seed: 410 + k });
          if (!P.small) P.text('wm', cx, OY + OS / 2 + 0.5, { size: 7, align: 'center', color: active ? T.bg : T.ink });
          P.line([[x + TS + 2, OY + OS / 2], [cx - 13, OY + OS / 2]], { w: 1, seed: 420 + k });
          P.arrow([[cx + 12, OY + OS / 2], [x + CDX - 3, OY + OS / 2]], { w: 1, head: 4.5, seed: 430 + k });
          // action input from above
          actionGlyph(P, [cx, 44 + DY], a, { active });
          P.arrow([[cx, 53 + DY], [cx, OY + OS / 2 - 9]], { w: 0.9, head: 4, color: T.mute, seed: 440 + k });
        }
        if (!P.small) P.text('a', CX0 + TS + (CDX - TS) / 2 - 16, 44 + DY, { size: 9, color: T.ink, bold: true, keepCase: true, align: 'right' });
        // bracket under the rollout
        const bx0 = CX0, bx1 = CX0 + H4 * CDX + TS, by = TY + 8 * TP + 18;
        P.line([[bx0, by - 4], [bx0, by], [bx1, by], [bx1, by - 4]], { w: 0.9, color: T.mute, amp: 0 });
        P.text('8 tokens per frame', (bx0 + bx1) / 2, by + 10, { size: 7, align: 'center', detail: true });

        // decode the last predicted state
        const xe = CX0 + H4 * CDX + TS;
        P.arrow([[xe + 3, OY + OS / 2], [PX - 4, OY + OS / 2]], { w: 1.2, head: 5, seed: 402, dash: [3, 2.5] });
        P.text('decoded', PX, 26 + DY, { detail: true });
        P.rect(PX, PY, OS, OS, { fill: T.accSoft, w: 0 });
        drawTabletop(P, PX, PY, sc, { w: 1, dash: [2.5, 2.5], color: T.mute, state: HOME, only: true });
        drawTabletop(P, PX, PY, sc, { w: 1, state: states[shown] });
        P.rect(PX, PY, OS, OS, { w: 1.2, color: T.acc, seed: 403 });
        P.text(`t + ${shown}`, PX + OS, OY + OS + 9, { size: 7, align: 'right', keepCase: true, detail: true });
      },
    };
  }

  // ---------------------------------------------------------------- C5
  // What the action touches: a live scene. The pointer is where the gripper
  // heads; each world-model tick maps z_t (+ action) to z_t+1, and only the
  // arm / gripper / cube tokens change. Their patches light up in the frame.
  function touchScene() {
    const FX = 22, FY = 40, FS = 150, G = 14, cell = FS / G;
    const C0 = 262, C1 = 350, TS = 11, TP = 17, TY = 50;
    let S = { wrist: HOME.wrist.slice(), cube: HOME.cube.slice() }, prev = S, next = S, a = [0, 0], tick = -1, pulse = 0;
    const TICK = 0.7;
    return {
      idle: (t) => [FX + 75 + 55 * Math.cos(t * 0.5), FY + 60 + 25 * Math.sin(t * 1.0)],
      draw(P, st) {
        const T = P.T, t = st.t;
        P.marks();
        const k = Math.floor(t / TICK);
        if (k !== tick) {
          tick = k;
          prev = S; S = next;
          const tgt = [clamp((st.ptr[0] - FX) / FS * 150, 0, 150), clamp((st.ptr[1] - FY) / FS * 150, 0, 150)];
          a = actionFrom(tgt, S.wrist, 10);
          next = stepState(S, a);
          if (S.cube[0] > 133 || S.cube[0] < 16) next = { wrist: next.wrist, cube: HOME.cube.slice() };
          pulse = t;
        }
        const hot = changed(S, next);
        const glow = 1 - ease((t - pulse) / TICK);

        // frame: highlight patches of the tokens that change
        for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
          const o = ownerS((i + 0.5) * cell, (j + 0.5) * cell, S);
          if (hot[o]) P.rect(FX + i * cell, FY + j * cell, cell, cell, { fill: T.acc, fillAlpha: 0.08 + 0.12 * glow, w: 0 });
        }
        drawTabletop(P, FX, FY, 1, { state: S });
        drawTabletop(P, FX, FY, 1, { state: next, only: true, dash: [3, 3], color: T.acc, w: 1 });
        for (let g = 0; g <= G; g++) {
          P.line([[FX + g * cell, FY], [FX + g * cell, FY + FS]], { w: 0.5, color: T.faint, amp: 0 });
          P.line([[FX, FY + g * cell], [FX + FS, FY + g * cell]], { w: 0.5, color: T.faint, amp: 0 });
        }
        P.rect(FX, FY, FS, FS, { w: 1.2, color: T.ink, seed: 500 });
        P.text('observation', FX, FY - 11, { detail: true });
        if (!P.small && !st.idle) P.crosshair(st.ptr, { color: T.mute });

        // z_t -> world model -> z_t+1
        P.text('z_t', C0 + TS / 2, FY - 11, { align: 'center', keepCase: true, detail: true });
        P.text('z_t+1', C1 + TS / 2, FY - 11, { align: 'center', keepCase: true, detail: true });
        tokenColumn(P, C0, TY, TS, TP, S, null);
        tokenColumn(P, C1, TY, TS, TP, next, hot);
        for (let q = 0; q < 8; q++) {
          P.text(TOKENS[q], C0 - 6, TY + q * TP + TS / 2 + 0.5, { size: 7, align: 'right', color: hot[q] ? T.acc : T.mute, detail: true });
          if (hot[q]) P.line([[C0 + TS + 3, TY + q * TP + TS / 2], [C1 - 3, TY + q * TP + TS / 2]], { w: 0.6, color: T.acc, alpha: 0.35, dash: [2, 3], amp: 0 });
        }
        const wx = (C0 + TS + C1) / 2, wy = TY + 3.5 * TP + TS / 2;
        P.rect(wx - 16, wy - 22, 32, 44, { fill: T.bg, w: 1.3, color: T.ink, seed: 510 });
        P.text('world', wx, wy - 5, { size: 6.5, align: 'center', color: T.ink, detail: true });
        P.text('model', wx, wy + 5, { size: 6.5, align: 'center', color: T.ink, detail: true });
        P.arrow([[C0 + TS + 3, wy], [wx - 19, wy]], { w: 1, head: 4.5, seed: 512 });
        P.arrow([[wx + 16, wy], [C1 - 3, wy]], { w: 1, head: 4.5, seed: 513 });
        actionGlyph(P, [wx, FY - 8], a, { active: true, r: 8 });
        P.arrow([[wx, FY + 1], [wx, wy - 24]], { w: 0.9, head: 4, color: T.mute, seed: 511 });
        P.text('a_t', wx + 12, FY - 8, { size: 7, keepCase: true, detail: true, align: 'left', color: T.ink });
        const n = hot.filter(Boolean).length;
        P.text(`${n} of 8 tokens change`, (C0 + C1 + TS) / 2, 208, { size: 7.5, align: 'center', color: T.acc, detail: true });
      },
    };
  }

  const SCENES = { cycle: cycleScene, lens: lensScene, tokens: tokensScene, squeeze: squeezeScene, race: raceScene, rollout: rolloutScene, touch: touchScene };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------------------------------------------------------------- mount
  function mount(canvas) {
    const make = SCENES[canvas.dataset.figScene || canvas.dataset.acidScene];
    if (!make) return null;
    const scene = make();
    const ctx = canvas.getContext('2d');
    const st = { t: 0, ptr: [W * 0.75, H * 0.3], target: [W * 0.75, H * 0.3], hover: false, lastMove: -1e9, ctx };
    let view = { k: 1, ox: 0, oy: 0, cw: 0, ch: 0 }, visible = true, last = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth, ch = canvas.clientHeight || cw * H / W;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      const k = Math.min(cw / W, ch / H);
      view = { k, ox: (cw - W * k) / 2, oy: (ch - H * k) / 2, cw, ch, dpr };
    }
    const toLocal = (e) => {
      const b = canvas.getBoundingClientRect();
      const sx = b.width / (view.cw || b.width);
      return [((e.clientX - b.left) / sx - view.ox) / view.k, ((e.clientY - b.top) / sx - view.oy) / view.k];
    };
    canvas.addEventListener('pointermove', (e) => { st.target = toLocal(e); st.hover = true; st.lastMove = performance.now(); });
    canvas.addEventListener('pointerleave', () => { st.hover = false; });
    canvas.addEventListener('pointerdown', (e) => { st.target = toLocal(e); st.hover = true; st.lastMove = performance.now(); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    if (window.IntersectionObserver) new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; }).observe(canvas);
    resize();

    function frame(now) {
      if (!canvas.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && view.cw > 0) {
        st.idle = !st.hover || now - st.lastMove > 3000;
        // with reduced motion the figure holds still until the pointer moves it
        if (!(reduceMotion.matches && st.idle)) st.t += dt;
        if (st.idle) st.target = scene.idle(st.t);
        const kk = 1 - Math.exp(-dt * (st.idle ? 3.5 : 14));
        st.ptr = [lerp(st.ptr[0], st.target[0], kk), lerp(st.ptr[1], st.target[1], kk)];
        const ds = canvas.dataset;
        const theme = THEMES[ds.figColorway || ds.acidColorway] || BASE;
        const boilAttr = ds.figBoil ?? ds.acidBoil;
        const boil = (boilAttr === 'true' || boilAttr === '') && !reduceMotion.matches;
        const small = view.cw < 300;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(view.k * view.dpr, 0, 0, view.k * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
        const pen = makePen(ctx, { theme, style: ds.figStyle || ds.acidStyle || 'drafting', boil, k: view.k, small, phase: Math.floor(now / 130) % 3 });
        scene.draw(pen, st);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return scene;
  }

  function scan() {
    document.querySelectorAll('canvas[data-fig-scene], canvas[data-acid-scene]').forEach((c) => { if (!c.__acid) c.__acid = mount(c) || true; });
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 10px "iA Writer Mono"').catch(() => {});
    document.fonts.load('700 10px "iA Writer Mono"').catch(() => {});
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
