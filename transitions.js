/* ==========================================================================
   transitions.js — shared page transition engine
   Include on every page with <script src="transitions.js"></script>
   ========================================================================== */

(function() {

  var PALETTE = [
    [96,200,255],[160,100,255],[255,100,160],[60,220,180],[255,200,60],
    [100,255,200],[255,140,80],[180,140,255],[80,220,255],[184,118,26]
  ];

  var EXIT_DUR         = 1050;
  var ENTRY_DUR        = 1200;
  var CONTENT_FADE_IN  = 480;

  var SEED_BASE = 77391;
  function makeRand(seed) {
    var s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return ((s >>> 0) / 0xffffffff);
    };
  }

  function easeInCubic(t)   { return t * t * t; }
  function easeOutCubic(t)  { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuint(t)  { return 1 - Math.pow(1 - t, 5); }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeInOutQuad(t) { return t < .5 ? 2*t*t : -1+(4-2*t)*t; }

  function buildStrings(W, H) {
    var rand = makeRand(SEED_BASE);
    var N = 18;
    var strings = [];
    for (var i = 0; i < N; i++) {
      var col = PALETTE[i % PALETTE.length];
      strings.push({
        col:       col,
        freq1:     0.010 + rand() * 0.022,
        phase1:    rand() * Math.PI * 2,
        amp1:      28 + rand() * 55,
        freq2:     0.005 + rand() * 0.009,
        phase2:    rand() * Math.PI * 2,
        amp2:      14 + rand() * 30,
        freq3:     0.024 + rand() * 0.018,
        phase3:    rand() * Math.PI * 2,
        amp3:      6 + rand() * 12,
        driftRate: 0.6 + rand() * 1.1,
        restY:     H * 0.90 + (rand() - 0.5) * 30,
        spreadY:   H * (0.04 + 0.88 * (i / (N - 1))) + (rand() - 0.5) * 20,
        lineW:     1.0 + rand() * 1.4,
        alpha:     0.52 + rand() * 0.38,
        delay:     i * 32,
        glowAmt:   8 + rand() * 14
      });
    }
    return strings;
  }

  function getCanvas() {
    var cv = document.getElementById('_transitionCanvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = '_transitionCanvas';
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99998';
      document.body.appendChild(cv);
    }
    var dpr = window.devicePixelRatio || 1;
    cv.width  = Math.round(window.innerWidth  * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    return cv;
  }

  function drawFrame(ctx, strings, W, H, dpr, riseAmt, clock, darkAlpha, flashAlpha) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (darkAlpha > 0) {
      ctx.fillStyle = 'rgba(13,15,20,' + darkAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    var totalDelay = strings[strings.length - 1].delay;

    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      var c = s.col;

      var stringRise = Math.max(0, Math.min(1,
        (riseAmt - s.delay / (totalDelay + EXIT_DUR))
        / (EXIT_DUR / (totalDelay + EXIT_DUR))
      ));
      var easedRise = easeOutCubic(stringRise);
      var currentY  = s.restY + (s.spreadY - s.restY) * easedRise;
      var t = clock;
      var alpha = s.alpha * Math.min(1, stringRise * 4);
      if (alpha < 0.004) continue;

      // Glow pass
      ctx.beginPath();
      for (var x = 0; x <= W; x += 3) {
        var y = currentY
          + Math.sin(x * s.freq1 + s.phase1 + t * s.driftRate)        * s.amp1
          + Math.sin(x * s.freq2 + s.phase2 + t * s.driftRate * 0.61) * s.amp2
          + Math.sin(x * s.freq3 + s.phase3 + t * s.driftRate * 1.38) * s.amp3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.45)+')';
      ctx.lineWidth   = s.lineW + 3;
      ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.6)+')';
      ctx.shadowBlur  = s.glowAmt;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // Core pass
      ctx.beginPath();
      for (var x = 0; x <= W; x += 2) {
        var y = currentY
          + Math.sin(x * s.freq1 + s.phase1 + t * s.driftRate)        * s.amp1
          + Math.sin(x * s.freq2 + s.phase2 + t * s.driftRate * 0.61) * s.amp2
          + Math.sin(x * s.freq3 + s.phase3 + t * s.driftRate * 1.38) * s.amp3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
      ctx.lineWidth   = s.lineW;
      ctx.stroke();

      // Hot core
      if (alpha > 0.35 && s.glowAmt > 14) {
        ctx.beginPath();
        for (var x = 0; x <= W; x += 4) {
          var y = currentY
            + Math.sin(x * s.freq1 + s.phase1 + t * s.driftRate)        * s.amp1
            + Math.sin(x * s.freq2 + s.phase2 + t * s.driftRate * 0.61) * s.amp2
            + Math.sin(x * s.freq3 + s.phase3 + t * s.driftRate * 1.38) * s.amp3;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        var hc = [Math.min(255,c[0]+70),Math.min(255,c[1]+70),Math.min(255,c[2]+70)];
        ctx.strokeStyle = 'rgba('+hc[0]+','+hc[1]+','+hc[2]+','+(alpha*0.5)+')';
        ctx.lineWidth   = 0.4;
        ctx.stroke();
      }
    }

    // White flash on top
    if (flashAlpha > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + flashAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* EXIT */
  function runExit(href) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, lastTs = null, start = null;

    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.2s'; spill.style.opacity = '0'; }

    function step(ts) {
      if (!start) start = ts;
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;
      var t = Math.min(1, (ts - start) / EXIT_DUR);

      var riseAmt  = easeInOutSine(Math.min(1, t / 0.82));
      var darkAlpha  = easeInCubic(Math.min(1, t / 0.68)) * 0.88;
      var flashAlpha = t > 0.52 ? easeInOutQuad(Math.min(1, (t - 0.52) / 0.26)) * 0.72 : 0;

      drawFrame(ctx, strings, W, H, dpr, riseAmt, clock, darkAlpha, flashAlpha);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        sessionStorage.setItem('_txStrings', '1');
        window.location.href = href;
      }
    }
    requestAnimationFrame(step);
  }

  /* ENTRY */
  function runEntry() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, lastTs = null, start = null;
    var contentStarted = false;

    document.body.style.opacity = '0';
    document.body.style.transition = 'none';
    // Paint white flash immediately to match exit state
    drawFrame(ctx, strings, W, H, dpr, 1, 0, 0.85, 0.72);

    function step(ts) {
      if (!start) start = ts;
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;
      var t = Math.min(1, (ts - start) / ENTRY_DUR);

      var flashAlpha = Math.max(0, 1 - easeOutQuint(Math.min(1, t / 0.22))) * 0.72;
      var fallProgress = Math.max(0, Math.min(1, (t - 0.10) / 0.72));
      var riseAmt   = 1 - easeOutCubic(fallProgress);
      var darkAlpha = Math.max(0, 1 - easeOutCubic(Math.min(1, (t - 0.08) / 0.65))) * 0.88;

      if (!contentStarted && t >= 0.28) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + CONTENT_FADE_IN + 'ms ease';
        document.body.style.opacity = '1';
      }

      drawFrame(ctx, strings, W, H, dpr, riseAmt, clock, darkAlpha, flashAlpha);

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

  /* BOOT */
  function isInternal(href) {
    if (!href) return false;
    if (href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('//')) return false;
    if (href === '#' || href.startsWith('#')) return false;
    return true;
  }

  function boot() {
    if (sessionStorage.getItem('_txStrings')) {
      sessionStorage.removeItem('_txStrings');
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
