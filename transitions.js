/* ==========================================================================
   transitions.js — vortex page transition engine
   Include on every page with <script src="transitions.js"></script>
   ========================================================================== */

(function() {

  var PALETTE = [
    [96,200,255],[160,100,255],[255,100,160],[60,220,180],[255,200,60],
    [100,255,200],[255,140,80],[180,140,255],[80,220,255],[184,118,26]
  ];

  /* ── Timing ──────────────────────────────────────────────────────────────
     EXIT  (total ~1600ms):
       0.00 – 0.45  strings rise from bottom spill zone toward screen centre
       0.38 – 0.80  strings curl into tight spinning spool at centre
       0.72 – 1.00  spool collapses to a point, white flash blooms
     ENTRY (total ~1500ms):
       0.00 – 0.20  white flash fades
       0.12 – 0.55  strings unspool outward from centre
       0.40 – 1.00  strings arc downward and settle back to bottom
  ─────────────────────────────────────────────────────────────────────── */
  var EXIT_DUR  = 1600;
  var ENTRY_DUR = 1500;
  var CONTENT_FADE = 500;

  /* ── Seeded PRNG ── */
  var SEED = 77391;
  function makeRand(seed) {
    var s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return ((s >>> 0) / 0xffffffff);
    };
  }

  /* ── Easing ── */
  function easeInQuad(t)    { return t * t; }
  function easeInCubic(t)   { return t * t * t; }
  function easeOutCubic(t)  { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuint(t)  { return 1 - Math.pow(1 - t, 5); }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeInOutCubic(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function lerp(a, b, t)    { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ── Build string descriptors ──────────────────────────────────────────
     Each string has:
       restY      — its Y position in the bottom spill (where it starts/ends)
       spoolAngle — which spoke of the spool wheel it belongs to
       spoolR     — radius from centre when fully spooled
       waveParams — shape while rising (complex multi-harmonic)
  ─────────────────────────────────────────────────────────────────────── */
  function buildStrings(W, H) {
    var rand = makeRand(SEED);
    var N = 18;
    var cx = W * 0.5;
    var cy = H * 0.48;
    var strings = [];

    for (var i = 0; i < N; i++) {
      var col = PALETTE[i % PALETTE.length];
      /* resting Y — packed near bottom like the neon spill */
      var restY = H * (0.88 + 0.09 * (i / (N - 1))) + (rand() - 0.5) * 14;

      /* spool spoke: strings spread evenly around the wheel */
      var spoolAngle = (i / N) * Math.PI * 2 - Math.PI * 0.5;  /* start at top */
      /* each string coils at a slightly different radius */
      var spoolR = 28 + (i % 3) * 12 + rand() * 10;
      /* how many times it winds around the spool (0.6 – 1.4 turns) */
      var winds = 0.65 + rand() * 0.75;

      /* wave shape while rising — three overlapping harmonics */
      strings.push({
        col:        col,
        restY:      restY,
        cx:         cx,
        cy:         cy,
        spoolAngle: spoolAngle,
        spoolR:     spoolR,
        winds:      winds,
        /* rise stagger: back strings rise first */
        riseDelay:  i * 0.018,
        /* wave shape */
        freq1:  0.012 + rand() * 0.018,
        phase1: rand() * Math.PI * 2,
        amp1:   22 + rand() * 40,
        freq2:  0.005 + rand() * 0.008,
        phase2: rand() * Math.PI * 2,
        amp2:   12 + rand() * 22,
        freq3:  0.026 + rand() * 0.016,
        phase3: rand() * Math.PI * 2,
        amp3:   5 + rand() * 10,
        driftRate: 0.55 + rand() * 0.9,
        lineW:  1.0 + rand() * 1.3,
        alpha:  0.50 + rand() * 0.40,
        glowAmt: 8 + rand() * 12
      });
    }
    return strings;
  }

  /* ── Canvas setup ── */
  function getCanvas() {
    var cv = document.getElementById('_txCanvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = '_txCanvas';
      cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99998';
      document.body.appendChild(cv);
    }
    var dpr = window.devicePixelRatio || 1;
    cv.width  = Math.round(window.innerWidth  * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    return cv;
  }

  /* ── Core draw function ────────────────────────────────────────────────
     riseT:   0→1  strings lifted from bottom to mid-screen (free-flowing wave)
     spoolT:  0→1  strings curling into the spool wheel
     flashT:  0→1  white flash expanding from spool centre
     unspoolT:0→1  strings radiating back out from centre
     settleT: 0→1  strings arcing downward and landing at bottom
     clock:   elapsed seconds (drives wave drift)
  ─────────────────────────────────────────────────────────────────────── */
  function drawFrame(ctx, strings, W, H, dpr, riseT, spoolT, flashT, unspoolT, settleT, clock) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* dark background overlay — builds during rise/spool, clears during settle */
    var darkA = 0;
    if (settleT > 0) {
      darkA = clamp(1 - easeOutCubic(settleT), 0, 1) * 0.88;
    } else {
      darkA = clamp(easeInQuad(Math.max(riseT, spoolT)), 0, 1) * 0.88;
    }
    if (darkA > 0.005) {
      ctx.fillStyle = 'rgba(13,15,20,' + darkA.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    var cx = W * 0.5;
    var cy = H * 0.48;

    /* spinning angle of the whole spool wheel */
    var wheelSpin = spoolT * Math.PI * 3.5;  /* 1.75 full rotations while spooling */

    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      var c = s.col;

      /* ── per-string rise progress (staggered) ── */
      var localRise = clamp((riseT - s.riseDelay) / (1 - s.riseDelay * 0.5), 0, 1);
      var easedRise = easeInOutSine(localRise);

      /* ── Alpha ── */
      var alpha = s.alpha;
      if (settleT > 0) {
        alpha *= clamp(0.3 + settleT * 0.7, 0, 1);  /* fade back in as strings settle */
      } else if (spoolT > 0.7) {
        alpha *= clamp(1 - (spoolT - 0.7) / 0.3, 0.15, 1);  /* dim slightly into flash */
      } else {
        alpha *= clamp(localRise * 3, 0, 1);
      }
      if (alpha < 0.005) continue;

      ctx.beginPath();

      if (settleT > 0 || unspoolT > 0) {
        /* ── UNSPOOL + SETTLE phase ─────────────────────────────────────
           t=0: string is a tight coil at spool position
           t≈0.4: string has fully extended across screen
           t=1: string has curved back down to restY
        ─────────────────────────────────────────────────────────────── */
        var uT = unspoolT > 0 ? unspoolT : 0;
        var sT = settleT  > 0 ? settleT  : 0;
        var combinedT = clamp(uT + sT * 0.6, 0, 1);

        var steps = 80;
        for (var k = 0; k <= steps; k++) {
          var u = k / steps;   /* 0 = left edge, 1 = right edge */
          var x = u * W;

          /* spool start position for this string */
          var spoolX = cx + Math.cos(s.spoolAngle + wheelSpin) * s.spoolR;
          var spoolY = cy + Math.sin(s.spoolAngle + wheelSpin) * s.spoolR;

          /* final resting position */
          var finalY = s.restY
            + Math.sin(x * s.freq1 + s.phase1) * s.amp1 * 0.12  /* very gentle wave at rest */
            + Math.sin(x * s.freq2 + s.phase2) * s.amp2 * 0.08;

          /* unspool: string fans out from spool point to full width */
          var extendT = clamp(uT * 2.2, 0, 1);
          var extendEased = easeOutCubic(extendT);

          /* while extending, the string is still curvy and lively */
          var waveY = s.restY * 0.3 + H * 0.35   /* mid-screen Y while extended */
            + Math.sin(x * s.freq1 + s.phase1 + clock * s.driftRate) * s.amp1 * (1 - sT)
            + Math.sin(x * s.freq2 + s.phase2 + clock * s.driftRate * 0.61) * s.amp2 * (1 - sT)
            + Math.sin(x * s.freq3 + s.phase3 + clock * s.driftRate * 1.38) * s.amp3 * (1 - sT);

          /* settle: arc from mid-screen down to restY */
          var settleEased = easeInOutCubic(clamp(sT * 1.6 - s.riseDelay * 0.8, 0, 1));
          var targetY = lerp(waveY, finalY, settleEased);

          /* blend: starts at spool point, fans to full width */
          var px = lerp(spoolX, x, extendEased);
          var py = lerp(spoolY, targetY, extendEased);

          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }

      } else if (spoolT > 0) {
        /* ── SPOOL phase ────────────────────────────────────────────────
           String transitions from free-flowing wave → tight spiral arm
           at spoolT=0 the string still looks like a wave
           at spoolT=1 it's a tight coil emanating from the spool centre
        ─────────────────────────────────────────────────────────────── */
        var steps = 80;
        for (var k = 0; k <= steps; k++) {
          var u = k / steps;
          var x = u * W;

          /* free wave position (same formula as rise phase) */
          var midY = s.restY * 0.25 + H * 0.38;
          var freeY = midY
            + Math.sin(x * s.freq1 + s.phase1 + clock * s.driftRate) * s.amp1
            + Math.sin(x * s.freq2 + s.phase2 + clock * s.driftRate * 0.61) * s.amp2
            + Math.sin(x * s.freq3 + s.phase3 + clock * s.driftRate * 1.38) * s.amp3;
          var freeX = x;

          /* spiral arm target: this point on the string maps to a position
             on a spiral that winds into the spool centre */
          var spoolEased = easeInOutCubic(spoolT);
          /* parametric spiral: angle and radius both shrink toward centre */
          var spiralAngle = s.spoolAngle + wheelSpin + u * Math.PI * 2 * s.winds * (1 - spoolEased * 0.5);
          var spiralR     = s.spoolR * (0.15 + 0.85 * (1 - u)) * (1 - spoolEased * 0.7) + s.spoolR * 0.15;
          var spiralX = cx + Math.cos(spiralAngle) * spiralR;
          var spiralY = cy + Math.sin(spiralAngle) * spiralR;

          var px = lerp(freeX, spiralX, spoolEased);
          var py = lerp(freeY, spiralY, spoolEased);

          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }

      } else if (riseT > 0 && localRise > 0) {
        /* ── RISE phase ─────────────────────────────────────────────────
           String lifts from restY up to a mid-screen flowing position
        ─────────────────────────────────────────────────────────────── */
        var midY = s.restY * 0.25 + H * 0.38;  /* target Y when fully risen */
        var steps = 60;
        for (var k = 0; k <= steps; k++) {
          var u = k / steps;
          var x = u * W;
          var waveOffset
            = Math.sin(x * s.freq1 + s.phase1 + clock * s.driftRate)        * s.amp1 * easedRise
            + Math.sin(x * s.freq2 + s.phase2 + clock * s.driftRate * 0.61) * s.amp2 * easedRise
            + Math.sin(x * s.freq3 + s.phase3 + clock * s.driftRate * 1.38) * s.amp3 * easedRise;

          var currentY = lerp(s.restY, midY, easedRise) + waveOffset;
          k === 0 ? ctx.moveTo(x, currentY) : ctx.lineTo(x, currentY);
        }
      } else {
        continue;
      }

      /* ── Stroke: glow + core ── */
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.45)+')';
      ctx.lineWidth   = s.lineW + 2.5;
      ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.65)+')';
      ctx.shadowBlur  = s.glowAmt;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
      ctx.lineWidth   = s.lineW;
      ctx.stroke();
    }

    /* ── Spool centre glow (grows as strings converge) ── */
    if (spoolT > 0.2 && flashT < 0.05) {
      var glowStrength = easeInQuad(clamp((spoolT - 0.2) / 0.8, 0, 1));
      var glowR = 8 + glowStrength * 22;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      g.addColorStop(0,   'rgba(255,255,255,' + (glowStrength * 0.9) + ')');
      g.addColorStop(0.4, 'rgba(160,220,255,' + (glowStrength * 0.5) + ')');
      g.addColorStop(1,   'rgba(96,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ── White flash ── */
    if (flashT > 0) {
      /* flash blooms from centre outward */
      var flashR = flashT * Math.max(W, H) * 1.6;
      var peakAlpha = 0.95;
      var edgeAlpha = clamp(flashT * 2.5, 0, peakAlpha);
      var g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
      g2.addColorStop(0,   'rgba(255,255,255,' + peakAlpha + ')');
      g2.addColorStop(0.35,'rgba(255,255,255,' + edgeAlpha + ')');
      g2.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);

      /* flat fill once flash covers everything */
      if (flashT > 0.55) {
        var flatA = clamp((flashT - 0.55) / 0.45, 0, 1) * peakAlpha;
        ctx.fillStyle = 'rgba(255,255,255,' + flatA + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* ── Entry: white dissolve at start ── */
    if (unspoolT > 0 && flashT === 0) {
      var fadeOut = clamp(1 - easeOutQuint(unspoolT / 0.22), 0, 1);
      if (fadeOut > 0.005) {
        ctx.fillStyle = 'rgba(255,255,255,' + (fadeOut * 0.92) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  /* ================================================================
     EXIT ANIMATION
  ================================================================ */
  function runExit(href) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, lastTs = null, start = null;

    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.15s'; spill.style.opacity = '0'; }

    function step(ts) {
      if (!start) start = ts;
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;
      var t = Math.min(1, (ts - start) / EXIT_DUR);

      /* rise:   0.00 → 0.48 */
      var riseT  = clamp(t / 0.48, 0, 1);
      /* spool:  0.35 → 0.82 */
      var spoolT = clamp((t - 0.35) / 0.47, 0, 1);
      /* flash:  0.78 → 1.00 */
      var flashT = clamp((t - 0.78) / 0.22, 0, 1);

      drawFrame(ctx, strings, W, H, dpr, riseT, spoolT, flashT, 0, 0, clock);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        sessionStorage.setItem('_tx', '1');
        window.location.href = href;
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     ENTRY ANIMATION
  ================================================================ */
  function runEntry() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas(), ctx = cv.getContext('2d');
    var strings = buildStrings(W, H);
    var clock = 0, lastTs = null, start = null;
    var contentStarted = false;

    document.body.style.opacity = '0';
    document.body.style.transition = 'none';

    /* paint white immediately — matches end of exit */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    function step(ts) {
      if (!start) start = ts;
      if (lastTs) clock += (ts - lastTs) / 1000;
      lastTs = ts;
      var t = Math.min(1, (ts - start) / ENTRY_DUR);

      /* unspool:  0.00 → 0.52 */
      var unspoolT = clamp(t / 0.52, 0, 1);
      /* settle:   0.38 → 1.00 */
      var settleT  = clamp((t - 0.38) / 0.62, 0, 1);

      drawFrame(ctx, strings, W, H, dpr, 0, 0, 0, unspoolT, settleT, clock);

      /* fade in page content partway through */
      if (!contentStarted && t >= 0.30) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + CONTENT_FADE + 'ms ease';
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
        if (spill) { spill.style.transition = 'opacity 0.5s'; spill.style.opacity = '1'; }
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     INTERCEPT NAV CLICKS
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
