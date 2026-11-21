(function () {
  "use strict";

  var SAVED_KEY = "flow.saved.v1";
  var Y_MIN = -0.7, Y_MAX = 1.7; // visible value range, room for overshoot
  var HANDLE_HIT = 12;

  var state = {
    v: [0.42, 0, 0.58, 1],
    mode: "both",
    tab: "builtin",
    drag: -1,
    hover: -1
  };

  var canvas = document.getElementById("curve");
  var ctx = canvas.getContext("2d");
  var valuesEl = document.getElementById("values");
  var gridEl = document.getElementById("grid");
  var toastEl = document.getElementById("toast");
  var cssVar = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  // ---------- host bridge ----------

  var cep = window.__adobe_cep__;

  function evalHost(script, done) {
    if (!cep) { toast("The panel is not running inside After Effects", true); return; }
    cep.evalScript(script, function (res) { done(String(res || "")); });
  }

  var ERRORS = {
    nocomp: "Open a composition",
    nokeys: "Select keyframes",
    nosegments: "Select at least two neighboring keyframes"
  };

  function handleResult(res, onOk) {
    if (res.indexOf("ok:") === 0) return onOk(res.slice(3));
    var code = res.indexOf("err:") === 0 ? res.slice(4) : res;
    toast(ERRORS[code] || ("Error: " + (code || "no response from AE")), true);
  }

  // Follow the host panel colour so the panel blends in with any AE brightness setting.
  try {
    var skin = JSON.parse(cep.getHostEnvironment()).appSkinInfo.panelBackgroundColor.color;
    document.documentElement.style.setProperty("--bg",
      "rgb(" + Math.round(skin.red) + "," + Math.round(skin.green) + "," + Math.round(skin.blue) + ")");
  } catch (e) { /* not in AE */ }

  // ---------- easing math ----------

  function bez(a, b, t) {
    var u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  }

  // y for a given x (time) of the current curve.
  function ease(v, x) {
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 30; i++) {
      var cx = bez(v[0], v[2], t);
      if (Math.abs(cx - x) < 1e-5) break;
      if (cx < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return bez(v[1], v[3], t);
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function fmt(v) { return v.map(function (n) { return round2(n).toFixed(2); }).join(", "); }

  function parseValues(text) {
    var parts = text.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return null;
    if (parts[0] < 0 || parts[0] > 1 || parts[2] < 0 || parts[2] > 1) return null;
    return parts;
  }

  // ---------- curve editor ----------

  var view = { w: 0, h: 0, dpr: 1, left: 0, right: 0, top: 0, bottom: 0 };

  function layout() {
    var r = canvas.getBoundingClientRect();
    view.dpr = window.devicePixelRatio || 1;
    view.w = r.width;
    view.h = r.height;
    canvas.width = Math.round(r.width * view.dpr);
    canvas.height = Math.round(r.height * view.dpr);
    var pad = 14;
    view.left = pad;
    view.right = view.w - pad;
    view.top = pad;
    view.bottom = view.h - pad - 10; // leave a strip for the preview track
  }

  function toPx(x, y) {
    return [
      view.left + x * (view.right - view.left),
      view.bottom - (y - Y_MIN) / (Y_MAX - Y_MIN) * (view.bottom - view.top)
    ];
  }

  function fromPx(px, py) {
    return [
      (px - view.left) / (view.right - view.left),
      Y_MIN + (view.bottom - py) / (view.bottom - view.top) * (Y_MAX - Y_MIN)
    ];
  }

  var previewStart = performance.now();

  function draw(now) {
    // Colors come from the AE theme, so the accent setting recolors the handles live.
    var accent = cssVar("--value"), text = cssVar("--text-hi"), line = cssVar("--line-strong"), gridC = cssVar("--grid"), field = cssVar("--bg-field");
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    var p00 = toPx(0, 0), p11 = toPx(1, 1);

    // Unit box with quarter grid.
    ctx.lineWidth = 1;
    ctx.strokeStyle = gridC;
    ctx.beginPath();
    for (var i = 1; i < 4; i++) {
      var gx = p00[0] + (p11[0] - p00[0]) * i / 4, gy = p00[1] + (p11[1] - p00[1]) * i / 4;
      ctx.moveTo(gx, p11[1]); ctx.lineTo(gx, p00[1]);
      ctx.moveTo(p00[0], gy); ctx.lineTo(p11[0], gy);
    }
    ctx.stroke();
    ctx.strokeStyle = line;
    ctx.strokeRect(p00[0] + 0.5, p11[1] + 0.5, p11[0] - p00[0], p00[1] - p11[1]);

    var v = state.v, h1 = toPx(v[0], v[1]), h2 = toPx(v[2], v[3]);

    // Handle arms.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(p00[0], p00[1]); ctx.lineTo(h1[0], h1[1]);
    ctx.moveTo(p11[0], p11[1]); ctx.lineTo(h2[0], h2[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Curve.
    ctx.strokeStyle = text;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p00[0], p00[1]);
    ctx.bezierCurveTo(h1[0], h1[1], h2[0], h2[1], p11[0], p11[1]);
    ctx.stroke();

    // End points and handles.
    ctx.fillStyle = line;
    [p00, p11].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); });
    [h1, h2].forEach(function (p, idx) {
      var active = state.drag === idx || state.hover === idx;
      ctx.fillStyle = field;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p[0], p[1], active ? 5.5 : 4.5, 0, 7); ctx.fill(); ctx.stroke();
    });

    // Preview: a dot travelling along a track with the current easing.
    var cycle = 1600, move = 1100;
    var t = Math.min(((now - previewStart) % cycle) / move, 1);
    var ty = view.h - 9;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p00[0], ty); ctx.lineTo(p11[0], ty); ctx.stroke();
    var dx = p00[0] + (p11[0] - p00[0]) * ease(v, t);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(dx, ty, 3.5, 0, 7); ctx.fill();

    requestAnimationFrame(draw);
  }

  function handleAt(px, py) {
    for (var i = 1; i >= 0; i--) {
      var h = toPx(state.v[i * 2], state.v[i * 2 + 1]);
      if (Math.hypot(h[0] - px, h[1] - py) <= HANDLE_HIT) return i;
    }
    return -1;
  }

  function localPos(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener("pointerdown", function (e) {
    var p = localPos(e), idx = handleAt(p[0], p[1]);
    if (idx < 0) {
      // Grab whichever handle is closer, so a click anywhere starts a drag.
      var a = toPx(state.v[0], state.v[1]), b = toPx(state.v[2], state.v[3]);
      idx = Math.hypot(a[0] - p[0], a[1] - p[1]) <= Math.hypot(b[0] - p[0], b[1] - p[1]) ? 0 : 1;
    }
    state.drag = idx;
    canvas.setPointerCapture(e.pointerId);
    moveHandle(p, e.shiftKey);
  });

  canvas.addEventListener("pointermove", function (e) {
    var p = localPos(e);
    if (state.drag >= 0) moveHandle(p, e.shiftKey);
    else {
      state.hover = handleAt(p[0], p[1]);
      canvas.style.cursor = state.hover >= 0 ? "grab" : "default";
    }
  });

  function endDrag() { state.drag = -1; }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Shift snaps to 0.05 steps.
  function moveHandle(p, snap) {
    var val = fromPx(p[0], p[1]);
    var x = Math.min(1, Math.max(0, val[0]));
    var y = Math.min(Y_MAX, Math.max(Y_MIN, val[1]));
    if (snap) { x = Math.round(x * 20) / 20; y = Math.round(y * 20) / 20; }
    state.v[state.drag * 2] = round2(x);
    state.v[state.drag * 2 + 1] = round2(y);
    setCurve(state.v, true);
  }

  // ---------- state updates ----------

  function setCurve(v, keepPreview) {
    state.v = v.slice();
    valuesEl.value = fmt(state.v);
    valuesEl.classList.remove("bad");
    if (!keepPreview) previewStart = performance.now();
    markActive();
  }

  valuesEl.addEventListener("change", function () {
    var v = parseValues(valuesEl.value);
    if (v) setCurve(v);
    else valuesEl.classList.add("bad");
  });
  valuesEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { valuesEl.blur(); apply(); }
  });

  // ---------- presets ----------

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch (e) { return []; }
  }
  function storeSaved(list) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }

  function thumb(v) {
    // 34x34 box, unit square inset so overshoot stays visible.
    var s = 22, ox = 6, oy = 28;
    var P = function (x, y) { return (ox + x * s).toFixed(1) + " " + (oy - y * s).toFixed(1); };
    return '<svg viewBox="0 0 34 34">' +
      '<rect class="frame" x="' + ox + '" y="' + (oy - s) + '" width="' + s + '" height="' + s + '" rx="1"/>' +
      '<path class="c" d="M' + P(0, 0) + " C" + P(v[0], v[1]) + ", " + P(v[2], v[3]) + ", " + P(1, 1) + '"/></svg>';
  }

  function sameCurve(a, b) {
    for (var i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > 0.005) return false;
    return true;
  }

  function renderGrid() {
    var list = state.tab === "builtin" ? window.FLOW_PRESETS : loadSaved();
    if (!list.length) {
      gridEl.innerHTML = '<div class="empty">Empty. Shape a curve and press +<br>Right-click a preset to delete it</div>';
      return;
    }
    gridEl.innerHTML = list.map(function (p, i) {
      return '<button class="preset" data-i="' + i + '" title="' + p.name + "  (" + fmt(p.v) + ')">' +
        thumb(p.v) + "<span>" + p.name + "</span></button>";
    }).join("");
    markActive();
  }

  function markActive() {
    var list = state.tab === "builtin" ? window.FLOW_PRESETS : loadSaved();
    Array.prototype.forEach.call(gridEl.querySelectorAll(".preset"), function (el) {
      var p = list[+el.dataset.i];
      el.classList.toggle("active", !!p && sameCurve(p.v, state.v));
    });
  }

  function presetFrom(el) {
    var list = state.tab === "builtin" ? window.FLOW_PRESETS : loadSaved();
    return list[+el.dataset.i];
  }

  // One click picks a preset; with "Apply preset with one click" it is also applied right away.
  gridEl.addEventListener("click", function (e) {
    var el = e.target.closest(".preset");
    if (!el) return;
    setCurve(presetFrom(el).v);
    if (window.MakiInterface && MakiInterface.get("clickApply")) apply();
  });

  gridEl.addEventListener("dblclick", function (e) {
    var el = e.target.closest(".preset");
    if (el && !(window.MakiInterface && MakiInterface.get("clickApply"))) { setCurve(presetFrom(el).v); apply(); }
  });

  gridEl.addEventListener("contextmenu", function (e) {
    var el = e.target.closest(".preset");
    e.preventDefault();
    if (!el || state.tab !== "saved") return;
    var list = loadSaved();
    var removed = list.splice(+el.dataset.i, 1)[0];
    storeSaved(list);
    renderGrid();
    toast("Deleted: " + removed.name);
  });

  document.getElementById("save").addEventListener("click", function () {
    var list = loadSaved();
    if (list.some(function (p) { return sameCurve(p.v, state.v); })) { toast("This preset already exists"); return; }
    list.push({ name: "my " + (list.length + 1), v: state.v.slice() });
    storeSaved(list);
    selectTab("saved");
    toast("Saved to Mine");
  });

  function selectTab(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) {
      b.classList.toggle("on", b.dataset.tab === tab);
    });
    renderGrid();
  }

  document.querySelector(".tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) selectTab(b.dataset.tab);
  });

  // ---------- mode / actions ----------

  document.getElementById("mode").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.mode = b.dataset.mode;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle("on", c === b); });
  });

  function apply() {
    var v = state.v;
    var script = "flowApply(" + v.join(",") + ',"' + state.mode + '")';
    evalHost(script, function (res) {
      handleResult(res, function (n) { toast("Done · segments: " + n); });
    });
  }

  document.getElementById("apply").addEventListener("click", apply);

  document.getElementById("read").addEventListener("click", function () {
    evalHost("flowRead()", function (res) {
      handleResult(res, function (data) {
        var v = data.split(",").map(Number).map(round2);
        v[0] = Math.min(1, Math.max(0, v[0]));
        v[2] = Math.min(1, Math.max(0, v[2]));
        setCurve(v);
        toast("Curve read from keyframes");
      });
    });
  });

  // ---------- toast ----------

  var toastTimer;
  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", !!isErr);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  // ---------- interface (Classic / Minimal / custom) ----------

  // Accent colors in the AE look: the action color, the blue-ish value text and the list selection.
  function accent(id, label, color, value, select, selectLine, onColor) {
    return {
      id: id, label: label, swatch: color,
      vars: { "--accent": color, "--accent-on": onColor || "#ffffff", "--value": value, "--select": select, "--select-line": selectLine }
    };
  }
  var ACCENTS = [
    { id: "blue", label: "Blue (After Effects)", swatch: "#2680eb", vars: {} },
    accent("violet", "Violet", "#7b61ff", "#a493ff", "#3b3560", "#5c4fa8"),
    accent("teal", "Teal", "#12a594", "#3ccfbd", "#1f4a46", "#2f7a72"),
    accent("amber", "Amber", "#d9821f", "#f0a54a", "#4f3b22", "#8a6230", "#141414"),
    accent("pink", "Pink", "#d6456f", "#f0789a", "#4f2a37", "#8a3e58"),
    accent("graphite", "Graphite", "#8a8a8a", "#d8d8d8", "#3d3d3d", "#5a5a5a", "#141414")
  ];

  MakiInterface.init({
    key: "makiease.interface.v1",
    title: "Makiease",
    mount: "#gear-slot",
    options: [
      { id: "values", label: "Curve values and save" },
      { id: "read", label: "Read from keyframes" },
      { id: "mode", label: "In / Out switch" },
      { id: "library", label: "Preset library" },
      { id: "tabs", label: "Presets / Mine tabs" },
      { id: "names", label: "Preset names" },
      { id: "clickApply", label: "Apply preset with one click", behavior: true }
    ],
    presets: {
      classic: { density: "comfortable", show: { clickApply: false } },
      minimal: { density: "compact", show: { values: false, read: false, mode: false, tabs: false, names: false, clickApply: true } }
    },
    accents: ACCENTS
  });

  // ---------- init ----------

  window.addEventListener("resize", layout);
  // Showing or hiding parts of the panel resizes the canvas without a window resize.
  if (window.ResizeObserver) new ResizeObserver(layout).observe(canvas.parentNode);
  layout();
  setCurve(state.v);
  renderGrid();
  requestAnimationFrame(draw);
})();
