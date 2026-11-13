const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const regionsEl = document.getElementById("regions");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const nameInput = document.getElementById("name");
const kindInput = document.getElementById("kind");

const COLORS = {
  playable: "#c9a227", field: "#6f8f4e", terrace: "#a9543f", building: "#8e4a3a",
  library: "#3f6fa8", science: "#9b4a3a", path: "#b9bcbe", "base-red": "#c0392b",
  "base-blue": "#2f5fb3", hazard: "#3f76c9", other: "#8f8c84",
};
const LABELS = {
  playable: "playable", field: "field", terrace: "terraces", building: "building",
  library: "library", science: "science", path: "path", "base-red": "red base",
  "base-blue": "blue base", hazard: "hazard", other: "other",
};

const state = {
  images: {},
  useZones: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: null,
  pan: null,
  regions: [],
  next: 1,
};

const image = () => state.useZones ? state.images.zones : state.images.official;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function stageSize() {
  return { w: stage.clientWidth, h: stage.clientHeight };
}
function fitScale() {
  const im = image();
  if (!im) return 1;
  const { w, h } = stageSize();
  return Math.min((w - 36) / im.naturalWidth, (h - 36) / im.naturalHeight);
}
function view() {
  const im = image();
  const { w, h } = stageSize();
  const s = fitScale() * state.zoom;
  return {
    s,
    ox: (w - im.naturalWidth * s) / 2 + state.panX,
    oy: (h - im.naturalHeight * s) / 2 + state.panY,
  };
}
function screenToImage(clientX, clientY) {
  const im = image();
  const rect = canvas.getBoundingClientRect();
  const v = view();
  return {
    x: clamp((clientX - rect.left - v.ox) / v.s, 0, im.naturalWidth),
    y: clamp((clientY - rect.top - v.oy) / v.s, 0, im.naturalHeight),
  };
}
function imageToScreen(x, y) {
  const v = view();
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + v.ox + x * v.s, y: rect.top + v.oy + y * v.s };
}
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { w, h } = stageSize();
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const im = image();
  if (!im) return;
  const v = view();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, v.ox, v.oy, im.naturalWidth * v.s, im.naturalHeight * v.s);

  for (const r of state.regions) drawRegion(r);
  if (state.drag) {
    const r = dragRect();
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = COLORS[kindInput.value] || COLORS.other;
    ctx.fillStyle = (COLORS[kindInput.value] || COLORS.other) + "33";
    ctx.fillRect(v.ox + r.x * v.s, v.oy + r.y * v.s, r.w * v.s, r.h * v.s);
    ctx.strokeRect(v.ox + r.x * v.s, v.oy + r.y * v.s, r.w * v.s, r.h * v.s);
    ctx.restore();
  }
}

function drawRegion(r) {
  const v = view();
  const color = COLORS[r.kind] || COLORS.other;
  const x = v.ox + r.x * v.s, y = v.oy + r.y * v.s;
  const w = r.w * v.s, h = r.h * v.s;
  ctx.fillStyle = color + "33";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.font = "11px ui-monospace, monospace";
  const text = r.name;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(10,14,18,.82)";
  ctx.fillRect(x + 3, y + 3, tw + 8, 15);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + 7, y + 14);
}

function dragRect() {
  const d = state.drag;
  if (!d) return { x: 0, y: 0, w: 0, h: 0 };
  return {
    x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0),
  };
}

function renderRegions() {
  regionsEl.textContent = "";
  emptyEl.style.display = state.regions.length ? "none" : "block";
  countEl.textContent = state.regions.length;
  state.regions.forEach((r, index) => {
    const el = document.createElement("div");
    el.className = "region";

    const top = document.createElement("div");
    top.className = "top";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = COLORS[r.kind] || COLORS.other;
    const name = document.createElement("input");
    name.value = r.name;
    name.addEventListener("input", () => { r.name = name.value || "Region"; draw(); });
    const del = document.createElement("button");
    del.textContent = "x";
    del.title = "Delete region";
    del.addEventListener("click", () => {
      state.regions.splice(index, 1);
      renderRegions();
      draw();
    });
    top.append(dot, name, del);

    const kind = document.createElement("select");
    for (const [value, label] of Object.entries(LABELS)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if (value === r.kind) opt.selected = true;
      kind.appendChild(opt);
    }
    kind.addEventListener("change", () => {
      r.kind = kind.value;
      dot.style.background = COLORS[r.kind];
      draw();
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${Math.round(r.x)},${Math.round(r.y)} · ${Math.round(r.w)}×${Math.round(r.h)}</span><span>${LABELS[r.kind] || r.kind}</span>`;

    el.append(top, kind, meta);
    regionsEl.appendChild(el);
  });
}

function createRegion(a, b) {
  const r = {
    name: nameInput.value.trim() || `Region ${state.next}`,
    kind: kindInput.value,
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  };
  if (r.w < 5 || r.h < 5) return;
  state.regions.push(r);
  state.next++;
  nameInput.value = `Region ${state.next}`;
  renderRegions();
  draw();
}

function exportRegions() {
  const im = image();
  const data = {
    source: state.useZones ? "campus-zones-annotated.png" : "campus-map-2024.png",
    image: [im.naturalWidth, im.naturalHeight],
    note: "Rectangles are in source-image pixels; norm is x/y/w/h divided by image size.",
    regions: state.regions.map((r) => ({
      name: r.name, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h,
      norm: {
        x: r.x / im.naturalWidth, y: r.y / im.naturalHeight,
        w: r.w / im.naturalWidth, h: r.h / im.naturalHeight,
      },
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "campus-regions.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("failed " + src));
    im.src = src;
  });
}

async function main() {
  const [official, zones] = await Promise.all([
    loadImage("/campus.png"), loadImage("/campus-annotated.png"),
  ]);
  state.images = { official, zones };
  resize();

  window.addEventListener("resize", resize);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = screenToImage(e.clientX, e.clientY);
    const oldScreen = imageToScreen(p.x, p.y);
    state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.6, 5);
    const newScreen = imageToScreen(p.x, p.y);
    state.panX += oldScreen.x - newScreen.x;
    state.panY += oldScreen.y - newScreen.y;
    draw();
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      state.pan = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
      return;
    }
    if (e.button !== 0) return;
    state.drag = { ...screenToImage(e.clientX, e.clientY) };
    const p = screenToImage(e.clientX, e.clientY);
    state.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });

  window.addEventListener("mousemove", (e) => {
    if (state.pan) {
      state.panX = state.pan.px + e.clientX - state.pan.x;
      state.panY = state.pan.py + e.clientY - state.pan.y;
      draw();
      return;
    }
    if (!state.drag) return;
    const p = screenToImage(e.clientX, e.clientY);
    state.drag.x1 = p.x;
    state.drag.y1 = p.y;
    draw();
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) { state.pan = null; return; }
    if (e.button !== 0 || !state.drag) return;
    const r = dragRect();
    const start = state.drag;
    state.drag = null;
    if (r.w * view().s > 5 && r.h * view().s > 5) {
      createRegion({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
    } else {
      draw();
    }
  });

  document.getElementById("toggle").addEventListener("click", (e) => {
    state.useZones = !state.useZones;
    e.currentTarget.textContent = state.useZones ? "Show official" : "Show zones";
    draw();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.zoom = 1; state.panX = 0; state.panY = 0; draw();
  });
  document.getElementById("clear").addEventListener("click", () => {
    if (!state.regions.length || !confirm("Clear all regions?")) return;
    state.regions = []; state.next = 1; renderRegions(); draw();
  });
  document.getElementById("export").addEventListener("click", exportRegions);
  renderRegions();
}

main().catch((err) => {
  document.getElementById("hint").textContent = "load error: " + err.message;
  console.error(err);
});
