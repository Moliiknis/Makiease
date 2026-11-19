// Built-in curves as cubic-bezier control points [x1, y1, x2, y2].
window.FLOW_PRESETS = [
  { name: "linear",      v: [0, 0, 1, 1] },
  { name: "ease",        v: [0.25, 0.1, 0.25, 1] },
  { name: "ease in",     v: [0.42, 0, 1, 1] },
  { name: "ease out",    v: [0, 0, 0.58, 1] },
  { name: "ease in-out", v: [0.42, 0, 0.58, 1] },

  { name: "sine in",     v: [0.12, 0, 0.39, 0] },
  { name: "sine out",    v: [0.61, 1, 0.88, 1] },
  { name: "sine io",     v: [0.37, 0, 0.63, 1] },

  { name: "quad in",     v: [0.11, 0, 0.5, 0] },
  { name: "quad out",    v: [0.5, 1, 0.89, 1] },
  { name: "quad io",     v: [0.45, 0, 0.55, 1] },

  { name: "cubic in",    v: [0.32, 0, 0.67, 0] },
  { name: "cubic out",   v: [0.33, 1, 0.68, 1] },
  { name: "cubic io",    v: [0.65, 0, 0.35, 1] },

  { name: "quart in",    v: [0.5, 0, 0.75, 0] },
  { name: "quart out",   v: [0.25, 1, 0.5, 1] },
  { name: "quart io",    v: [0.76, 0, 0.24, 1] },

  { name: "quint in",    v: [0.64, 0, 0.78, 0] },
  { name: "quint out",   v: [0.22, 1, 0.36, 1] },
  { name: "quint io",    v: [0.83, 0, 0.17, 1] },

  { name: "expo in",     v: [0.7, 0, 0.84, 0] },
  { name: "expo out",    v: [0.16, 1, 0.3, 1] },
  { name: "expo io",     v: [0.87, 0, 0.13, 1] },

  { name: "circ in",     v: [0.55, 0, 1, 0.45] },
  { name: "circ out",    v: [0, 0.55, 0.45, 1] },
  { name: "circ io",     v: [0.85, 0, 0.15, 1] },

  { name: "back in",     v: [0.36, 0, 0.66, -0.56] },
  { name: "back out",    v: [0.34, 1.56, 0.64, 1] },
  { name: "back io",     v: [0.68, -0.6, 0.32, 1.6] },

  { name: "snap",        v: [0.9, 0, 0.1, 1] },
  { name: "smooth",      v: [0.33, 0, 0.1, 1] },
  { name: "punch",       v: [0.05, 0.7, 0.1, 1] }
];
