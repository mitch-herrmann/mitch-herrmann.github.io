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

  function getStyle() { return (window._txStyle || 'slingshot'); }

  /* ── Easing ── */
  function eo3(t)  { return 1 - Math.pow(1 - t, 3); }
  function eo5(t)  { return 1 - Math.pow(1 - t, 5); }
  function ei2(t)  { return t * t; }
  function eios(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }

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

  /* ── Read live spill descriptors exposed by the page's neonSpill ──
     baseY values in the spill are relative to the 90px spill canvas.
     We remap them to viewport coordinates for the transition canvas.   */
  function getLiveStrings(H) {
    var raw    = window._spillStrings;
    var spillH = window._spillH || 90;
    if (!raw || !raw.length) return null;
    return raw.map(function(s) {
      return Object.assign({}, s, { baseY: H - spillH + s.baseY });
    });
  }

  /* ── Draw strings with the exact same full render pass as the spill ──
     clock    : current spillClock value
     alphaMul : overall opacity multiplier (for fade in/out)
     yShift   : extra vertical offset (for windup spread)
     xFn      : function(x, u, t) → extra horizontal offset per-pixel (for slingshot)  */
  function drawLiveStrings(ctx, strings, W, clock, alphaMul, yShift, xFn) {
    yShift = yShift || 0;
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      var c = s.col;
      var breath   = 1 + s.breathDepth * Math.sin(clock * s.breathRate * Math.PI * 2 + s.breathOff);
      var rawP     = Math.sin(clock * s.pulseRate * Math.PI * 2 + s.pulseOff);
      var pulse    = s.pulseDepth * Math.max(0, rawP) * Math.max(0, rawP);
      var alpha    = Math.min(0.92, s.baseAlpha * (breath + pulse)) * alphaMul;
      if (alpha < 0.005) continue;
      var effAmp   = s.amp * breath;
      var drift    = clock * s.driftRate;
      var baseY    = s.baseY + yShift;

      /* Glow pass */
      ctx.beginPath();
      for (var x = 0; x <= W; x += 3) {
        var u   = x / W;
        var sh  = 1 + s.shimmerAmt * Math.sin(x * 0.004 + clock * s.shimmerRate * Math.PI * 2 + s.shimmerOff);
        var y   = baseY + Math.sin(x * s.freq + s.phase + drift) * effAmp * sh;
        var px  = xFn ? x + xFn(x, u, alpha) : x;
        x === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.55)+')';
      ctx.lineWidth   = s.lineW + 1.5 + pulse * 3;
      ctx.shadowColor = 'rgba('+c[0]+','+c[1]+','+c[2]+','+(alpha * 0.7)+')';
      ctx.shadowBlur  = 10 + pulse * 14;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      /* Core pass */
      ctx.beginPath();
      for (var x = 0; x <= W; x += 2) {
        var u   = x / W;
        var sh  = 1 + s.shimmerAmt * Math.sin(x * 0.004 + clock * s.shimmerRate * Math.PI * 2 + s.shimmerOff);
        var y   = baseY + Math.sin(x * s.freq + s.phase + drift) * effAmp * sh;
        var px  = xFn ? x + xFn(x, u, alpha) : x;
        x === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
      ctx.lineWidth   = s.lineW;
      ctx.stroke();
    }
  }

  /* ── Prism shared draw helper (unchanged) ── */
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
     SLINGSHOT EXIT
     Timeline (total ~2000ms):
       0.00 – 0.30  Page content fades to dark. Spill canvas fades out.
                    Transition strings fade in seamlessly in its place.
       0.30 – 0.68  Windup: strings bow left, tension builds.
       0.68 – 1.00  Release: strings snap right and fly off screen.
       Navigate on completion.
  ================================================================ */

  var SLING_EXIT       = 2000;
  var SLING_HOLD       = 40;
  var SLING_ENTRY      = 1600;
  var SLING_CONTENT_IN = 600;

  function slingshotExit(href, cv, ctx, W, H, dpr) {
    var clock = window._spillClock || 0;
    var last = null, start = null;
    var strings = getLiveStrings(H);

    /* Fallback: if the spill hasn't been injected yet (e.g. mid-intro on home),
       synthesise a minimal set of strings at the bottom of the viewport */
    if (!strings) {
      var spillH = 90;
      strings = PAL.map(function(col, i) {
        return {
          col: col,
          baseY: H - spillH + spillH * (0.2 + 0.6 * (i / (PAL.length - 1))),
          freq: 0.008 + i * 0.002, amp: 3 + i * 0.4, phase: i * 0.63,
          breathRate: 0.1, breathDepth: 0.1, breathOff: i,
          pulseRate: 0.5, pulseDepth: 0.1, pulseOff: i * 0.5,
          shimmerAmt: 0.08, shimmerRate: 0.07, shimmerOff: i,
          driftRate: 0.004, baseAlpha: 0.55, lineW: 0.9
        };
      });
    }

    /* Hide the real spill canvas — transition takes over string rendering */
    var spill = document.getElementById('neonSpill');
    if (spill) { spill.style.transition = 'opacity 0.5s ease'; spill.style.opacity = '0'; }

    /* Dark overlay that rises over page content */
    var pageOverlay = document.createElement('div');
    pageOverlay.style.cssText = [
      'position:fixed','inset:0','z-index:99997',
      'background:#0d0f14',
      'opacity:0',
      'pointer-events:none',
      'transition:opacity 0.65s ease'
    ].join(';');
    document.body.appendChild(pageOverlay);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { pageOverlay.style.opacity = '1'; });
    });

    function step(ts) {
      if (!start) start = ts;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      clock += dt;
      last = ts;
      var t = clamp((ts - start) / SLING_EXIT, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* ── Phase 1 (0 → 0.28): strings fade in at rest, seamless with spill ── */
      if (t <= 0.28) {
        var fadeIn = eo3(clamp(t / 0.18, 0, 1));
        if (strings) drawLiveStrings(ctx, strings, W, clock, fadeIn, 0, null);

      /* ── Phase 2 (0.28 → 0.66): windup — bow left, tension builds ── */
      } else if (t <= 0.66) {
        var wt        = clamp((t - 0.28) / 0.38, 0, 1);
        var windEased = eios(wt) * 0.55;

        if (strings) {
          drawLiveStrings(ctx, strings, W, clock, 1.0 + windEased * 0.4,
            /* yShift: strings spread upward slightly as they tense */
            -windEased * 12,
            /* xFn: leftward bow peaks at centre */
            function(x, u) {
              var bow = Math.sin(u * Math.PI);
              return -windEased * W * 0.09 * bow;
            }
          );
        }

      /* ── Phase 3 (0.66 → 1.00): release — snap right with trails ── */
      } else {
        var rt           = clamp((t - 0.66) / 0.34, 0, 1);
        var releaseEased = eo5(rt);
        var TRAILS       = 4;

        if (strings) {
          for (var tr = TRAILS - 1; tr >= 0; tr--) {
            var lag      = tr * 0.055;
            var trailT   = clamp(releaseEased - lag, 0, 1);
            var trailMul = (1 - rt * 0.7) * (1 - tr * 0.22);
            if (trailMul < 0.01) continue;

            drawLiveStrings(ctx, strings, W, clock, trailMul,
              -12 * (1 - rt * 0.6), /* yShift: settle back as they fly */
              function(x, u) {
                var pull  = Math.pow(u, 0.65);
                return trailT * W * 1.3 * pull;
              }
            );
          }
        }
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(function() {
          pageOverlay.remove();
          sessionStorage.setItem('_tx', '1');
          sessionStorage.setItem('_txReturning', '1');
          window.location.href = href;
        }, SLING_HOLD);
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     SLINGSHOT ENTRY
     Timeline (total ~1600ms):
       0.00          Page hidden (opacity:0), canvas paints dark.
       0.00 – 0.50   Strings arrive from right, settle with spring.
       0.35 – 1.00   Page content fades in.
       1.00          Canvas removed, spill canvas fades back in.
  ================================================================ */

  function slingshotEntry(cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;
    var contentStarted = false;
    var strings = getLiveStrings(H);

    document.body.style.opacity    = '0';
    document.body.style.transition = 'none';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);

    function step(ts) {
      if (!start) start = ts;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      clock += dt;
      last = ts;
      var t = clamp((ts - start) / SLING_ENTRY, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* Dark bg lifts as content fades in */
      var bgAlpha = Math.max(0, 1 - eo3(clamp((t - 0.30) / 0.70, 0, 1)));
      if (bgAlpha > 0.005) {
        ctx.fillStyle = 'rgba(13,15,20,' + bgAlpha.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      /* Strings arrive from right (0 → 0.55) then rest and fade (0.55 → 1.0) */
      if (strings) {
        if (t <= 0.55) {
          drawLiveStrings(ctx, strings, W, clock,
            eo3(clamp(t / 0.18, 0, 1)), /* fade in */
            0,
            function(x, u) {
              /* each string staggered slightly, springs in from right */
              var spring    = eo5(clamp(t / 0.55, 0, 1));
              var overshoot = Math.sin(clamp(t / 0.55, 0, 1) * Math.PI * 1.6) * 0.035 * (1 - clamp(t / 0.55, 0, 1));
              return (1 - spring - overshoot) * W * 0.50;
            }
          );
        } else {
          /* settled — fade out as canvas lifts */
          var restAlpha = 1 - eo3(clamp((t - 0.55) / 0.45, 0, 1));
          if (restAlpha > 0.005) drawLiveStrings(ctx, strings, W, clock, restAlpha, 0, null);
        }
      }

      if (!contentStarted && t >= 0.35) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + SLING_CONTENT_IN + 'ms ease';
        document.body.style.opacity    = '1';
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        clearCanvas(cv);
        document.body.style.transition = '';
        document.body.style.opacity    = '1';
        var spill = document.getElementById('neonSpill');
        if (spill) { spill.style.transition = 'opacity 0.6s ease'; spill.style.opacity = '1'; }
      }
    }
    requestAnimationFrame(step);
  }

  /* ================================================================
     PRISM MODE — unchanged
  ================================================================ */

  var PRISM_EXIT       = 1100;
  var PRISM_HOLD       = 60;
  var PRISM_ENTRY      = 1050;
  var PRISM_CONTENT_IN = 450;

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
    var ox = W * 0.50, oy = H * 0.44;
    var maxLen = Math.sqrt(W * W + H * H);
    RAYS.forEach(function(r, i) {
      var delay = i * 0.038;
      var rt = clamp((t - delay) / (1 - delay * RAYS.length * 0.25), 0, 1);
      if (rt <= 0) return;
      var expand = direction === 'out' ? eo3(rt) : 1 - eo5(rt);
      var beamLen = expand * maxLen * r.len;
      var beamW   = r.w * (0.25 + expand * 0.75);
      var alpha   = direction === 'out' ? expand * 0.82 : (1 - expand) * 0.78;
      if (alpha < 0.008) return;
      var ang = r.angle * Math.PI * 2;
      var ax = Math.cos(ang), ay = Math.sin(ang);
      var ex = ox + ax * beamLen, ey = oy + ay * beamLen;
      var perp = { x: -ay, y: ax };
      var hw = beamW * 3.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex + perp.x * hw, ey + perp.y * hw);
      ctx.lineTo(ex - perp.x * hw, ey - perp.y * hw);
      ctx.closePath();
      ctx.fillStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.16)+')';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex + perp.x * beamW, ey + perp.y * beamW);
      ctx.lineTo(ex - perp.x * beamW, ey - perp.y * beamW);
      ctx.closePath();
      ctx.fillStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.35)+')';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+alpha+')';
      ctx.lineWidth   = Math.max(0.8, beamW * 0.3);
      ctx.shadowColor = 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.8)+')';
      ctx.shadowBlur  = beamW * 0.9;
      ctx.stroke();
      ctx.shadowBlur  = 0;
      if (expand > 0.3) {
        var flareT = (expand - 0.3) / 0.7;
        var fd = beamLen * (0.35 + i * 0.04);
        var fx = ox + ax * fd, fy = oy + ay * fd;
        var fr = beamW * 0.6 * flareT;
        var fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.5);
        fg.addColorStop(0,   'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.9)+')');
        fg.addColorStop(0.4, 'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+','+(alpha * 0.4)+')');
        fg.addColorStop(1,   'rgba('+r.col[0]+','+r.col[1]+','+r.col[2]+',0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fx, fy, fr * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (t > 0.05) {
      var cp = direction === 'out' ? Math.min(1, t * 3.5) : Math.max(0, 1 - t * 2.8);
      var cg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 22 + t * 35);
      cg.addColorStop(0,    'rgba(255,255,255,' + (cp * 0.96) + ')');
      cg.addColorStop(0.35, 'rgba(200,225,255,' + (cp * 0.55) + ')');
      cg.addColorStop(1,    'rgba(96,200,255,0)');
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
      var spillAlpha = Math.max(0, 1 - t * 2.2);
      if (spillAlpha > 0.02) drawSpill(ctx, W, H, spillAlpha, clock);
      var dark = ei2(clamp(t / 0.55, 0, 1)) * 0.78;
      if (dark > 0.01) { ctx.fillStyle = 'rgba(13,15,20,'+dark.toFixed(3)+')'; ctx.fillRect(0, 0, W, H); }
      if (t > 0.14) drawPrismRays(ctx, W, H, clamp((t - 0.14) / 0.86, 0, 1), 'out');
      if (t > 0.66) {
        var wt = clamp((t - 0.66) / 0.34, 0, 1);
        var ox = W * 0.50, oy = H * 0.44;
        var wg = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(W, H) * 1.5 * eo3(wt));
        wg.addColorStop(0,    'rgba(255,255,255,' + Math.min(0.96, wt * 1.4) + ')');
        wg.addColorStop(0.55, 'rgba(255,255,255,' + Math.min(0.92, wt * 0.9) + ')');
        wg.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, W, H);
        if (wt > 0.75) { ctx.fillStyle = 'rgba(255,255,255,' + clamp((wt - 0.75) / 0.25, 0, 1) * 0.94 + ')'; ctx.fillRect(0, 0, W, H); }
      }
      if (t < 1) { requestAnimationFrame(step); }
      else { setTimeout(function() { sessionStorage.setItem('_tx','1'); sessionStorage.setItem('_txReturning','1'); window.location.href = href; }, PRISM_HOLD); }
    }
    requestAnimationFrame(step);
  }

  function prismEntry(cv, ctx, W, H, dpr) {
    var clock = 0, last = null, start = null;
    var contentStarted = false;
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';
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
      var whiteAlpha = Math.max(0, 1 - eo5(clamp(t / 0.26, 0, 1)));
      if (whiteAlpha > 0.005) { ctx.fillStyle = 'rgba(255,255,255,'+whiteAlpha+')'; ctx.fillRect(0, 0, W, H); }
      if (t > 0.06) drawPrismRays(ctx, W, H, clamp((t - 0.06) / 0.66, 0, 1), 'in');
      var dark = Math.max(0, 1 - eo3(clamp((t - 0.20) / 0.60, 0, 1))) * 0.78;
      if (dark > 0.01) { ctx.fillStyle = 'rgba(13,15,20,'+dark.toFixed(3)+')'; ctx.fillRect(0, 0, W, H); }
      if (t > 0.55) drawSpill(ctx, W, H, eo3(clamp((t - 0.55) / 0.45, 0, 1)), clock);
      if (!contentStarted && t >= 0.32) {
        contentStarted = true;
        document.body.style.transition = 'opacity ' + PRISM_CONTENT_IN + 'ms ease';
        document.body.style.opacity = '1';
      }
      if (t < 1) { requestAnimationFrame(step); }
      else {
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
     ROUTER
  ================================================================ */
  function runExit(href) {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas();
    var ctx = cv.getContext('2d');
    if (getStyle() === 'prism') { prismExit(href, cv, ctx, W, H, dpr); }
    else                        { slingshotExit(href, cv, ctx, W, H, dpr); }
  }

  function runEntry() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var cv = getCanvas();
    var ctx = cv.getContext('2d');
    if (getStyle() === 'prism') { prismEntry(cv, ctx, W, H, dpr); }
    else                        { slingshotEntry(cv, ctx, W, H, dpr); }
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
      /* Skip entry animation on home — the light hero background
         would clash with the dark slingshot canvas */
      var isHome = (window.location.pathname === '/' ||
                    window.location.pathname === '/index.html' ||
                    window.location.pathname.split('/').pop() === '' ||
                    window.location.pathname.split('/').pop() === 'index.html');
      if (!isHome) {
        requestAnimationFrame(function() { requestAnimationFrame(runEntry); });
      }
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