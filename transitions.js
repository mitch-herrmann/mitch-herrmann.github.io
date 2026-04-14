/* ==========================================================================
   transitions.js — dual-mode page transition engine
   Transition style is set in content.json → site.transition_style:
     "slingshot"  — strings tension/release like a rubber band
     "prism"      — chromatic lens-flare burst
   Falls back to "slingshot" if not set.
   ========================================================================== */
(function() {

  var PAL = [
    [96,200,255],[160,100,255],[255,100,160],[60,220,180],[255,200,60],
    [100,255,200],[255,140,80],[180,140,255],[80,220,255],[184,118,26]
  ];

  /* Read style — window._txStyle is set by the page's content.json fetch.
     If it hasn't resolved yet when a click fires, we read it at that moment. */
  function getStyle() {
    return (window._txStyle || 'slingshot');
  }

  /* ── Easing ── */
  function eo3(t)  { return 1 - Math.pow(1 - t, 3); }
  function eo5(t)  { return 1 - Math.pow(1 - t, 5); }
  function ei2(t)  { return t * t; }
  function ei3(t)  { return t * t * t; }
  function eios(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a,b,t)  { return a + (b - a) * t; }

  /* ── Canvas ── */
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

  function clearCanvas(cv) {
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    cv.remove();
  }

  /* ── Draw neon spill strings (shared) ── */
  function drawSpill(ctx, W, H, alpha, clock) {
    for (var i = 0; i < 10; i++) {
      var c = PAL[i];
      var baseY = H * (0.80 + 0.16 * (i / 9));
      var freq  = 0.016 + i * 0.003;
      var ph    = i * 0.9;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 2) {
        var y = baseY + Math.sin(x * freq + ph + clock * 0.3) * (4 + i * 0.5);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(0.55 * alpha)+')';
      ctx.lineWidth   = 1.1;
      ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(0.4 * alpha)+')';
      ctx.shadowBlur  = 5;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }
  }

  /* ================================================================
     SLINGSHOT MODE
     Exit:  windup (strings bow left, tension builds) → release (snap right)
     Entry: strings arrive from right, settle into place
  ================================================================ */

  var SLING_EXIT  = 950;
  var SLING_HOLD  = 60;
  var SLING_ENTRY = 700;
  var SLING_CONTENT_IN = 380;

  function slingshotExit(href, cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;

    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.15s'; spill.style.opacity = '0'; }

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;
      var t = clamp((ts - start) / SLING_EXIT, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* dark overlay builds through windup, stays through release */
      var dark = eios(t) * 0.82;
      ctx.fillStyle = 'rgba(13,15,20,' + dark.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);

      if (t < 0.58) {
        /* ── WINDUP: strings bow left, amplitude tightens ── */
        var wt = clamp(t / 0.58, 0, 1);
        var windEased = eios(wt);
        for (var i = 0; i < 10; i++) {
          var c = PAL[i];
          var baseY = H * (0.80 + 0.16 * (i / 9));
          var freq  = 0.016 + i * 0.003;
          var ph    = i * 0.9;
          var energy = windEased;
          ctx.beginPath();
          for (var x = 0; x <= W; x += 2) {
            /* Bow: arch left — parabolic pull peaking at centre */
            var u   = x / W;
            var bow = Math.sin(u * Math.PI); /* 0 at edges, 1 at centre */
            var compression = windEased * W * 0.13 * bow;
            /* Amplitude tightens as tension builds */
            var tensionAmp = 1 + windEased * 2.2;
            var wave = Math.sin(x * freq + ph + clock * 0.35) * (4 + i * 0.5);
            var px = x - compression;
            var py = baseY + wave * tensionAmp;
            x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          var alpha = 0.55 + energy * 0.38;
          ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
          ctx.lineWidth   = 1.0 + energy * 0.7;
          ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(energy * 0.55)+')';
          ctx.shadowBlur  = energy * 14;
          ctx.stroke();
          ctx.shadowBlur  = 0;
        }
        /* energy pulse brightening as tension peaks */
        if (wt > 0.7) {
          var ep = (wt - 0.7) / 0.3;
          ctx.fillStyle = 'rgba(255,255,255,' + (ep * 0.05) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      } else {
        /* ── RELEASE: strings snap to the right ── */
        var rt = clamp((t - 0.58) / 0.42, 0, 1);
        var releaseEased = eo5(rt);
        for (var i = 0; i < 10; i++) {
          var c = PAL[i];
          var baseY = H * (0.80 + 0.16 * (i / 9));
          var freq  = 0.016 + i * 0.003;
          var ph    = i * 0.9;
          /* Slingshot: right end flies first, left anchors briefly */
          /* Draw multiple ghost trails for motion blur effect */
          var TRAILS = 4;
          for (var tr = TRAILS - 1; tr >= 0; tr--) {
            var lag = tr * 0.055;
            var trailT = clamp(releaseEased - lag, 0, 1);
            var trailAlpha = (1 - rt * 0.65) * (1 - tr * 0.22);
            if (trailAlpha < 0.01) continue;
            ctx.beginPath();
            for (var x = 0; x <= W; x += 2) {
              var u = x / W;
              /* right side (u→1) displaced most — parabolic */
              var pull  = Math.pow(u, 0.65);
              var shift = trailT * W * 1.25 * pull;
              /* brief amplitude surge on release then collapses */
              var surge = Math.sin(rt * Math.PI) * 0.9;
              var wave  = Math.sin(x * freq + ph + clock * 0.35) * (4 + i * 0.5);
              var px = x + shift;
              var py = baseY + wave * (1 + surge) - pull * rt * 16;
              x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+trailAlpha+')';
            ctx.lineWidth   = 1.1 - tr * 0.2;
            ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(trailAlpha * 0.5)+')';
            ctx.shadowBlur  = 8 - tr * 1.5;
            ctx.stroke();
            ctx.shadowBlur  = 0;
          }
        }
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(function() {
          sessionStorage.setItem('_tx', '1');
          sessionStorage.setItem('_txReturning', '1');
          window.location.href = href;
        }, SLING_HOLD);
      }
    }
    requestAnimationFrame(step);
  }

  function slingshotEntry(cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;
    var contentStarted = false;
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';

    /* paint dark immediately */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(13,15,20,0.82)';
    ctx.fillRect(0, 0, W, H);

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;
      var t = clamp((ts - start) / SLING_ENTRY, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* dark overlay lifts */
      var dark = (1 - eo3(t)) * 0.82;
      if (dark > 0.005) {
        ctx.fillStyle = 'rgba(13,15,20,' + dark.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* strings arrive from right, settle with slight overshoot */
      for (var i = 0; i < 10; i++) {
        var c = PAL[i];
        var baseY = H * (0.80 + 0.16 * (i / 9));
        var freq  = 0.016 + i * 0.003;
        var ph    = i * 0.9;
        var localT = clamp((t - i * 0.025) / (1 - i * 0.025 * 0.5), 0, 1);
        /* overshoot spring: goes slightly past then bounces back */
        var spring = eo5(localT);
        /* slight overshoot on arrival */
        var overshoot = Math.sin(localT * Math.PI * 1.8) * 0.04 * (1 - localT);
        var shift = (1 - spring - overshoot) * W * 0.55;
        ctx.beginPath();
        for (var x = 0; x <= W; x += 2) {
          var py = baseY + Math.sin(x * freq + ph + clock * 0.35) * (4 + i * 0.5);
          var px = x + shift;
          x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(0.55 * eo3(localT))+')';
        ctx.lineWidth   = 1.1;
        ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(0.35 * eo3(localT))+')';
        ctx.shadowBlur  = 5;
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      if (!contentStarted && t >= 0.28) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + SLING_CONTENT_IN + 'ms ease';
        document.body.style.opacity = '1';
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        clearCanvas(cv);
        document.body.style.transition = '';
        document.body.style.opacity = '1';
        var spill = document.getElementById('neonSpill');
        if (spill) { spill.style.transition = 'opacity 0.4s'; spill.style.opacity = '1'; }
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     PRISM MODE
     Exit:  chromatic beams splay from centre, page fractures to white
     Entry: beams reconverge, page assembles from colour
  ================================================================ */

  var PRISM_EXIT    = 1100;
  var PRISM_HOLD    = 60;
  var PRISM_ENTRY   = 1050;
  var PRISM_CONTENT_IN = 450;

  /* Spectral rays — angles and colours tuned to match the reference photo */
  var RAYS = [
    { angle: -0.10, col: [255, 75,  75],  w: 30, len: 1.0  },
    { angle:  0.04, col: [255, 155, 40],  w: 24, len: 0.92 },
    { angle:  0.18, col: [240, 230, 45],  w: 20, len: 0.98 },
    { angle:  0.32, col: [55,  210, 110], w: 22, len: 0.88 },
    { angle:  0.48, col: [50,  175, 255], w: 28, len: 1.0  },
    { angle:  0.63, col: [90,  70,  255], w: 24, len: 0.85 },
    { angle:  0.78, col: [195, 70,  255], w: 20, len: 0.90 },
    { angle: -0.25, col: [255, 95,  155], w: 18, len: 0.82 },
    { angle: -0.42, col: [65,  235, 195], w: 16, len: 0.88 },
    { angle:  0.92, col: [255, 200, 80],  w: 16, len: 0.80 },
  ];

  function drawPrismRays(ctx, W, H, t, direction) {
    /* direction: 'out' = expanding, 'in' = converging */
    var ox = W * 0.50;
    var oy = H * 0.44;
    var maxLen = Math.sqrt(W * W + H * H);

    RAYS.forEach(function(r, i) {
      var delay = i * 0.038;
      var rt = clamp((t - delay) / (1 - delay * RAYS.length * 0.25), 0, 1);
      if (rt <= 0) return;

      var expand = direction === 'out' ? eo3(rt) : 1 - eo5(rt);
      var beamLen = expand * maxLen * r.len;
      var beamW   = r.w * (0.25 + expand * 0.75);
      var alpha   = direction === 'out'
        ? expand * 0.82
        : (1 - expand) * 0.78;
      if (alpha < 0.008) return;

      var ang = r.angle * Math.PI * 2;
      var ax  = Math.cos(ang);
      var ay  = Math.sin(ang);
      var ex  = ox + ax * beamLen;
      var ey  = oy + ay * beamLen;
      var perp = { x: -ay, y: ax };

      /* Wide soft cone */
      var hw = beamW * 3.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex + perp.x * hw, ey + perp.y * hw);
      ctx.lineTo(ex - perp.x * hw, ey - perp.y * hw);
      ctx.closePath();
      ctx.fillStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.16)+')';
      ctx.fill();

      /* Medium glow streak */
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex + perp.x * beamW, ey + perp.y * beamW);
      ctx.lineTo(ex - perp.x * beamW, ey - perp.y * beamW);
      ctx.closePath();
      ctx.fillStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.35)+')';
      ctx.fill();

      /* Sharp core line */
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+alpha+')';
      ctx.lineWidth   = Math.max(0.8, beamW * 0.3);
      ctx.shadowColor = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.8)+')';
      ctx.shadowBlur  = beamW * 0.9;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      /* Small secondary flare spots (like the reference photo) */
      if (expand > 0.3) {
        var flareT = (expand - 0.3) / 0.7;
        var fd  = beamLen * (0.35 + i * 0.04);
        var fx  = ox + ax * fd;
        var fy  = oy + ay * fd;
        var fr  = beamW * 0.6 * flareT;
        var fg  = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.5);
        fg.addColorStop(0, 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.9)+')');
        fg.addColorStop(0.4, 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.4)+')');
        fg.addColorStop(1, 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+',0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fx, fy, fr * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    /* Bright white core at origin */
    if (t > 0.05) {
      var cp = direction === 'out'
        ? Math.min(1, t * 3.5)
        : Math.max(0, 1 - t * 2.8);
      var cg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 22 + t * 35);
      cg.addColorStop(0,   'rgba(255,255,255,' + (cp * 0.96) + ')');
      cg.addColorStop(0.35,'rgba(200,225,255,' + (cp * 0.55) + ')');
      cg.addColorStop(1,   'rgba(96,200,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(ox, oy, 22 + t * 35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function prismExit(href, cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;

    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.15s'; spill.style.opacity = '0'; }

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;
      var t = clamp((ts - start) / PRISM_EXIT, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, W, H);

      /* Spill dims as beams emerge */
      var spillAlpha = Math.max(0, 1 - t * 2.2);
      if (spillAlpha > 0.02) drawSpill(ctx, W, H, spillAlpha, clock);

      /* Dark overlay */
      var dark = ei2(clamp(t / 0.55, 0, 1)) * 0.78;
      if (dark > 0.01) {
        ctx.fillStyle = 'rgba(13,15,20,' + dark.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* Beams splay out — start at 20% through */
      if (t > 0.14) {
        drawPrismRays(ctx, W, H, clamp((t - 0.14) / 0.86, 0, 1), 'out');
      }

      /* White blowout in final third */
      if (t > 0.66) {
        var wt = clamp((t - 0.66) / 0.34, 0, 1);
        var ox = W * 0.50, oy = H * 0.44;
        var wg = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(W, H) * 1.5 * eo3(wt));
        wg.addColorStop(0,   'rgba(255,255,255,' + Math.min(0.96, wt * 1.4) + ')');
        wg.addColorStop(0.55,'rgba(255,255,255,' + Math.min(0.92, wt * 0.9) + ')');
        wg.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, W, H);
        /* flat white at peak */
        if (wt > 0.75) {
          ctx.fillStyle = 'rgba(255,255,255,' + clamp((wt - 0.75) / 0.25, 0, 1) * 0.94 + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(function() {
          sessionStorage.setItem('_tx', '1');
          sessionStorage.setItem('_txReturning', '1');
          window.location.href = href;
        }, PRISM_HOLD);
      }
    }
    requestAnimationFrame(step);
  }

  function prismEntry(cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;
    var contentStarted = false;
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';

    /* paint white immediately */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    function step(ts) {
      if (!start) start = ts;
      if (last) clock += (ts - last) / 1000;
      last = ts;
      var t = clamp((ts - start) / PRISM_ENTRY, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, W, H);

      /* White fades out quickly */
      var whiteAlpha = Math.max(0, 1 - eo5(clamp(t / 0.26, 0, 1)));
      if (whiteAlpha > 0.005) {
        ctx.fillStyle = 'rgba(255,255,255,' + whiteAlpha + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* Beams converge inward (0.06 → 0.72) */
      if (t > 0.06) {
        drawPrismRays(ctx, W, H, clamp((t - 0.06) / 0.66, 0, 1), 'in');
      }

      /* Dark overlay lifts (0.20 → 0.80) */
      var dark = Math.max(0, 1 - eo3(clamp((t - 0.20) / 0.60, 0, 1))) * 0.78;
      if (dark > 0.01) {
        ctx.fillStyle = 'rgba(13,15,20,' + dark.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* Spill re-emerges (0.55 → 1.0) */
      if (t > 0.55) {
        drawSpill(ctx, W, H, eo3(clamp((t - 0.55) / 0.45, 0, 1)), clock);
      }

      if (!contentStarted && t >= 0.32) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + PRISM_CONTENT_IN + 'ms ease';
        document.body.style.opacity = '1';
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        clearCanvas(cv);
        document.body.style.transition = '';
        document.body.style.opacity = '1';
        var spill = document.getElementById('neonSpill');
        if (spill) { spill.style.transition = 'opacity 0.4s'; spill.style.opacity = '1'; }
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     ROUTER — picks mode and runs exit/entry
  ================================================================ */
  function runExit(href) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas();
    var ctx = cv.getContext('2d');
    var style = getStyle();
    if (style === 'prism') {
      prismExit(href, cv, ctx, W, H, dpr);
    } else {
      slingshotExit(href, cv, ctx, W, H, dpr);
    }
  }

  function runEntry() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas();
    var ctx = cv.getContext('2d');
    var style = getStyle();
    if (style === 'prism') {
      prismEntry(cv, ctx, W, H, dpr);
    } else {
      slingshotEntry(cv, ctx, W, H, dpr);
    }
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
