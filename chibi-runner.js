/* ChibiRunner — chibi chạy qua lại ở đáy màn hình, bấm vào thì ngã rồi tự đứng dậy chạy tiếp.
 *
 * Dùng: ChibiRunner.sync([{ code:"1", frameCount:10, frameFileName:i=>`${i}.png`, config:{...} }])
 *  - sync() nhận DANH SÁCH chibi đang bật: chibi mới thì thêm, chibi không còn trong danh sách thì xoá.
 *  - Ảnh chạy : <code>/<frameFileName(i)>           (i = 1..frameCount)
 *  - Ảnh ngã  : <code>/<fall.dir>/<fall.frameFileName(i)> (i = fall.start..fall.end)
 *  - Nếu chưa có ảnh (lỗi tải) -> tự dùng mèo vẽ bằng SVG để vẫn chạy & ngã được.
 */
(function () {
  "use strict";

  var BASE_DIR = ""; // ảnh nằm ở <gốc dự án>/<code>/..., ví dụ 1/1.png. Nếu để trong thư mục chibi/ thì đổi thành "chibi"
  var runners = new Map();

  var css = [
    ".chibi-runner{position:fixed;left:0;bottom:14px;z-index:9998;pointer-events:auto;",
    "user-select:none;-webkit-user-drag:none;will-change:transform;touch-action:manipulation}",
    ".chibi-runner img,.chibi-runner svg{display:block;width:100%;height:auto;pointer-events:none;-webkit-user-drag:none}",
    ".chibi-runner .cr-inner{transform-origin:50% 100%;width:100%}",
    ".chibi-runner .leg{transform-origin:50% 0}",
    "@media (prefers-reduced-motion:reduce){.chibi-runner{display:none}}"
  ].join("");

  function injectCss() {
    if (document.getElementById("chibiRunnerCss")) return;
    var st = document.createElement("style");
    st.id = "chibiRunnerCss";
    st.textContent = css;
    document.head.appendChild(st);
  }

  // Mèo dự phòng (SVG) — nhìn sang PHẢI. Chân đổi pose theo "step".
  function fallbackCatSvg() {
    return '' +
      '<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">' +
      '<g stroke="#3a2412" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
      '<path class="tail" d="M22 78 C4 74 4 50 16 46" fill="none"/>' +
      '<g class="leg" data-leg="0"><rect x="36" y="88" width="13" height="18" rx="6" fill="#ffb347"/></g>' +
      '<g class="leg" data-leg="1"><rect x="52" y="88" width="13" height="18" rx="6" fill="#ffb347"/></g>' +
      '<g class="leg" data-leg="2"><rect x="70" y="88" width="13" height="18" rx="6" fill="#ffb347"/></g>' +
      '<g class="leg" data-leg="3"><rect x="86" y="88" width="13" height="18" rx="6" fill="#ffb347"/></g>' +
      '<ellipse cx="62" cy="76" rx="38" ry="22" fill="#ffc46b"/>' +
      '<path d="M66 40 L72 22 L84 34 Z" fill="#ffc46b"/>' +
      '<path d="M96 34 L108 22 L112 40 Z" fill="#ffc46b"/>' +
      '<circle cx="92" cy="54" r="24" fill="#ffc46b"/>' +
      '</g>' +
      '<g fill="#3a2412"><circle cx="86" cy="52" r="3.4"/><circle cx="104" cy="52" r="3.4"/></g>' +
      '<path d="M92 60 Q95 64 98 60" stroke="#3a2412" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="80" cy="60" rx="4" ry="2.6" fill="#ff8f8f" opacity=".7"/>' +
      '<ellipse cx="108" cy="60" rx="4" ry="2.6" fill="#ff8f8f" opacity=".7"/>' +
      '</svg>';
  }

  function Runner(entry) {
    var cfg = entry.config || {};
    var self = this;
    this.code = String(entry.code);
    this.cfg = cfg;
    this.frameCount = entry.frameCount || 10;
    this.frameName = entry.frameFileName || function (i) { return i + ".png"; };
    this.speed = cfg.speed || 78;
    this.fps = cfg.fps || 11;
    this.baseFacing = cfg.baseFacing || "left";
    this.fall = cfg.fall || null;
    this.width = cfg.spriteWidth || 120;
    this.bottom = cfg.bottomOffset != null ? cfg.bottomOffset : 14;

    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = Math.random() * Math.max(0, window.innerWidth - this.width);
    this.mode = "run";        // run | fall
    this.frame = 0;
    this.frameAcc = 0;
    this.fallT = 0;
    this.fallPhase = "down";   // down | hold | up
    this.fallDown = 0;
    this.useFallback = false;
    this.runImgs = [];
    this.fallImgs = [];
    this.alive = true;
    this.turnTimer = 3 + Math.random() * 5;

    var el = document.createElement("div");
    el.className = "chibi-runner";
    el.style.width = this.width + "px";
    el.style.bottom = this.bottom + "px";
    el.title = "Chạm vào mình đi 🐾";
    var inner = document.createElement("div");
    inner.className = "cr-inner";
    el.appendChild(inner);
    this.el = el;
    this.inner = inner;
    document.body.appendChild(el);

    el.addEventListener("pointerdown", function (e) { e.preventDefault(); self.onClick(); });

    this.preload();
  }

  Runner.prototype.runSrc = function (i) {
    return (BASE_DIR ? BASE_DIR + "/" : "") + this.code + "/" + this.frameName(i);
  };
  Runner.prototype.fallSrc = function (i) {
    var f = this.fall;
    return (BASE_DIR ? BASE_DIR + "/" : "") + this.code + "/" + f.dir + "/" + f.frameFileName(i);
  };

  Runner.prototype.preload = function () {
    var self = this, loaded = 0, failed = false, i, img;
    function done() {
      if (failed || self.useFallback) return;
      if (++loaded === self.frameCount) self.ready();
    }
    function fail() {
      if (failed) return;
      failed = true;
      self.enableFallback();
    }
    for (i = 1; i <= this.frameCount; i++) {
      img = new Image();
      img.onload = done;
      img.onerror = fail;
      img.src = this.runSrc(i);
      this.runImgs.push(img);
    }
    if (this.fall) {
      for (i = this.fall.start; i <= this.fall.end; i++) {
        img = new Image();
        img.src = this.fallSrc(i); // lỗi ảnh ngã: bỏ qua, xử lý lúc phát
        this.fallImgs.push(img);
      }
    }
  };

  Runner.prototype.ready = function () {
    this.imgEl = document.createElement("img");
    this.imgEl.alt = "";
    this.imgEl.draggable = false;
    this.imgEl.src = this.runImgs[0].src;
    this.inner.innerHTML = "";
    this.inner.appendChild(this.imgEl);
  };

  Runner.prototype.enableFallback = function () {
    this.useFallback = true;
    this.inner.innerHTML = fallbackCatSvg();
    this.legs = this.inner.querySelectorAll(".leg");
    this.tail = this.inner.querySelector(".tail");
  };

  Runner.prototype.onClick = function () {
    if (this.mode === "fall") return;
    this.mode = "fall";
    this.fallT = 0;
    this.fallIdx = 0;
    this.fallPhase = "down";
    this.holdLeft = 0;
  };

  Runner.prototype.facingScale = function () {
    // ảnh gốc quay về baseFacing; đi hướng ngược lại thì lật
    var goingRight = this.dir === 1;
    var baseRight = this.baseFacing === "right";
    return goingRight === baseRight ? 1 : -1;
  };

  Runner.prototype.update = function (dt) {
    var maxX = Math.max(0, window.innerWidth - this.width);
    var flip = this.facingScale();
    var scale = 1, yOff = 0, rot = 0;

    if (this.mode === "run") {
      this.x += this.dir * this.speed * dt;
      if (this.x <= 0) { this.x = 0; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) { this.turnTimer = 4 + Math.random() * 8; if (Math.random() < 0.35) this.dir *= -1; }

      this.frameAcc += dt * this.fps;
      var step = Math.floor(this.frameAcc);
      if (!this.useFallback && this.imgEl && this.runImgs.length) {
        this.frame = step % this.frameCount;
        var src = this.runImgs[this.frame].src;
        if (this.imgEl.src !== src) this.imgEl.src = src;
      } else if (this.useFallback && this.legs) {
        // chân đi so le + thân nhún nhẹ
        var ph = this.frameAcc * 0.9;
        for (var k = 0; k < this.legs.length; k++) {
          var a = Math.sin(ph * 2 + (k % 2 ? Math.PI : 0)) * 22;
          this.legs[k].style.transform = "rotate(" + a + "deg)";
        }
        yOff = -Math.abs(Math.sin(ph * 2)) * 3;
        if (this.tail) this.tail.style.transform = "rotate(" + Math.sin(ph) * 8 + "deg)";
      }
    } else {
      // ===== ngã =====
      var f = this.fall || { fps: 15, holdMs: 250, yOffset: 0, scale: 1 };
      if (!this.useFallback && this.fall && this.fallImgs.length && this.imgEl) {
        var n = this.fallImgs.length;
        if (this.fallPhase === "down") {
          this.fallT += dt * f.fps;
          this.fallIdx = Math.min(n - 1, Math.floor(this.fallT));
          if (this.fallIdx >= n - 1) { this.fallPhase = "hold"; this.holdLeft = (f.holdMs || 250) / 1000; }
        } else if (this.fallPhase === "hold") {
          this.holdLeft -= dt;
          this.fallIdx = n - 1;
          if (this.holdLeft <= 0) { this.mode = "run"; this.frameAcc = 0; }
        }
        var fs = this.fallImgs[this.fallIdx].src;
        if (this.imgEl.src !== fs) this.imgEl.src = fs;
        scale = f.scale || 1;
        yOff = f.yOffset || 0;
      } else if (this.useFallback) {
        // mèo SVG: ngã lăn ra 90° rồi đứng dậy
        this.fallT += dt;
        var down = 0.35, hold = (f.holdMs || 600) / 1000, up = 0.4;
        var t = this.fallT, p;
        if (t < down) { p = t / down; rot = 90 * (1 - Math.pow(1 - p, 3)); }
        else if (t < down + hold) { rot = 90; }
        else if (t < down + hold + up) { p = (t - down - hold) / up; rot = 90 * (1 - p); }
        else { this.mode = "run"; this.frameAcc = 0; rot = 0; }
        if (this.legs) for (var j = 0; j < this.legs.length; j++) this.legs[j].style.transform = "rotate(" + (j % 2 ? 40 : -30) * (rot / 90) + "deg)";
      } else {
        this.mode = "run"; // chưa tải xong ảnh -> bỏ qua
      }
    }

    var sx = flip * scale;
    // rot áp theo hướng mặt để ngã "ra phía trước"
    this.el.style.transform = "translate3d(" + this.x.toFixed(1) + "px," + yOff + "px,0)";
    this.inner.style.transform = "scale(" + sx + "," + scale + ") rotate(" + (rot * flip) + "deg)";
  };

  Runner.prototype.destroy = function () {
    this.alive = false;
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  var raf = 0, last = 0;
  function loop(ts) {
    var dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    last = ts;
    runners.forEach(function (r) { r.update(dt); });
    raf = runners.size ? requestAnimationFrame(loop) : 0;
  }
  function startLoop() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  // Điện thoại / màn hình cảm ứng nhỏ: không hiện chibi.
  var mobileMq = window.matchMedia("(max-width:768px), (hover:none) and (pointer:coarse)");
  var lastEntries = [];
  function isMobile() { return mobileMq.matches; }
  function onMqChange() { window.ChibiRunner.sync(lastEntries); }
  if (mobileMq.addEventListener) mobileMq.addEventListener("change", onMqChange);
  else if (mobileMq.addListener) mobileMq.addListener(onMqChange);

  window.ChibiRunner = {
    sync: function (entries) {
      injectCss();
      lastEntries = entries || [];
      var want = new Set();
      (isMobile() ? [] : lastEntries).forEach(function (e) {
        var code = String(e.code);
        want.add(code);
        if (!runners.has(code)) runners.set(code, new Runner(e));
      });
      Array.from(runners.keys()).forEach(function (code) {
        if (!want.has(code)) { runners.get(code).destroy(); runners.delete(code); }
      });
      if (runners.size) startLoop();
    }
  };
})();
