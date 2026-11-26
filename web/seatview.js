// Vue 3D depuis la place : projection perspective du terrain et des tribunes,
// calculée à partir de la tribune, du bloc et du rang. Rendu original, sans donnée externe.

const W = 680;
const H = 400;
const L = 52.5; // demi-longueur du terrain (m)
const P = 34; // demi-largeur du terrain (m)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const n = Math.hypot(...a);
  return a.map((v) => v / n);
};

/** Position de la caméra selon la tribune : x = longueur, y = hauteur, z = largeur. */
function cameraFor(seat) {
  const rang = Math.max(1, Number(seat.rang) || 1);
  const blocNum = Number(String(seat.bloc ?? "").replace(/\D/g, "")) || 5;
  const along = ((blocNum % 10) - 4.5) * 7; // décalage le long de la tribune
  const back = 16 + rang * 0.9; // recul depuis la ligne de touche
  const height = 6 + rang * 0.8; // hauteur de l'œil
  switch (seat.tribune) {
    case "Ganay":
      return { eye: [along, height, P + back], target: [along * 0.4, 0, 0] };
    case "Virage Nord":
      return { eye: [-L - back, height, along * 0.6], target: [0, 0, along * 0.2] };
    case "Virage Sud":
      return { eye: [L + back, height, along * 0.6], target: [0, 0, along * 0.2] };
    default: // Jean-Bouin
      return { eye: [along, height, -P - back], target: [along * 0.4, 0, 0] };
  }
}

function makeProjector(eye, target) {
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const focal = 330;
  return (p) => {
    const v = sub(p, eye);
    const z = dot(v, f);
    if (z < 0.5) return null;
    return [W / 2 + (focal * dot(v, r)) / z, H * 0.48 - (focal * dot(v, u)) / z, z];
  };
}

function poly(project, pts, attrs) {
  const proj = pts.map(project);
  if (proj.some((p) => !p)) return null;
  const depth = proj.reduce((s, p) => s + p[2], 0) / proj.length;
  return { depth, svg: `<polygon points="${proj.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" ${attrs}/>` };
}

function line(project, a, b, attrs) {
  const pa = project(a);
  const pb = project(b);
  if (!pa || !pb) return "";
  return `<line x1="${pa[0].toFixed(1)}" y1="${pa[1].toFixed(1)}" x2="${pb[0].toFixed(1)}" y2="${pb[1].toFixed(1)}" ${attrs}/>`;
}

function polyline(project, pts, attrs) {
  const proj = pts.map(project);
  if (proj.some((p) => !p)) return "";
  return `<polyline points="${proj.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" ${attrs}/>`;
}

export function seatView3D(seat) {
  const { eye, target } = cameraFor(seat);
  const project = makeProjector(eye, target);
  const shapes = [];

  // Tribunes : un gradin incliné de chaque côté, en plusieurs niveaux pour l'effet de rangées.
  const stands = [
    { name: "Jean-Bouin", a: [-L - 4, 0, -P - 6], b: [L + 4, 0, -P - 6], out: [0, 0, -1] },
    { name: "Ganay", a: [L + 4, 0, P + 6], b: [-L - 4, 0, P + 6], out: [0, 0, 1] },
    { name: "Virage Nord", a: [-L - 6, 0, P + 4], b: [-L - 6, 0, -P - 4], out: [-1, 0, 0] },
    { name: "Virage Sud", a: [L + 6, 0, -P - 4], b: [L + 6, 0, P + 4], out: [1, 0, 0] },
  ];
  const tiers = 6;
  for (const s of stands) {
    if (s.name === seat.tribune) continue; // on est assis dedans
    for (let i = 0; i < tiers; i++) {
      const d0 = i * 6;
      const d1 = (i + 1) * 6;
      const h0 = i * 4.2;
      const h1 = (i + 1) * 4.2;
      const off = (p, d, h) => [p[0] + s.out[0] * d, h, p[2] + s.out[2] * d];
      const shade = i % 2 ? "#1b3b66" : "#22497c";
      const q = poly(project, [off(s.a, d0, h0), off(s.b, d0, h0), off(s.b, d1, h1), off(s.a, d1, h1)], `fill="${shade}"`);
      if (q) shapes.push(q);
    }
    // Toit
    const off = (p, d, h) => [p[0] + s.out[0] * d, h, p[2] + s.out[2] * d];
    const roof = poly(project, [off(s.a, 6, 30), off(s.b, 6, 30), off(s.b, 38, 32), off(s.a, 38, 32)], `fill="#e9eef4" fill-opacity=".9"`);
    if (roof) shapes.push(roof);
  }

  // Pelouse avec bandes de tonte
  const grass = [];
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    const x0 = -L - 4 + ((2 * L + 8) * i) / stripes;
    const x1 = -L - 4 + ((2 * L + 8) * (i + 1)) / stripes;
    const q = poly(project, [[x0, 0, -P - 4], [x1, 0, -P - 4], [x1, 0, P + 4], [x0, 0, P + 4]], `fill="${i % 2 ? "#2f9e58" : "#38ad63"}"`);
    if (q) grass.push(q.svg);
  }

  // Lignes du terrain
  const W2 = `stroke="#fff" stroke-width="1.6" stroke-opacity=".9" fill="none"`;
  const lines = [
    polyline(project, [[-L, 0, -P], [L, 0, -P], [L, 0, P], [-L, 0, P], [-L, 0, -P]], W2),
    line(project, [0, 0, -P], [0, 0, P], W2),
    polyline(project, Array.from({ length: 41 }, (_, i) => [9.15 * Math.cos((i / 40) * 2 * Math.PI), 0, 9.15 * Math.sin((i / 40) * 2 * Math.PI)]), W2),
  ];
  for (const sx of [-1, 1]) {
    const x = sx * L;
    lines.push(polyline(project, [[x, 0, -20.16], [x - sx * 16.5, 0, -20.16], [x - sx * 16.5, 0, 20.16], [x, 0, 20.16]], W2));
    lines.push(polyline(project, [[x, 0, -9.16], [x - sx * 5.5, 0, -9.16], [x - sx * 5.5, 0, 9.16], [x, 0, 9.16]], W2));
    lines.push(polyline(project, [[x, 0, -3.66], [x, 2.44, -3.66], [x, 2.44, 3.66], [x, 0, 3.66]], `stroke="#fff" stroke-width="2.4" fill="none"`));
  }

  shapes.sort((a, b) => b.depth - a.depth);
  const pos = `${seat.tribune} · Bloc ${seat.bloc} · Rang ${seat.rang}`.replace(/[&<>"']/g, "");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vue depuis ${pos}" style="display:block;width:100%;height:auto">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f3a"/><stop offset="1" stop-color="#2c5d93"/></linearGradient>
      <radialGradient id="glow" cx=".5" cy=".1" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${grass.join("")}
    ${lines.join("")}
    ${shapes.map((s) => s.svg).join("")}
    <rect x="12" y="${H - 40}" rx="10" width="${pos.length * 7.2 + 24}" height="28" fill="#0b1f3a" fill-opacity=".8"/>
    <text x="24" y="${H - 21}" fill="#fff" font-size="13" font-weight="700" font-family="Segoe UI, sans-serif">${pos}</text>
  </svg>`;
}
