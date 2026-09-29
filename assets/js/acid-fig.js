// acid-fig.js: interactive preview figures for ACID (concepts A "cycle" and B "lens").
// Mounts itself on every <canvas data-acid-scene="cycle|lens">. Other data attributes,
// re-read every frame so they can change live:
//   data-acid-style    = drafting | sketch
//   data-acid-colorway = ultramarine | signal | inverse
//   data-acid-boil     = true | false
(function () {
  if (window.__acidFig) return;
  window.__acidFig = true;

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
      if (o.detail && cfg.small) return;
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

  const SCENES = { cycle: cycleScene, lens: lensScene };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------------------------------------------------------------- mount
  function mount(canvas) {
    const make = SCENES[canvas.dataset.acidScene];
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
        const theme = THEMES[ds.acidColorway] || BASE;
        const boil = (ds.acidBoil === 'true' || ds.acidBoil === '') && !reduceMotion.matches;
        const small = view.cw < 300;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(view.k * view.dpr, 0, 0, view.k * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
        const pen = makePen(ctx, { theme, style: ds.acidStyle || 'drafting', boil, k: view.k, small, phase: Math.floor(now / 130) % 3 });
        scene.draw(pen, st);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return scene;
  }

  function scan() {
    document.querySelectorAll('canvas[data-acid-scene]').forEach((c) => { if (!c.__acid) c.__acid = mount(c) || true; });
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 10px "iA Writer Mono"').catch(() => {});
    document.fonts.load('700 10px "iA Writer Mono"').catch(() => {});
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
