/* ==========================================================================
   transitions.js — unravel transition (strings peel right, return from right)
   Drop-in: <script src="transitions.js"></script> before </body>
   ========================================================================== */
(function() {

  var PAL = [
    [96,200,255],[160,100,255],[255,100,160],[60,220,180],[255,200,60],
    [100,255,200],[255,140,80],[180,140,255],[80,220,255],[184,118,26]
  ];

  /* timing */
  var EXIT_DUR    = 780;   /* ms — strings peel off to the right          */
  var HOLD_DUR    = 90;    /* ms — brief dark beat between pages           */
  var ENTRY_DUR   = 680;   /* ms — strings slide back in from the right    */
  var CONTENT_IN  = 420;   /* ms — page content fades in during entry      */

  /* easing */
  function eo3(t) { return 1 - Math.pow(1 - t, 3); }
  function eo5(t) { return 1 - Math.pow(1 - t, 5); }
  function ei2(t) { return t * t; }
  function eios(t){ return -(Math.cos(Math.PI * t) - 1) / 2; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  /* ── seeded PRNG so strings are consistent across exit/entry ── */
  var SEED = 54321;
  function makeRand(s) {
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return ((s >>> 0) / 0xffffffff);
    };
  }

  /* ── Build string descriptors ─────────────────────────────────────────
     Each string has:
       baseY      resting Y in spill zone
       freq/amp   wave shape at rest
       stagger    delay before this string starts peeling (0–1 fraction of EXIT_DUR)
                  strings stagger top-to-bottom so they peel in a wave
       pullCurve  how much the right side leads the left (creates the sweep feel)
  ─────────────────────────────────────────────────────────────────────── */
  function buildStrings(W, H) {
    var rand = makeRand(SEED);
    var N = 14;
    var strings = [];
    for (var i = 0; i < N; i++) {
      strings.push({
        col:       PAL[i % PAL.length],
        baseY:     H * (0.80 + 0.16 * (i / (N - 1))) + (rand() - 0.5) * 8,
        freq:      0.012 + rand() * 0.016,
        freq2:     0.005 + rand() * 0.007,
        phase:     rand() * Math.PI * 2,
        phase2:    rand() * Math.PI * 2,
        amp:       5 + rand() * 12,
        amp2:      3 + rand() * 7,
        driftRate: 0.25 + rand() * 0.35,
        lineW:     0.9 + rand() * 1.1,
        alpha:     0.48 + rand() * 0.40,
        glowAmt:   6 + rand() * 10,
        /* stagger: evenly spaced across 55% of EXIT_DUR so they cascade */
        stagger:   (i / (N - 1)) * 0.55,
        /* how sharply the right side leads — gentle parabolic pull */
        pullPow:   1.4 + rand() * 0.5
      });
    }
    return strings;
  }

  /* ── canvas ── */
  function getCanvas() {
    var cv = document.getElementById('_txCv');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = '_txCv';
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99998';
      document.body.appendChild(cv);
    }
    var dpr = window.devicePixelRatio || 1;
    cv.width  = Math.round(window.innerWidth  * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    return cv;
  }

  /* ── draw one string at a given peel amount ──────────────────────────
     peelT: 0 = string at rest, 1 = string fully off right edge
     clock: elapsed seconds (wave drift)
  ─────────────────────────────────────────────────────────────────────── */
  function drawString(ctx, s, W, peelT, clock) {
    if (s.alpha < 0.005) return;
    var c = s.col;

    /* The peel: each x-point on the string is displaced rightward.
       The right end leads the left — a smooth parabolic offset so
       the string looks like it's being pulled from the right side.
       At peelT=0: no displacement. At peelT=1: whole string is off-screen right. */
    var peelEased = eo3(peelT);          /* smooth acceleration into the peel */
    var maxShift  = W * 1.15;            /* how far right they travel          */

    /* fade: strings dim slightly as they exit, but stay mostly bright */
    var alpha = s.alpha * (1 - peelEased * 0.55);

    ctx.beginPath();
    var step = 3;
    for (var x = 0; x <= W; x += step) {
      /* parabolic pull: right side (x near W) displaced more than left (x near 0) */
      var xNorm = x / W;                                  /* 0 → 1 left to right */
      var pull  = Math.pow(xNorm, s.pullPow);             /* 0 at left, 1 at right */
      var shift = peelEased * maxShift * pull;

      var px = x + shift;

      /* wave shape — two harmonics for organic feel */
      var drift = clock * s.driftRate;
      var y = s.baseY
        + Math.sin(x * s.freq  + s.phase  + drift)        * s.amp
        + Math.sin(x * s.freq2 + s.phase2 + drift * 0.6)  * s.amp2;

      /* slight vertical lift as the string peels — right end rises gently */
      y -= pull * peelEased * 18;

      if (x === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }

    /* glow pass */
    ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.45)+')';
    ctx.lineWidth   = s.lineW + 2.5;
    ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.6)+')';
    ctx.shadowBlur  = s.glowAmt * (1 + peelEased * 0.4);
    ctx.stroke();
    ctx.shadowBlur  = 0;

    /* core */
    ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
    ctx.lineWidth   = s.lineW;
    ctx.stroke();
  }

  /* ── draw full frame ── */
  function drawFrame(ctx, strings, W, H, dpr, peelTs, darkAlpha, clock) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (darkAlpha > 0.005) {
      ctx.fillStyle = 'rgba(13,15,20,' + darkAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    for (var i = 0; i < strings.length; i++) {
      drawString(ctx, strings[i], W, peelTs[i], clock);
    }
  }

  /* ── compute per-string peel amount for a given global t ── */
  function getPeelTs(strings, t) {
    var pts = [];
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      /* local t: starts at s.stagger, runs for the remaining fraction */
      var localT = clamp((t - s.stagger) / (1 - s.stagger * 0.6), 0, 1);
      pts.push(eo5(localT));
    }
    return pts;
  }

  /* ================================================================
     EXIT  — strings peel off to the right, page dims
  ================================================================ */
  function runExit(href) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, last = null, start = null;

    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.15s'; spill.style.opacity = '0'; }

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;

      var t = clamp((ts - start) / EXIT_DUR, 0, 1);
      var darkAlpha = eios(t) * 0.82;     /* page dims as strings leave */
      var peelTs = getPeelTs(strings, t);

      drawFrame(ctx, strings, W, H, dpr, peelTs, darkAlpha, clock);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        /* brief hold then navigate */
        setTimeout(function() {
          sessionStorage.setItem('_tx', '1');
          window.location.href = href;
        }, HOLD_DUR);
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     ENTRY — strings slide in from the right, page fades in
  ================================================================ */
  function runEntry() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, last = null, start = null;
    var contentStarted = false;

    /* start fully dark — matches end of exit */
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(13,15,20,0.82)';
    ctx.fillRect(0, 0, W, H);

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;

      var t = clamp((ts - start) / ENTRY_DUR, 0, 1);

      /* reverse peel: strings start fully off-screen right, slide back left */
      var peelTs = getPeelTs(strings, 1 - t);

      /* dark overlay lifts as strings arrive */
      var darkAlpha = (1 - eo3(t)) * 0.82;

      drawFrame(ctx, strings, W, H, dpr, peelTs, darkAlpha, clock);

      /* fade page content in partway through entry */
      if (!contentStarted && t >= 0.25) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + CONTENT_IN + 'ms ease';
        document.body.style.opacity = '1';
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, W * dpr, H * dpr);
        cv.remove();
        document.body.style.transition = '';
        document.body.style.opacity = '1';
        var spill = document.getElementById('neonSpill');
        if (spill) { spill.style.transition = 'opacity 0.4s'; spill.style.opacity = '1'; }
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     INTERCEPT + BOOT
  ================================================================ */
  function isInternal(href) {
    if (!href) return false;
    if (href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('//')) return false;
    if (href === '#' || href.startsWith('#')) return false;
    return true;
  }

  function boot() {
    if (sessionStorage.getItem('_tx')) {
      sessionStorage.removeItem('_tx');
      requestAnimationFrame(function() { requestAnimationFrame(runEntry); });
    }

    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el) return;
      var href = el.getAttribute('href');
      if (!isInternal(href)) return;
      var cur = window.location.pathname.split('/').pop() || 'index.html';
      var tgt = href.split('/').pop().split('?')[0].split('#')[0];
      if (cur === tgt) return;
      e.preventDefault();
      runExit(href);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
