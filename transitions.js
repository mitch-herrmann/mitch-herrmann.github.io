/* ==========================================================================
   transitions.js — shared page transition engine
   Include on every page with <script src="transitions.js"></script>
   Works automatically: intercepts nav link clicks, runs exit animation,
   navigates, then runs entry animation on the new page.
   ========================================================================== */

(function() {

  var PALETTE = [
    [96,200,255],[160,100,255],[255,100,160],[60,220,180],[255,200,60],
    [100,255,200],[255,140,80],[180,140,255],[80,220,255],[184,118,26]
  ];

  var EXIT_DUR  = 900;   // ms — strings rise and fill screen
  var ENTRY_DUR = 1100;  // ms — strings fall back to bottom, content fades in
  var CONTENT_FADE_IN = 500; // ms — content fades in during entry

  /* ── Seeded PRNG so strings look the same on exit and entry ── */
  var SEED_BASE = 12345;
  function makeRand(seed) {
    var s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return ((s >>> 0) / 0xffffffff);
    };
  }

  /* ── Build string descriptors (same seed = same strings every time) ── */
  function buildStrings(W, H) {
    var rand = makeRand(SEED_BASE);
    var N = 18;
    var strings = [];
    for (var i = 0; i < N; i++) {
      var col = PALETTE[i % PALETTE.length];
      strings.push({
        col:        col,
        freq:       0.006 + rand() * 0.016,
        phase:      rand() * Math.PI * 2,
        amp:        3 + rand() * 7,
        baseY:      H * (0.30 + 0.60 * (i / (N - 1))),  // resting Y within spill zone
        lineW:      0.9 + rand() * 1.3,
        alpha:      0.45 + rand() * 0.45,
        delay:      i * 28,                               // stagger ms
        driftRate:  0.003 + rand() * 0.006
      });
    }
    return strings;
  }

  /* ── Easing functions ── */
  function easeInCubic(t)  { return t * t * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutSine(t){ return -(Math.cos(Math.PI * t) - 1) / 2; }

  /* ── Create or reuse the transition canvas ── */
  function getCanvas() {
    var cv = document.getElementById('_transitionCanvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = '_transitionCanvas';
      cv.style.cssText = [
        'position:fixed', 'inset:0', 'width:100%', 'height:100%',
        'pointer-events:none', 'z-index:99998',
        'opacity:1'
      ].join(';');
      document.body.appendChild(cv);
    }
    var dpr = window.devicePixelRatio || 1;
    cv.width  = Math.round(window.innerWidth  * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    return cv;
  }

  /* ── Draw one frame of strings at a given riseAmt (0=at bottom, 1=full screen) ── */
  function drawStrings(ctx, strings, W, H, dpr, riseAmt, clock, pageAlpha) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Page dim overlay
    if (pageAlpha > 0) {
      ctx.fillStyle = 'rgba(13,15,20,' + pageAlpha + ')';
      ctx.fillRect(0, 0, W, H);
    }

    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      var c = s.col;

      // Each string has its own rise progress based on delay
      var stringRise = Math.max(0, Math.min(1,
        (riseAmt * (EXIT_DUR + strings[strings.length-1].delay) - s.delay)
        / EXIT_DUR
      ));

      // Y: resting position is near bottom (H - spill zone), rises to distribute across screen
      var restY  = H - 45 + s.baseY * 0;  // all start at bottom
      var targetY = s.baseY;               // spread to their natural height
      // Actually: rest at bottom cluster, rise to fill full height
      var bottomCluster = H * 0.88 + (i / strings.length - 0.5) * 40;
      var spreadY = H * (0.05 + 0.88 * (i / (strings.length - 1)));
      var currentY = bottomCluster + (spreadY - bottomCluster) * easeOutCubic(stringRise);

      var drift = clock * s.driftRate;
      var alpha = s.alpha * Math.min(1, stringRise * 3); // fade in quickly

      // Glow pass
      ctx.beginPath();
      for (var x = 0; x <= W; x += 3) {
        var y = currentY + Math.sin(x * s.freq + s.phase + drift) * s.amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.5)+')';
      ctx.lineWidth   = s.lineW + 2;
      ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.65)+')';
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // Core pass
      ctx.beginPath();
      for (var x = 0; x <= W; x += 2) {
        var y = currentY + Math.sin(x * s.freq + s.phase + drift) * s.amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
      ctx.lineWidth   = s.lineW;
      ctx.stroke();
    }
  }

  /* ================================================================
     EXIT ANIMATION — strings rise up from bottom, page dims out
     Called when user clicks an internal nav link.
     Calls navigate(href) when complete.
  ================================================================ */
  function runExit(href) {
    var W   = window.innerWidth;
    var H   = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv  = getCanvas();
    var ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);

    // Hide the neon spill canvas so it doesn't fight with the transition
    var spill = document.getElementById('neonSpill');
    if (spill) spill.style.opacity = '0';

    var start = null;
    var clock = 0;
    var lastTs = null;

    function step(ts) {
      if (!start) start = ts;
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;

      var elapsed = ts - start;
      var t = Math.min(1, elapsed / EXIT_DUR);
      var riseAmt = easeInOutSine(t);
      var pageAlpha = easeInCubic(t) * 0.92; // page goes nearly black

      drawStrings(ctx, strings, W, H, dpr, riseAmt, clock, pageAlpha);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Brief hold at full coverage, then navigate
        setTimeout(function() {
          sessionStorage.setItem('_txStrings', JSON.stringify({
            seed: SEED_BASE,
            ts: Date.now()
          }));
          window.location.href = href;
        }, 80);
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     ENTRY ANIMATION — strings fall back down, content fades in
     Called automatically on page load if _txStrings is set.
  ================================================================ */
  function runEntry() {
    var W   = window.innerWidth;
    var H   = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv  = getCanvas();
    var ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);

    // Start with content invisible
    var contentEl = document.body;
    contentEl.style.transition = 'none';
    contentEl.style.opacity = '0';

    // Draw the full-coverage state immediately so there's no flash
    drawStrings(ctx, strings, W, H, dpr, 1, 0, 0.92);

    // Then on next frame start the fall
    var start = null;
    var clock = 0;
    var lastTs = null;

    // Fade content in partway through
    var contentFaded = false;

    function step(ts) {
      if (!start) {
        start = ts;
        // Begin fading content in after a short delay
        setTimeout(function() {
          contentEl.style.transition = 'opacity ' + CONTENT_FADE_IN + 'ms ease';
          contentEl.style.opacity = '1';
          contentFaded = true;
        }, ENTRY_DUR * 0.35);
      }
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;

      var elapsed = ts - start;
      var t = Math.min(1, elapsed / ENTRY_DUR);

      // riseAmt goes from 1 → 0 (strings fall back to bottom)
      var fallAmt = easeOutCubic(t);
      var riseAmt = 1 - fallAmt;

      // Page overlay fades out in sync with strings settling
      var pageAlpha = (1 - easeOutCubic(Math.min(1, t * 1.4))) * 0.92;

      drawStrings(ctx, strings, W, H, dpr, riseAmt, clock, pageAlpha);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // All done — remove canvas
        ctx.clearRect(0, 0, W * dpr, H * dpr);
        cv.remove();
        // Ensure content is fully visible
        contentEl.style.transition = '';
        contentEl.style.opacity = '1';
        // Re-show neon spill if present
        var spill = document.getElementById('neonSpill');
        if (spill) spill.style.opacity = '1';
      }
    }

    requestAnimationFrame(step);
  }

  /* ================================================================
     INTERCEPT NAV CLICKS — only internal same-origin .html links
  ================================================================ */
  function isInternalLink(href) {
    if (!href) return false;
    if (href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('//')) return false;
    if (href === '#' || href.startsWith('#')) return false;
    return true;
  }

  function attachInterceptors() {
    document.addEventListener('click', function(e) {
      // Find closest anchor
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el) return;

      var href = el.getAttribute('href');
      if (!isInternalLink(href)) return;

      // Same page — do nothing
      var currentPage = window.location.pathname.split('/').pop() || 'index.html';
      var targetPage  = href.split('/').pop().split('?')[0].split('#')[0];
      if (currentPage === targetPage) return;

      e.preventDefault();
      runExit(href);
    }, true);
  }

  /* ================================================================
     BOOT — run entry if we just transitioned in, then attach interceptors
  ================================================================ */
  function boot() {
    var tx = sessionStorage.getItem('_txStrings');
    if (tx) {
      sessionStorage.removeItem('_txStrings');
      // Small rAF delay to let the page render its initial state
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          runEntry();
        });
      });
    }
    attachInterceptors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
