'use strict';

/* =========================================
   EASTER EGGS
   1. Foguete ...... clique no foguete de "O que estou fazendo" (aba Sobre mim)
   2. Estrelas ..... 4 estrelas escondidas, uma em cada aba; com as 4, o céu acende
   3. Asteroide .... de tempos em tempos um pontinho cruza o céu; clique nele
   4. Terminal ..... código Konami (↑ ↑ ↓ ↓ ← → ← → B A) ou 7 toques no avatar
   O progresso de cada visitante fica no localStorage (chave "mh-easter-eggs").
   ========================================= */
(function () {

  const TAU = Math.PI * 2;
  const clamp = function (value, min, max) { return Math.min(Math.max(value, min), max); };
  const rand = function (min, max) { return min + Math.random() * (max - min); };
  const own = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };
  const formatNumber = function (n) { return n.toLocaleString("pt-BR"); };
  const normalize = function (text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  };
  const escapeHTML = function (text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const prefersReducedMotion = function () {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  // =========================================
  // PROGRESSO (por visitante, no navegador)
  // =========================================
  const STORE_KEY = "mh-easter-eggs";
  const STAR_IDS = ["sobre", "curriculo", "projetos", "contato"];

  const state = (function () {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { saved = {}; }
    const stars = Array.isArray(saved.stars) ? saved.stars : [];
    return {
      rocket: saved.rocket === true,
      terminal: saved.terminal === true,
      asteroids: Number.isFinite(saved.asteroids) ? saved.asteroids : 0,
      stars: stars.filter(function (id, i) { return STAR_IDS.includes(id) && stars.indexOf(id) === i; }),
      starsCompletedAt: Number.isFinite(saved.starsCompletedAt) ? saved.starsCompletedAt : null, // quando o céu acendeu
      skyLit: Number.isFinite(saved.skyLit) ? saved.skyLit : 0 // quantas vezes o céu já foi aceso
    };
  })();

  const saveState = function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* janela anônima, armazenamento bloqueado etc. */ }
  };

  // =========================================
  // AVISOS (toasts)
  // =========================================
  // Tempo que cada aviso fica na tela (dá para ler com calma; o × fecha antes).
  // Passar o mouse ou focar o aviso pausa a contagem.
  const TOAST_READ_MS = 30000;
  let toastBox = null;

  const toast = function (html, options) {
    const opts = options || {};
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "egg-toasts";
      toastBox.setAttribute("aria-live", "polite");
      document.body.appendChild(toastBox);
    }

    // avisos do mesmo grupo (ex.: estrelas) substituem o anterior em vez de empilhar
    if (opts.group) {
      toastBox.querySelectorAll('[data-group="' + opts.group + '"]').forEach(function (old) { old.remove(); });
    }

    const el = document.createElement("div");
    el.className = "egg-toast";
    el.innerHTML =
      '<div class="egg-toast-body"></div>' +
      '<button class="egg-toast-close" type="button" aria-label="Fechar aviso">×</button>' +
      '<i class="egg-toast-timer" aria-hidden="true"></i>';
    const body = el.querySelector(".egg-toast-body");
    const bar = el.querySelector(".egg-toast-timer");
    body.innerHTML = html;
    if (opts.group) el.setAttribute("data-group", opts.group);
    if (opts.live === false) el.setAttribute("aria-live", "off"); // telemetria muda rápido demais para leitor de tela
    if (opts.duration === 0) el.setAttribute("data-sticky", "");
    toastBox.appendChild(el);

    // no máximo 3 avisos; os fixos (telemetria do foguete) saem por último
    const extra = toastBox.children.length - 3;
    if (extra > 0) {
      Array.from(toastBox.children)
        .filter(function (child) { return !child.hasAttribute("data-sticky"); })
        .slice(0, extra)
        .forEach(function (child) { child.remove(); });
    }

    let timer = 0;
    let remaining = 0;   // ms que faltam (0 = aviso fixo, sem contagem)
    let startedAt = 0;
    let paused = false;

    const api = {
      el: el,
      update: function (nextHTML) { body.innerHTML = nextHTML; },
      hold: function (ms) {
        clearTimeout(timer);
        remaining = ms;
        startedAt = Date.now();
        el.style.setProperty("--toast-ms", ms + "ms");
        bar.style.animation = "none";   // reinicia a barrinha de tempo
        void bar.offsetWidth;
        bar.style.animation = "";
        if (!paused) timer = setTimeout(api.close, ms);
      },
      close: function () {
        clearTimeout(timer);
        if (!el.isConnected || el.classList.contains("is-leaving")) return;
        el.classList.add("is-leaving");
        setTimeout(function () { el.remove(); }, 300);
      }
    };

    const pause = function () {
      if (paused) return;
      paused = true;
      el.classList.add("is-paused");
      if (!remaining) return;
      clearTimeout(timer);
      remaining = Math.max(remaining - (Date.now() - startedAt), 0);
    };
    const resume = function () {
      if (!paused) return;
      paused = false;
      el.classList.remove("is-paused");
      if (!remaining) return;
      startedAt = Date.now();
      timer = setTimeout(api.close, Math.max(remaining, 1500));
    };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    el.querySelector(".egg-toast-close").addEventListener("click", api.close);

    if (opts.duration === 0) {
      el.classList.add("is-sticky");
    } else {
      api.hold(opts.duration || TOAST_READ_MS);
    }
    return api;
  };

  // =========================================
  // CAMADA DE EFEITOS (canvas por cima de tudo, sem capturar cliques)
  // =========================================
  const fx = (function () {
    let canvas = null;
    let ctx = null;
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let items = [];

    const resize = function () {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ensure = function () {
      if (canvas) return;
      canvas = document.createElement("canvas");
      canvas.className = "egg-fx";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    };

    const tick = function (now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      items = items.filter(function (item) { return item.update(dt) !== false; });
      items.forEach(function (item) { item.draw(ctx); });
      raf = items.length ? requestAnimationFrame(tick) : 0;
    };

    return {
      size: function () { ensure(); return { w: width, h: height }; },
      add: function (item) {
        ensure();
        items.push(item);
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      }
    };
  })();

  const drawSparkle = function (ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  };

  const sparkleBurst = function (x, y, power) {
    if (prefersReducedMotion()) return;
    const boost = power || 1;
    const count = Math.round(16 * boost);
    const colors = ["#f5c46b", "#e889bd", "#fff3d6", "#a97ee0"];
    const parts = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + rand(-0.2, 0.2);
      const speed = rand(70, 190) * Math.sqrt(boost);
      parts.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0, max: rand(0.6, 1.1) * Math.sqrt(boost), size: rand(4, 8) * (boost > 1 ? 1.3 : 1), color: colors[i % colors.length]
      });
    }
    fx.add({
      update: function (dt) {
        const damp = Math.pow(0.06, dt);
        let alive = false;
        parts.forEach(function (p) {
          p.life += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= damp;
          p.vy = p.vy * damp + 60 * dt;
          if (p.life < p.max) alive = true;
        });
        return alive;
      },
      draw: function (ctx) {
        parts.forEach(function (p) {
          const k = 1 - p.life / p.max;
          if (k > 0) drawSparkle(ctx, p.x, p.y, p.size * (0.5 + k * 0.5), p.color, k);
        });
      }
    });
  };

  // Planeta com luz vinda do canto superior esquerdo, faixas e (opcional) anel.
  const PLANET_COLORS = {
    lilac: { light: "#f6e6ff", mid: "#b58ae6", dark: "#2a1846", band: "#f4c6df", glow: "169, 126, 224" },
    rose: { light: "#ffe3f1", mid: "#e889bd", dark: "#3d1434", band: "#ffffff", glow: "232, 137, 189" },
    moon: { light: "#fff8e8", mid: "#f5c46b", dark: "#5a3d12", band: "#ffffff", glow: "245, 196, 107" }
  };

  const drawRing = function (ctx, x, y, r, tilt, half) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const from = half === "back" ? Math.PI : 0;
    const to = half === "back" ? TAU : Math.PI;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(244, 198, 223, 0.8)";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.78, r * 0.44, 0, from, to);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.45, r * 0.35, 0, from, to);
    ctx.stroke();
    ctx.restore();
  };

  const drawPlanet = function (ctx, x, y, r, colors, ringTilt) {
    const hasRing = typeof ringTilt === "number";
    if (hasRing) drawRing(ctx, x, y, r, ringTilt, "back");

    const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2);
    glow.addColorStop(0, "rgba(" + colors.glow + ", 0.4)");
    glow.addColorStop(1, "rgba(" + colors.glow + ", 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, TAU);
    ctx.fill();

    const sphere = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    sphere.addColorStop(0, colors.light);
    sphere.addColorStop(0.45, colors.mid);
    sphere.addColorStop(1, colors.dark);
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = colors.band;
    [-0.45, -0.08, 0.32].forEach(function (offset, i) {
      ctx.beginPath();
      ctx.ellipse(x, y + offset * r, r * 1.15, r * (0.07 + i * 0.03), -0.18, 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    if (hasRing) drawRing(ctx, x, y, r, ringTilt, "front");
  };

  // Comemoração das 4 estrelas: clarão, tempestade de estrelas cadentes,
  // estrelas pipocando e dois planetas cruzando a tela.
  const celebrateSky = function (originX, originY) {
    if (prefersReducedMotion()) return;
    const view = fx.size();
    const W = view.w;
    const H = view.h;
    const ox = typeof originX === "number" ? originX : W / 2;
    const oy = typeof originY === "number" ? originY : H / 2;
    const DURATION = 8;
    const dirX = -0.82;
    const dirY = 0.57;
    const tints = ["255, 243, 214", "255, 255, 255", "244, 169, 208", "199, 166, 242", "245, 196, 107"];
    let t = 0;

    sparkleBurst(ox, oy, 3);

    const meteors = [];
    for (let i = 0; i < 56; i++) {
      meteors.push({
        start: 0.15 + rand(0, 5.2) * (i < 10 ? 0.25 : 1), // as primeiras caem logo de cara
        x: rand(W * 0.05, W * 1.3), y: rand(-H * 0.3, H * 0.5),
        speed: rand(700, 1300), len: rand(120, 280), width: rand(1.6, 3.6),
        max: rand(0.8, 1.4), tint: tints[i % tints.length]
      });
    }

    const pops = [];
    for (let i = 0; i < 90; i++) {
      pops.push({
        x: rand(0, W), y: rand(0, H), start: rand(0.3, 5.5), max: rand(1.1, 2.2), // termina antes de DURATION
        size: rand(3, 10), color: ["#fff3d6", "#f5c46b", "#f4c6df", "#d9c8f5", "#ffffff"][i % 5]
      });
    }

    const ringR = clamp(W * 0.06, 34, 72);
    const roseR = clamp(W * 0.045, 26, 54);

    fx.add({
      update: function (dt) {
        t += dt;
        meteors.forEach(function (m) {
          const active = t - m.start;
          if (active > 0 && active < m.max) {
            m.x += dirX * m.speed * dt;
            m.y += dirY * m.speed * dt;
          }
        });
        return t < DURATION;
      },
      draw: function (ctx) {
        // clarão dourado saindo da última estrela
        const flash = t / 1.6;
        if (flash < 1) {
          const radius = Math.max(W, H) * (0.25 + flash * 1.1);
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
          g.addColorStop(0, "rgba(255, 226, 170, " + (0.42 * (1 - flash)).toFixed(3) + ")");
          g.addColorStop(0.5, "rgba(232, 137, 189, " + (0.16 * (1 - flash)).toFixed(3) + ")");
          g.addColorStop(1, "rgba(232, 137, 189, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }

        // planetas de passagem
        const pRing = clamp((t - 0.5) / 6.8, 0, 1);
        if (pRing > 0 && pRing < 1) {
          const x = W + ringR * 3 - (W + ringR * 6) * pRing;
          const y = H * 0.2 + Math.sin(pRing * Math.PI) * H * 0.08;
          drawPlanet(ctx, x, y, ringR, PLANET_COLORS.lilac, -0.32);
        }
        const pRose = clamp((t - 1.1) / 6.4, 0, 1);
        if (pRose > 0 && pRose < 1) {
          const x = -roseR * 3 + (W * 0.75 + roseR * 3) * pRose;
          const y = H + roseR * 3 - (H + roseR * 6) * pRose;
          const angle = t * 2.4;
          const mx = x + Math.cos(angle) * roseR * 1.9;
          const my = y + Math.sin(angle) * roseR * 0.6;
          const moonBehind = Math.sin(angle) < 0;
          if (moonBehind) drawPlanet(ctx, mx, my, roseR * 0.26, PLANET_COLORS.moon);
          drawPlanet(ctx, x, y, roseR, PLANET_COLORS.rose);
          if (!moonBehind) drawPlanet(ctx, mx, my, roseR * 0.26, PLANET_COLORS.moon);
        }

        // estrelas pipocando
        pops.forEach(function (p) {
          const k = (t - p.start) / p.max;
          if (k <= 0 || k >= 1) return;
          drawSparkle(ctx, p.x, p.y, p.size * Math.sin(k * Math.PI), p.color, Math.sin(k * Math.PI));
        });

        // estrelas cadentes
        ctx.lineCap = "round";
        meteors.forEach(function (m) {
          const active = t - m.start;
          if (active <= 0 || active >= m.max) return;
          const k = active / m.max;
          const alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          const tailX = m.x - dirX * m.len;
          const tailY = m.y - dirY * m.len;
          const g = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
          g.addColorStop(0, "rgba(" + m.tint + ", " + alpha.toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + m.tint + ", 0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = m.width;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
          const head = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.width * 4);
          head.addColorStop(0, "rgba(255, 255, 255, " + alpha.toFixed(3) + ")");
          head.addColorStop(1, "rgba(" + m.tint + ", 0)");
          ctx.fillStyle = head;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.width * 4, 0, TAU);
          ctx.fill();
        });
      }
    });
  };

  // =========================================
  // 1. FOGUETE · Rocket Design UFABC (IREC 2025, 10k SRAD Solid)
  // Sobe até 10.000 ft e volta de paraquedas. A Maria Heloísa estava
  // na frente de extensão da equipe (workshops em escolas).
  // =========================================
  const rocketBtn = document.querySelector("[data-egg-rocket]");
  let rocketBusy = false;

  const ROCKET_DONE_HTML = "✅ <b>Recuperação nominal!</b> O foguete voltou ao solo em segurança. Na Rocket Design UFABC, eu cuidava da extensão: levar ciência e engenharia aeroespacial até as escolas. 🏆 1º lugar no IREC 2025 · 10k SRAD Solid.";

  const markRocketFound = function () {
    if (!state.rocket) { state.rocket = true; saveState(); }
  };

  // foguete desenhado apontando para cima, com o centro em (0, 0)
  const drawRocket = function (ctx, x, y, angle, scale, flame) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    if (flame > 0.02) {
      const len = (24 + Math.random() * 14) * flame;
      const g = ctx.createLinearGradient(0, 26, 0, 26 + len);
      g.addColorStop(0, "rgba(255, 246, 220, 0.95)");
      g.addColorStop(0.35, "rgba(255, 184, 92, 0.9)");
      g.addColorStop(1, "rgba(232, 137, 189, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-5, 25);
      ctx.quadraticCurveTo(-7, 26 + len * 0.45, 0, 26 + len);
      ctx.quadraticCurveTo(7, 26 + len * 0.45, 5, 25);
      ctx.closePath();
      ctx.fill();
    }

    // aletas
    ctx.fillStyle = "#a97ee0";
    ctx.beginPath();
    ctx.moveTo(-7, 6); ctx.lineTo(-16, 20); ctx.lineTo(-16, 27); ctx.lineTo(-7, 21);
    ctx.moveTo(7, 6); ctx.lineTo(16, 20); ctx.lineTo(16, 27); ctx.lineTo(7, 21);
    ctx.fill();

    // tubeira
    ctx.fillStyle = "#5d5468";
    ctx.beginPath();
    ctx.moveTo(-4.5, 21); ctx.lineTo(4.5, 21); ctx.lineTo(6, 26); ctx.lineTo(-6, 26);
    ctx.fill();

    // corpo + sombra lateral
    ctx.fillStyle = "#f3eef9";
    ctx.fillRect(-7, -22, 14, 44);
    ctx.fillStyle = "rgba(40, 20, 60, 0.14)";
    ctx.fillRect(2.5, -22, 4.5, 44);

    // coifa
    ctx.fillStyle = "#e889bd";
    ctx.beginPath();
    ctx.moveTo(-7, -22);
    ctx.quadraticCurveTo(-6.5, -37, 0, -46);
    ctx.quadraticCurveTo(6.5, -37, 7, -22);
    ctx.fill();

    // faixa e janela
    ctx.fillRect(-7, 9, 14, 3);
    ctx.fillStyle = "#2b2160";
    ctx.beginPath();
    ctx.arc(0, -8, 3.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#a97ee0";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  };

  const drawChute = function (ctx, x, y, open, sway, scale) {
    if (open <= 0) return;
    const w = 64 * scale * open;
    const h = 30 * scale * (0.4 + open * 0.6);
    const cx = x + sway;
    const cy = y - 64 * scale; // borda inferior do velame
    const attachY = y - 5 * scale;
    const gores = 4;

    ctx.save();

    // linhas de suspensão
    ctx.strokeStyle = "rgba(250, 248, 252, 0.6)";
    ctx.lineWidth = 1;
    [-1, -0.35, 0.35, 1].forEach(function (f) {
      ctx.beginPath();
      ctx.moveTo(cx + f * w / 2, cy);
      ctx.lineTo(x, attachY);
      ctx.stroke();
    });

    // velame com a borda recortada
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, "#e889bd");
    g.addColorStop(1, "#a97ee0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    ctx.bezierCurveTo(cx - w / 2, cy - h * 1.3, cx + w / 2, cy - h * 1.3, cx + w / 2, cy);
    for (let k = gores; k > 0; k--) {
      const xa = cx - w / 2 + (w / gores) * k;
      const xb = cx - w / 2 + (w / gores) * (k - 1);
      ctx.quadraticCurveTo((xa + xb) / 2, cy - h * 0.22, xb, cy);
    }
    ctx.fill();

    // gomos
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    for (let k = 1; k < gores; k++) {
      const xk = cx - w / 2 + (w / gores) * k;
      ctx.beginPath();
      ctx.moveTo(cx + (xk - cx) * 0.35, cy - h * 0.95);
      ctx.lineTo(xk, cy - h * 0.15);
      ctx.stroke();
    }

    ctx.restore();
  };

  const launchRocket = function (originX) {
    if (rocketBusy) return false;

    if (prefersReducedMotion()) {
      toast("🚀 " + ROCKET_DONE_HTML, { group: "rocket" });
      markRocketFound();
      return true;
    }

    rocketBusy = true;
    if (rocketBtn) rocketBtn.classList.add("is-launching");

    const view = fx.size();
    const W = view.w;
    const H = view.h;
    const scale = clamp(W / 1100, 0.8, 1.1);
    const x0 = clamp(typeof originX === "number" ? originX : W / 2, 50, W - 50);
    const startY = H + 60 * scale;
    const padY = H - 30 * scale;          // centro do foguete na rampa
    const apogeeY = Math.max(90, H * 0.2);
    const drift = (Math.random() < 0.5 ? -1 : 1) * rand(20, 60);
    const wind = rand(-14, 14);
    const BURN = 0.3;                     // fração da subida com o motor aceso
    const T_ROLL = 0.6;
    const T_COUNT = 1.8;
    const T_UP = 3;
    const T_DOWN = 5.2;
    const tIgnition = T_ROLL + T_COUNT;
    const tApogee = tIgnition + T_UP;
    const tEnd = tApogee + T_DOWN;
    const vDescent = (H + 120 * scale - apogeeY) / (T_DOWN - 0.5);

    const telemetry = toast("🚀 <b>Rocket Design UFABC</b> · levando o foguete à rampa…", { duration: 0, live: false, group: "rocket" });
    const smoke = [];
    const rocket = { x: x0, y: startY, angle: 0, flame: 0, chute: 0, sway: 0 };
    let t = 0;
    let phase = "";
    let lastAltitudeUpdate = 0;
    let liftoff = false;
    let landed = false;
    let apogeeX = x0;
    let apogeeAngle = 0;

    const setPhase = function (name, html) {
      if (phase === name) return;
      phase = name;
      telemetry.update(html);
    };

    const emit = function (x, y, vx, vy, size, alpha) {
      if (smoke.length >= 340) return;
      smoke.push({
        x: x, y: y, vx: vx, vy: vy,
        r0: rand(2, 4) * size, r1: rand(10, 18) * size,
        life: 0, max: rand(1.3, 2.3), a: alpha || rand(0.22, 0.4)
      });
    };

    const nozzle = function () {
      return {
        x: rocket.x - Math.sin(rocket.angle) * 26 * scale,
        y: rocket.y + Math.cos(rocket.angle) * 26 * scale
      };
    };

    fx.add({
      update: function (dt) {
        t += dt;

        const damp = Math.pow(0.3, dt);
        for (let i = smoke.length - 1; i >= 0; i--) {
          const p = smoke[i];
          p.life += dt;
          if (p.life >= p.max) { smoke.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= damp;
          p.vy = p.vy * damp - 6 * dt; // a fumaça sobe devagar
        }

        if (t < T_ROLL) {
          // o foguete chega à rampa
          const u = t / T_ROLL;
          rocket.y = startY + (padY - startY) * (1 - Math.pow(1 - u, 3));
        } else if (t < tIgnition) {
          // contagem regressiva
          const count = 3 - Math.min(2, Math.floor((t - T_ROLL) / (T_COUNT / 3)));
          setPhase("t" + count, "🚀 <b>Contagem regressiva</b> · <code>T-" + count + "</code>");
          rocket.y = padY;
          const shaking = t > tIgnition - 0.5;
          rocket.x = x0 + (shaking ? rand(-0.8, 0.8) : 0);
          if (shaking) {
            const n = nozzle();
            emit(n.x, n.y, rand(-40, 40), rand(-10, 5), 0.8 * scale);
          }
        } else if (t < tApogee) {
          // subida: aceleração curta com motor, depois voo inercial até o apogeu
          if (!liftoff) {
            liftoff = true;
            setPhase("ignition", "🔥 <b>Ignição!</b> Motor sólido SRAD aceso");
            for (let i = 0; i < 26; i++) emit(x0 + rand(-6, 6), H - 4, rand(-130, 130), rand(-30, 0), 1.1 * scale);
          }
          const u = (t - tIgnition) / T_UP;
          const f = u < BURN ? (u * u) / BURN : 1 - ((1 - u) * (1 - u)) / (1 - BURN);
          const prevX = rocket.x;
          const prevY = rocket.y;
          rocket.y = padY + (apogeeY - padY) * f;
          rocket.x = x0 + drift * f * f;
          const vy = rocket.y - prevY;
          if (vy < -0.05) rocket.angle = clamp(Math.atan2(rocket.x - prevX, -vy), -0.35, 0.35);
          rocket.flame = u < BURN ? 1 : Math.max(0, 1 - (u - BURN) / 0.05);

          const n = nozzle();
          if (rocket.flame > 0) {
            for (let i = 0; i < 3; i++) emit(n.x + rand(-2, 2), n.y + rand(0, 8), rand(-18, 18), rand(10, 40), scale);
          } else if (Math.random() < 0.25) {
            emit(n.x, n.y, rand(-8, 8), rand(0, 10), 0.6 * scale, 0.15);
          }

          if (u > 0.12 && t - lastAltitudeUpdate > 0.09) {
            lastAltitudeUpdate = t;
            phase = "climb";
            telemetry.update("↑ <b>Subindo</b> · altitude <code>" + formatNumber(Math.round(f * 1000) * 10) + " ft</code>");
          }
          apogeeX = rocket.x;
          apogeeAngle = rocket.angle;
        } else if (t < tEnd) {
          // apogeu, ejeção e descida sob o paraquedas
          const d = t - tApogee;
          if (phase !== "apogee" && phase !== "chute") {
            setPhase("apogee", "🎯 <b>Apogeu</b> · <code>10.000 ft</code> · carga de ejeção!");
            for (let i = 0; i < 18; i++) emit(rocket.x, rocket.y - 10 * scale, rand(-70, 70), rand(-70, 40), 0.9 * scale, 0.35);
          }
          if (d > 1) setPhase("chute", "🪂 <b>Paraquedas aberto</b> · descida controlada");

          rocket.flame = 0;
          rocket.chute = clamp((d - 0.15) / 0.6, 0, 1);
          const fall = d < 1 ? (d * d) / 2 : d - 0.5;
          rocket.y = apogeeY + vDescent * fall;
          rocket.sway = Math.sin(d * 1.8) * 14 * scale * rocket.chute;
          rocket.x = apogeeX + wind * d + rocket.sway * 0.4;
          const k = clamp(d / 1.1, 0, 1);
          const ease = k * k * (3 - 2 * k);
          rocket.angle = apogeeAngle + (Math.PI / 2 * 0.92 - apogeeAngle) * ease + Math.sin(d * 1.8 + 0.6) * 0.07 * rocket.chute;
        } else {
          if (!landed) {
            landed = true;
            telemetry.close();
            toast(ROCKET_DONE_HTML, { group: "rocket" });
            markRocketFound();
            rocketBusy = false;
            if (rocketBtn) rocketBtn.classList.remove("is-launching");
          }
          return smoke.length > 0; // deixa a fumaça terminar de sumir
        }
        return true;
      },
      draw: function (ctx) {
        smoke.forEach(function (p) {
          const k = p.life / p.max;
          ctx.fillStyle = "rgba(222, 212, 236, " + (p.a * (1 - k)).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * k, 0, TAU);
          ctx.fill();
        });
        if (landed) return;
        drawChute(ctx, rocket.x, rocket.y, rocket.chute, rocket.sway, scale);
        drawRocket(ctx, rocket.x, rocket.y, rocket.angle, scale, rocket.flame);
      }
    });

    return true;
  };

  if (rocketBtn) {
    rocketBtn.addEventListener("click", function () {
      const box = rocketBtn.getBoundingClientRect();
      launchRocket(box.left + box.width / 2);
    });
  }

  // =========================================
  // 2. ESTRELAS · "Faça sua estrela brilhar"
  // A plataforma criada no estágio na Mercedes-Benz dava estrelas a cada
  // aprendizado comprovado. Aqui há uma estrela escondida em cada aba.
  // =========================================
  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2C12.6 8.2 15.8 11.4 22 12C15.8 12.6 12.6 15.8 12 22C11.4 15.8 8.2 12.6 2 12C8.2 11.4 11.4 8.2 12 2Z"/></svg>';

  const STAR_FOUND_TEXT = {
    sobre: "Ela estava no fim da lista de tecnologias.",
    curriculo: "Bem onde a ideia nasceu: no estágio na Mercedes-Benz.",
    projetos: "Escondida na capa do projeto que dá nome a esta caça.",
    contato: "Perdida no mapa do Grande ABC."
  };

  // Recompensa permanente das 4 estrelas: um céu atrás do conteúdo com nebulosa,
  // estrelas brilhantes, planetas e estrelas cadentes de tempos em tempos.
  let skyEl = null;

  const buildSky = function () {
    // [left %, top %, tamanho px, atraso s]
    const sparkles = [[6, 14, 18, 0], [93, 9, 14, 1.2], [3, 58, 12, 2.1], [97, 40, 20, 0.6], [48, 4, 10, 1.7], [86, 90, 16, 2.6], [14, 94, 12, 0.9], [62, 97, 10, 3.1], [30, 2, 12, 2.4]]
      .map(function (s) {
        return '<i class="egg-sky-sparkle" style="left:' + s[0] + "%;top:" + s[1] + "%;--s:" + s[2] + "px;--d:" + s[3] + 's">' + STAR_SVG + "</i>";
      }).join("");
    // [left %, top %, atraso s]
    const meteors = [[78, 3, 0], [104, 24, 4.1], [46, -2, 8.3], [96, 56, 12.2]]
      .map(function (m) {
        return '<i class="egg-sky-meteor" style="left:' + m[0] + "%;top:" + m[1] + "%;--d:" + m[2] + 's"></i>';
      }).join("");

    skyEl = document.createElement("div");
    skyEl.className = "egg-sky";
    skyEl.setAttribute("aria-hidden", "true");
    skyEl.innerHTML =
      '<i class="egg-sky-nebula"></i>' +
      '<i class="egg-sky-stars egg-sky-stars-a"></i>' +
      '<i class="egg-sky-stars egg-sky-stars-b"></i>' +
      sparkles +
      '<div class="egg-planet egg-planet-ringed"><div class="egg-planet-inner">' +
        '<i class="egg-ring egg-ring-back"></i><i class="egg-sphere"></i><i class="egg-ring egg-ring-front"></i>' +
      "</div></div>" +
      '<div class="egg-planet egg-planet-rose"><div class="egg-planet-inner">' +
        '<i class="egg-sphere"></i><i class="egg-orbit"><i class="egg-moon"></i></i>' +
      "</div></div>" +
      '<div class="egg-planet egg-planet-ice"><div class="egg-planet-inner"><i class="egg-sphere"></i></div></div>' +
      meteors;
    document.body.insertBefore(skyEl, document.body.firstChild);
  };

  const syncSky = function (arriving) {
    const on = state.stars.length >= STAR_IDS.length;
    document.body.classList.toggle("egg-sky-on", on);
    if (on && !skyEl) buildSky();
    if (!skyEl) return;
    skyEl.hidden = !on;
    if (on && arriving && !prefersReducedMotion()) {
      skyEl.classList.add("is-arriving");
      setTimeout(function () { skyEl.classList.remove("is-arriving"); }, 5000);
    }
  };

  const syncStarButtons = function () {
    document.querySelectorAll("[data-egg-star]").forEach(function (btn) {
      const found = state.stars.includes(btn.dataset.eggStar);
      btn.classList.toggle("is-found", found);
      btn.setAttribute("aria-label", found ? "Estrela encontrada" : "Estrela escondida");
    });
  };

  const syncStars = function (arriving) {
    syncStarButtons();
    syncSky(arriving);
  };

  // O céu fica aceso por 5 minutos depois da 4ª estrela. Aí ele apaga, as estrelas
  // voltam a se esconder e a caça pode ser feita de novo. Vale mesmo recarregando a página.
  const SKY_LIT_MS = 5 * 60 * 1000;
  let skyResetTimer = 0;
  let skyFading = false;

  const resetStarHunt = function (live) {
    clearTimeout(skyResetTimer);
    state.stars = [];
    state.starsCompletedAt = null;
    saveState();
    syncStarButtons();

    if (!live) { syncSky(); return; }

    toast("🌙 <b>O céu apagou.</b> As 4 estrelas voltaram a se esconder, uma em cada aba. Que tal fazer elas brilharem de novo?", { group: "stars" });
    if (skyEl && !skyEl.hidden && !prefersReducedMotion()) {
      // apaga devagar e só então tira o céu
      skyFading = true;
      skyEl.classList.add("is-fading");
      setTimeout(function () {
        skyFading = false;
        skyEl.classList.remove("is-fading");
        syncSky();
      }, 2600);
    } else {
      syncSky();
    }
  };

  const scheduleSkyReset = function (live) {
    clearTimeout(skyResetTimer);
    if (state.stars.length < STAR_IDS.length) return;
    if (!state.starsCompletedAt) { // progresso salvo antes dessa regra existir
      state.starsCompletedAt = Date.now();
      saveState();
    }
    const left = state.starsCompletedAt + SKY_LIT_MS - Date.now();
    if (left <= 0) { resetStarHunt(live); return; }
    skyResetTimer = setTimeout(function () { resetStarHunt(true); }, left);
  };

  // abas em segundo plano atrasam timers: ao voltar, confere se já passou da hora
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) scheduleSkyReset(true);
  });

  const collectStar = function (btn) {
    const id = btn.dataset.eggStar;
    if (!STAR_IDS.includes(id)) return;

    const box = btn.getBoundingClientRect();
    sparkleBurst(box.left + box.width / 2, box.top + box.height / 2);

    const total = STAR_IDS.length;
    if (state.stars.includes(id)) {
      toast("✨ Essa estrela já está brilhando · <b>" + state.stars.length + "/" + total + "</b>", { group: "stars" });
      return;
    }

    state.stars.push(id);
    const found = state.stars.length;
    const left = total - found;
    if (left === 0) {
      state.starsCompletedAt = Date.now();
      state.skyLit += 1;
    }
    saveState();

    // se o céu ainda estava apagando, termina a transição antes de acender de novo
    if (skyFading && skyEl) { skyFading = false; skyEl.classList.remove("is-fading"); }
    syncStars(left === 0);
    if (left === 0) scheduleSkyReset(true);

    if (left > 0) {
      toast(
        "⭐ <b>Estrela " + found + "/" + total + " encontrada!</b> " + STAR_FOUND_TEXT[id] + " " +
        (left === 1 ? "Falta 1" : "Faltam " + left) + ", uma em cada aba. Faça sua estrela brilhar.",
        { group: "stars" }
      );
    } else {
      toast(
        "🌟 <b>" + total + "/" + total + " · Você fez sua estrela brilhar!</b> Na plataforma que idealizei no estágio da Mercedes-Benz, cada aprendizado comprovado virava uma estrela. Aqui, elas acenderam o céu: repare no fundo do site, agora com planetas e estrelas cadentes. 🪐 Ele fica aceso por 5 minutos; depois as estrelas se escondem de novo para uma nova caça.",
        { group: "stars" }
      );
      celebrateSky(box.left + box.width / 2, box.top + box.height / 2);
    }
  };

  document.addEventListener("click", function (event) {
    const star = event.target.closest("[data-egg-star]");
    if (!star) return;
    event.preventDefault();
    collectStar(star);
  });

  // A estrela da aba Projetos só existe dentro do modal do projeto marcado com data-egg-modal-star.
  // script.js recria a capa do modal a cada abertura, então a estrela é inserida de novo aqui.
  const modalCover = document.querySelector("[data-modal-cover]");
  document.querySelectorAll("[data-project-trigger]").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      const item = trigger.closest("[data-filter-item]");
      if (!modalCover || !item || !item.dataset.eggModalStar) return;
      modalCover.insertAdjacentHTML(
        "beforeend",
        '<button class="egg-star egg-star-cover" type="button" data-egg-star="' + escapeHTML(item.dataset.eggModalStar) + '">' + STAR_SVG + "</button>"
      );
      syncStarButtons();
    });
  });

  scheduleSkyReset(false); // se os 5 minutos já passaram, recomeça a caça antes de desenhar
  syncStars();

  // =========================================
  // 3. ASTEROIDE · Caça Asteroides (NASA · MCTI)
  // Um pontinho atravessa o céu aos saltos, com as posições dos "quadros"
  // anteriores, como nas sequências de imagens da campanha.
  // =========================================
  let asteroid = null;
  let asteroidTimer = 0;

  const scheduleAsteroid = function (delayMs) {
    clearTimeout(asteroidTimer);
    if (prefersReducedMotion()) return; // sem movimento automático para quem pediu menos animação
    asteroidTimer = setTimeout(function () {
      const busy = document.hidden ||
        document.body.classList.contains("modal-open") ||
        document.body.classList.contains("egg-term-open");
      if (busy || asteroid) { scheduleAsteroid(12000); return; }
      spawnAsteroid();
    }, delayMs);
  };

  const spawnAsteroid = function () {
    if (asteroid) return false;

    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const fromLeft = Math.random() < 0.5;
    const y0 = H * rand(0.14, 0.5);
    const y1 = clamp(y0 + H * rand(-0.15, 0.25), H * 0.1, H * 0.72);
    const x0 = fromLeft ? -24 : W + 24;
    const x1 = fromLeft ? W + 24 : -24;
    const STEP_MS = 160;
    const steps = Math.round(clamp(W / 65, 9, 22) * 1000 / STEP_MS);
    const dx = (x1 - x0) / steps;
    const dy = (y1 - y0) / steps;

    const el = document.createElement("button");
    el.type = "button";
    el.className = "egg-asteroid";
    el.setAttribute("aria-label", "Um objeto está cruzando o céu do site. Registrar descoberta");
    el.innerHTML = [3, 2, 1].map(function (k) {
      return '<i class="egg-asteroid-ghost" style="--gx:' + (-dx * k * 2).toFixed(1) + "px;--gy:" + (-dy * k * 2).toFixed(1) + "px;--go:" + (0.45 - k * 0.11).toFixed(2) + '"></i>';
    }).join("") + '<i class="egg-asteroid-core"></i>';
    document.body.appendChild(el);

    let step = 0;
    let caught = false;

    const place = function () {
      el.style.transform = "translate(" + (x0 + dx * step).toFixed(1) + "px, " + (y0 + dy * step).toFixed(1) + "px)";
    };

    const dismiss = function (delay) {
      if (asteroid && asteroid.el === el) asteroid = null;
      setTimeout(function () {
        el.classList.add("is-leaving");
        setTimeout(function () { el.remove(); }, 400);
      }, delay);
    };

    const timer = setInterval(function () {
      step++;
      if (step > steps) {
        clearInterval(timer);
        dismiss(0);
        scheduleAsteroid(rand(40000, 70000));
        return;
      }
      place();
    }, STEP_MS);

    // cancel(): tira este asteroide na hora (o comando "asteroide" do terminal sempre lança um novo)
    asteroid = {
      el: el,
      cancel: function () {
        clearInterval(timer);
        if (asteroid && asteroid.el === el) asteroid = null;
        el.remove();
      }
    };

    el.addEventListener("click", function () {
      if (caught) return;
      caught = true;
      clearInterval(timer);

      state.asteroids += 1;
      saveState();
      const designation = "2026 MH" + state.asteroids;
      el.dataset.label = designation;
      el.classList.add("is-caught");
      el.setAttribute("aria-label", "Asteroide " + designation + " registrado");

      toast(
        "☄️ <b>Asteroide detectado!</b> Designação provisória <code>" + designation + "</code>. Na campanha Caça Asteroides (NASA · MCTI) é isso que a gente faz: compara imagens do céu e procura o pontinho que se move." +
        (state.asteroids > 1 ? " Você já registrou <b>" + state.asteroids + "</b> objetos." : ""),
        { group: "asteroid" }
      );
      dismiss(1800);
      scheduleAsteroid(rand(50000, 90000));
    });

    place();
    return true;
  };

  scheduleAsteroid(rand(20000, 30000));

  // =========================================
  // 4. TERMINAL SECRETO
  // Homenagem ao Green Team Hacker Club e à Maratona de Programação Feminina.
  // Abre com o código Konami ou com 7 toques no avatar.
  // =========================================
  let term = null;
  let termOut = null;
  let termInput = null;
  let termBody = null;
  let termReturnFocus = null;
  const cmdHistory = [];
  let historyIndex = 0;

  const termPrint = function (html) {
    const line = document.createElement("div");
    line.innerHTML = html;
    termOut.appendChild(line);
  };

  const cmdRow = function (name, description) {
    return '  <b class="t-accent">' + name.padEnd(11) + "</b> " + description;
  };

  const check = function (done) {
    return done ? '<b class="t-ok">[✓]</b>' : '<b class="t-muted">[ ]</b>';
  };

  const closeTerminalThen = function (callback, delay) {
    setTimeout(function () { closeTerminal(); callback(); }, delay);
  };

  const printStars = function () {
    const labels = { sobre: "sobre mim", curriculo: "currículo", projetos: "projetos", contato: "contato" };
    const total = STAR_IDS.length;
    termPrint(
      "⭐ Faça sua estrela brilhar · <strong>" + state.stars.length + "/" + total + "</strong>\n" +
      "  " + STAR_IDS.map(function (id) { return check(state.stars.includes(id)) + " " + labels[id]; }).join("   ") + "\n" +
      (state.stars.length >= total
        ? '<b class="t-gold">o céu do site está aceso ✨</b> <b class="t-muted">· apaga em ~' + skyMinutesLeft() + " min e as estrelas se escondem de novo</b>"
        : '<b class="t-muted">há uma estrela escondida em cada aba do site.</b>' +
          (state.skyLit > 0 ? '\n<b class="t-muted">você já acendeu o céu ' + state.skyLit + "× · bora de novo?</b>" : ""))
    );
  };

  const skyMinutesLeft = function () {
    const ms = state.starsCompletedAt ? state.starsCompletedAt + SKY_LIT_MS - Date.now() : 0;
    return Math.max(1, Math.ceil(ms / 60000));
  };

  const printSecrets = function () {
    const total = STAR_IDS.length;
    const rows = [
      [state.rocket, "foguete", "algo em “O que estou fazendo” está pronto pra decolar"],
      [
        state.stars.length >= total || state.skyLit > 0,
        "estrelas " + state.stars.length + "/" + total,
        state.skyLit > 0 ? "céu aceso " + state.skyLit + "× · elas se escondem de novo 5 min depois" : "uma escondida em cada aba"
      ],
      [state.asteroids > 0, "asteroide", "olhe o céu do site com paciência"],
      [state.terminal, "terminal", "você está aqui 😉"]
    ];
    const found = rows.filter(function (row) { return row[0]; }).length;
    termPrint(
      "<strong>easter eggs · " + found + "/" + rows.length + " encontrados</strong>\n" +
      rows.map(function (row) { return "  " + check(row[0]) + " " + row[1].padEnd(13) + '<b class="t-muted">' + row[2] + "</b>"; }).join("\n")
    );
  };

  const PROGRAMS = [
    ["Dn'A Women", "desenvolvimento de universitárias de alto potencial"],
    ["Fin4She", "mulheres no mercado financeiro · ANBIMA"],
    ["She++ | Uber", "mulheres em tecnologia e engenharia"],
    ["Hackathon Itaú", "IA e multi-cloud no setor financeiro"],
    ["Bootcamp Locke", "filosofia, política e inovação"],
    ["Uber Global Hacktown", "design de produto e análise de dados"],
    ["Green Team Hacker Club", "programação e proteção de dados 💻"],
    ["GitHub Copilot Day", "IA no desenvolvimento de software"],
    ["Google Cloud Summit", "nuvem, dados e IA"],
    ["B3 Career Summit", "carreira no mercado financeiro"]
  ];

  const TERM_COMMANDS = {
    help: function () {
      termPrint([
        "<strong>comandos</strong>",
        cmdRow("whoami", "quem é você (e quem sou eu)"),
        cmdRow("estagios", "linha do tempo dos meus estágios"),
        cmdRow("programas", "programas e imersões que fiz"),
        cmdRow("foguete", "lança um foguete da Rocket Design 🚀"),
        cmdRow("boson", "um evento de física de partículas"),
        cmdRow("asteroide", "chama um objeto para o céu do site"),
        cmdRow("estrelas", "progresso da caça às estrelas"),
        cmdRow("segredos", "easter eggs que você já encontrou"),
        '  <b class="t-accent">ls</b> · <b class="t-accent">cat</b> · <b class="t-accent">python</b> · <b class="t-accent">clear</b> · <b class="t-accent">exit</b>'
      ].join("\n"));
    },

    whoami: function () {
      termPrint(
        "visitante 👋\n" +
        "mas este terminal é da <strong>Maria Heloísa Prado</strong>\n" +
        '<b class="t-muted">Eng. Aeroespacial + Eng. de Dados @ UFABC · Santo André, SP</b>'
      );
    },

    estagios: function () {
      termPrint([
        "<strong>meus estágios</strong>",
        '<b class="t-lilac">2024</b> <b class="t-accent">●</b>  Mercedes-Benz Brasil · Estagiária de Engenharia (11 meses)',
        '     <b class="t-muted">│</b>  dados, Power BI e a ideia do “Faça sua estrela brilhar” ⭐',
        '<b class="t-lilac">2025</b> <b class="t-accent">●</b>  Shopper.com.br · Estagiária de Negociação (6 meses)',
        '     <b class="t-muted">│</b>  fornecedores, SKUs e o Pet.Shopper 🐾',
        '<b class="t-lilac">2026</b> <b class="t-accent">●</b>  Red Bull · Marketing | Embaixadora na UFABC',
        "        hacks, seeding e sampling no campus 🥫",
        "",
        '<b class="t-muted">dica: digite o nome de uma das empresas 😉</b>'
      ].join("\n"));
    },

    programas: function () {
      termPrint(
        "<strong>programas &amp; imersões</strong>\n" +
        PROGRAMS.map(function (p) {
          return '  <b class="t-lilac">▸</b> ' + escapeHTML(p[0].padEnd(24)) + '<b class="t-muted">' + escapeHTML(p[1]) + "</b>";
        }).join("\n")
      );
    },

    foguete: function () {
      if (rocketBusy) { termPrint("🚀 o foguete ainda está no ar. Espere ele pousar!"); return; }
      termPrint('🚀 rampa liberada! <b class="t-muted">fechando o terminal…</b>');
      closeTerminalThen(function () { launchRocket(); }, 700);
    },

    boson: function () {
      const eventId = String(Math.floor(rand(10000, 99999)));
      termPrint([
        '<b class="t-muted">gerando evento Monte Carlo #' + eventId + " …</b> " + '<b class="t-ok">ok</b>',
        "",
        '  u ───────╮             <b class="t-accent">╭─── e+</b>  pósitron',
        '           ●~~~~ <b class="t-gold">W+</b> ~~~~~●',
        '  d̄ ───────╯             <b class="t-blue">╰─── νe</b>  neutrino (energia faltante)',
        "",
        "  m(W) ≈ 80,4 GeV/c² · pp → W+ → e+ νe",
        '<b class="t-muted">  pesquisa na UFABC em colaboração com o SPRACE (2024–2025)</b>'
      ].join("\n"));
    },

    asteroide: function () {
      termPrint('🔭 apontando o telescópio… <b class="t-muted">clique no pontinho que se move pelo céu do site.</b>');
      closeTerminalThen(function () {
        if (asteroid) asteroid.cancel(); // troca por um novo, para a travessia ser completa
        spawnAsteroid();
      }, 900);
    },

    estrelas: printStars,

    segredos: printSecrets,

    mercedes: function () {
      termPrint('<b class="t-muted">estágio na Mercedes-Benz (2024–2025) → plataforma “Faça sua estrela brilhar”</b>');
      printStars();
    },

    shopper: function () {
      termPrint([
        "🛒 abrindo negociação com o fornecedor…",
        "   custo unitário   R$ 100,00 → R$ 88,00  " + '<b class="t-ok">(−12%)</b>',
        "   novos SKUs       +3 no mix do Pet.Shopper 🐾",
        '<b class="t-ok">✓ negócio fechado:</b> margem ↑ · sell-out ↑   <b class="t-muted">(simulação, claro 😄)</b>'
      ].join("\n"));
    },

    redbull: function () {
      if (rocketBusy) { termPrint("🥫 energia de sobra, mas o foguete ainda está no ar!"); return; }
      termPrint("🥫 energia extra detectada… isso pede um voo.");
      closeTerminalThen(function () { launchRocket(); }, 900);
    },

    ls: function () {
      termPrint('<b class="t-lilac">foguete/</b>  bosonW.root  dashboards.pbix  tecmeninas.py  estrela.html  segredos.txt');
    },

    cat: function (args) {
      const file = args[0];
      if (!file) { termPrint("uso: cat &lt;arquivo&gt;"); return; }
      if (file === "segredos.txt" || file === "segredos") { printSecrets(); return; }
      if (file === "tecmeninas.py") {
        termPrint([
          '<b class="t-muted"># TecMeninas ABC · alcance em 2026</b>',
          "meninas = 185",
          "escolas = 6",
          "cidades = 3",
          'print(f"{meninas} meninas, {escolas} escolas, {cidades} cidades do Grande ABC 💜")'
        ].join("\n"));
        return;
      }
      if (file === "foguete" || file === "foguete/") { termPrint("cat: foguete/: é um diretório (e está na rampa de lançamento)"); return; }
      termPrint("cat: " + escapeHTML(file) + ": confidencial 🔒");
    },

    python: function () {
      termPrint([
        '<b class="t-muted">Python 3 · TecMeninas ABC edition</b>',
        '<b class="t-accent">&gt;&gt;&gt;</b> print("Olá, mundo!")',
        "Olá, mundo!",
        '<b class="t-muted"># todo mundo começa por aqui. No TecMeninas ABC, esse primeiro passo chega a meninas de escolas públicas 💜</b>'
      ].join("\n"));
    },

    sudo: function () {
      termPrint(
        "[sudo] senha para visitante: ********\n" +
        "visitante não está no arquivo sudoers. Este incidente será reportado à Maria Heloísa. 😄"
      );
    },

    oi: function () {
      termPrint('oi! 👋 digite <b class="t-accent">help</b> para ver o que dá pra fazer por aqui.');
    },

    clear: function () { termOut.innerHTML = ""; },

    exit: function () { closeTerminal(); }
  };

  const TERM_ALIASES = {
    ajuda: "help", "?": "help",
    estagio: "estagios", internships: "estagios",
    programa: "programas",
    lancar: "foguete", launch: "foguete", rocket: "foguete",
    bosonw: "boson", w: "boson", sprace: "boson",
    asteroid: "asteroide", nasa: "asteroide", telescopio: "asteroide",
    estrela: "estrelas", stars: "estrelas",
    eggs: "segredos", easter: "segredos", segredo: "segredos",
    "red-bull": "redbull",
    "mercedes-benz": "mercedes",
    python3: "python",
    ola: "oi", hello: "oi", hi: "oi",
    limpar: "clear", cls: "clear",
    sair: "exit", quit: "exit", q: "exit"
  };

  const printBanner = function () {
    termPrint(
      '<b class="t-accent">' +
      " __  __  _   _\n" +
      "|  \\/  || | | |\n" +
      "| |\\/| || |_| |\n" +
      "| |  | ||  _  |\n" +
      "|_|  |_||_| |_|</b>\n\n" +
      "<strong>terminal secreto</strong> · homenagem ao Green Team Hacker Club e à Maratona de Programação Feminina\n" +
      'digite <b class="t-accent">help</b> para ver os comandos.\n'
    );
  };

  const runCommand = function (raw) {
    const line = raw.trim();
    termPrint('<b class="t-accent">mh:~$</b> ' + escapeHTML(line));
    if (line) {
      cmdHistory.push(line);
      const parts = normalize(line).split(/\s+/);
      const name = own(TERM_ALIASES, parts[0]) ? TERM_ALIASES[parts[0]] : parts[0];
      if (own(TERM_COMMANDS, name)) {
        TERM_COMMANDS[name](parts.slice(1));
      } else {
        termPrint('<b class="t-muted">comando não encontrado:</b> ' + escapeHTML(parts[0]) + ' · digite <b class="t-accent">help</b>');
      }
    }
    historyIndex = cmdHistory.length;
    if (termBody) termBody.scrollTop = termBody.scrollHeight;
  };

  const onTerminalKey = function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // não fecha o modal de projetos que estiver por baixo
      closeTerminal();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!cmdHistory.length) return;
      event.preventDefault();
      historyIndex = clamp(historyIndex + (event.key === "ArrowUp" ? -1 : 1), 0, cmdHistory.length);
      termInput.value = cmdHistory[historyIndex] || "";
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const typed = normalize(termInput.value);
      if (!typed || /\s/.test(typed)) return;
      const matches = Object.keys(TERM_COMMANDS).filter(function (name) { return name.indexOf(typed) === 0; });
      if (matches.length === 1) {
        termInput.value = matches[0] + " ";
      } else if (matches.length > 1) {
        termPrint('<b class="t-muted">' + matches.join("  ") + "</b>");
        termBody.scrollTop = termBody.scrollHeight;
      }
    }
  };

  const buildTerminal = function () {
    term = document.createElement("div");
    term.className = "egg-term";
    term.hidden = true;
    term.innerHTML =
      '<div class="egg-term-window" role="dialog" aria-modal="true" aria-label="Terminal secreto">' +
        '<div class="egg-term-bar">' +
          "<i></i><i></i><i></i>" +
          '<p class="egg-term-title">mh@ufabc: ~ · terminal secreto</p>' +
          '<button class="egg-term-close" type="button" data-term-close aria-label="Fechar terminal">×</button>' +
        "</div>" +
        '<div class="egg-term-body" data-term-body>' +
          '<div class="egg-term-out" data-term-out aria-live="polite"></div>' +
          '<form class="egg-term-line" data-term-form>' +
            '<label for="egg-term-input">mh:~$</label>' +
            '<input id="egg-term-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send">' +
          "</form>" +
        "</div>" +
      "</div>";
    document.body.appendChild(term);

    termOut = term.querySelector("[data-term-out]");
    termInput = term.querySelector("#egg-term-input");
    termBody = term.querySelector("[data-term-body]");

    term.querySelector("[data-term-close]").addEventListener("click", closeTerminal);
    term.addEventListener("click", function (event) { if (event.target === term) closeTerminal(); });
    termBody.addEventListener("click", function () {
      if (!String(window.getSelection ? window.getSelection() : "")) termInput.focus();
    });
    term.querySelector("[data-term-form]").addEventListener("submit", function (event) {
      event.preventDefault();
      const value = termInput.value;
      termInput.value = "";
      runCommand(value);
    });
    termInput.addEventListener("keydown", onTerminalKey);

    printBanner();
  };

  const openTerminal = function () {
    if (!term) buildTerminal();
    if (!term.hidden) { termInput.focus(); return; }
    termReturnFocus = document.activeElement;
    term.hidden = false;
    document.body.classList.add("egg-term-open");
    termInput.focus();
    termBody.scrollTop = termBody.scrollHeight;
    if (!state.terminal) { state.terminal = true; saveState(); }
  };

  const closeTerminal = function () {
    if (!term || term.hidden) return;
    term.hidden = true;
    document.body.classList.remove("egg-term-open");
    if (termReturnFocus && typeof termReturnFocus.focus === "function") {
      termReturnFocus.focus({ preventScroll: true });
    }
  };

  // Gatilho 1: código Konami (fora de campos de texto)
  const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  let konamiStep = 0;
  document.addEventListener("keydown", function (event) {
    if (event.target.closest && event.target.closest("input, textarea, select, [contenteditable]")) return;
    const key = (event.key || "").toLowerCase();
    if (key === KONAMI[konamiStep]) {
      konamiStep++;
      if (konamiStep === KONAMI.length) {
        konamiStep = 0;
        event.preventDefault(); // senão o "a" final é digitado no terminal que acabou de abrir
        toast("🎮 <b>Código Konami aceito.</b> Terminal secreto desbloqueado!", { group: "terminal" });
        openTerminal();
      }
    } else {
      konamiStep = key === KONAMI[0] ? 1 : 0;
    }
  });

  // Gatilho 2: 7 toques no avatar, como as "opções do desenvolvedor" do Android
  const avatar = document.querySelector("[data-egg-avatar]");
  if (avatar) {
    const TAPS_NEEDED = 7;
    let taps = 0;
    let tapTimer = 0;
    let tapToast = null;
    avatar.addEventListener("click", function () {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { taps = 0; }, 1500);
      const left = TAPS_NEEDED - taps;

      if (left <= 0) {
        taps = 0;
        if (tapToast) tapToast.close();
        tapToast = null;
        toast("🧑‍💻 <b>Agora você é dev!</b> Terminal secreto desbloqueado.", { group: "terminal" });
        openTerminal();
      } else if (taps >= 3) {
        const html = "🧑‍💻 Faltam <b>" + left + "</b> " + (left === 1 ? "toque" : "toques") + " para você virar dev…";
        if (tapToast && tapToast.el.isConnected && !tapToast.el.classList.contains("is-leaving")) {
          tapToast.update(html);
        } else {
          tapToast = toast(html, { duration: 1600, group: "terminal" });
        }
        tapToast.hold(1600);
      }
    });
  }

  // =========================================
  // AVIÃO COM DICAS · a cada 1 min 30 s
  // =========================================
  const towEl = document.querySelector("[data-egg-tow]");
  if (towEl && !prefersReducedMotion() && typeof towEl.animate === "function") {
    const TOW_FIRST_MS = 8000;           // primeira passagem, logo após abrir o site
    const TOW_EVERY_MS = 90 * 1000;      // intervalo entre passagens (1 min 30 s)
    const TOW_HINTS = [
      "<strong>Dica:</strong> nem todo ícone é só enfeite. Tem um foguete esperando um clique 🚀",
      "<strong>Dica:</strong> estrelinhas se escondem em cada aba. Junte as 4 e o céu acende ✨",
      "<strong>Dica:</strong> fique de olho no céu: de vez em quando um asteroide cruza a tela ☄️",
      "<strong>Dica:</strong> hackers conhecem o código Konami: ↑ ↑ ↓ ↓ ← → ← → B A ⌨️",
      "<strong>Dica:</strong> tocar 7 vezes na minha foto também abre um terminal secreto 👩‍💻",
      "<strong>Psiu!</strong> São <strong>4 easter eggs</strong> escondidos. Já achou quantos?"
    ];
    const towText = towEl.querySelector("[data-egg-tow-text]");
    let hintIndex = Math.floor(Math.random() * TOW_HINTS.length);
    const TOW_PX_PER_S = 110;            // velocidade do avião
    let towFlying = false;

    const flyTow = function () {
      if (towFlying || document.hidden) return;
      towFlying = true;
      if (towText) towText.innerHTML = TOW_HINTS[hintIndex];
      hintIndex = (hintIndex + 1) % TOW_HINTS.length;
      towEl.hidden = false;
      // o avião voa da direita para a esquerda; o desenho do avião aponta para a esquerda
      const width = towEl.offsetWidth;
      const distance = window.innerWidth + width;
      const flight = towEl.animate(
        [
          { transform: "translateX(" + window.innerWidth + "px)" },
          { transform: "translateX(" + (-width) + "px)" }
        ],
        { duration: (distance / TOW_PX_PER_S) * 1000, easing: "linear", fill: "forwards" }
      );
      flight.onfinish = function () {
        towEl.hidden = true;
        towFlying = false;
      };
    };

    setTimeout(function () {
      flyTow();
      setInterval(flyTow, TOW_EVERY_MS);
    }, TOW_FIRST_MS);
  }

  // =========================================
  // FAIXA DE AVISO (topo do site)
  // =========================================
  const bannerEl = document.querySelector("[data-egg-banner]");
  if (bannerEl) {
    const BANNER_KEY = "mh-egg-banner-closed";
    let closed = false;
    try { closed = localStorage.getItem(BANNER_KEY) === "1"; } catch (e) { closed = false; }
    bannerEl.hidden = closed;
    const closeBtn = bannerEl.querySelector("[data-egg-banner-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        bannerEl.hidden = true;
        try { localStorage.setItem(BANNER_KEY, "1"); } catch (e) { /* armazenamento bloqueado */ }
      });
    }
  }

  // Pista para quem abrir o console do navegador
  console.log("%c🚀 Oi, pessoa curiosa!", "font: 600 15px Poppins, sans-serif; color: #e889bd;");
  console.log(
    "%cEste portfólio tem 4 easter eggs escondidos. Uma dica para começar: ↑ ↑ ↓ ↓ ← → ← → B A",
    "font: 13px Poppins, sans-serif; color: #a97ee0;"
  );

})();
