// Écussons stylisés aux couleurs des équipes. Création originale : ce ne sont pas les logos
// officiels (marques déposées), seulement les initiales et les couleurs des clubs.

const TEAMS = {
  OM: { label: "OM", top: "#2aa7df", bottom: "#ffffff", ink: "#ffffff", stroke: "#0b1f3a", band: "#ffffff" },
  PSG: { label: "PSG", top: "#0b2a5b", bottom: "#0b2a5b", ink: "#ffffff", stroke: "#0b1f3a", band: "#d4213d" },
};

// Logos fournis localement par l'équipe (web/img/logos/om.png, psg.png), exclus de Git.
// S'ils sont absents, on affiche les écussons stylisés ci-dessous.
const localLogos = {};

export async function detectLocalLogos() {
  for (const code of Object.keys(TEAMS)) {
    for (const ext of ["png", "svg", "webp"]) {
      const url = `img/logos/${code.toLowerCase()}.${ext}`;
      try {
        const r = await fetch(url, { method: "HEAD" });
        if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) {
          localLogos[code] = url;
          break;
        }
      } catch {}
    }
  }
}

export function crest(code, size = 56) {
  if (localLogos[code]) {
    return `<img src="${localLogos[code]}" alt="${code}" width="${size}" height="${size}" style="object-fit:contain;flex:none" />`;
  }
  if (code === "OM") return omCrest(size);
  const t = TEAMS[code];
  const id = `cr-${code}-${size}`;
  const shield = "M50 4 L92 16 V52 C92 78 72 94 50 102 C28 94 8 78 8 52 V16 Z";
  return `<svg width="${size}" height="${Math.round(size * 1.06)}" viewBox="0 0 100 106" role="img" aria-label="${t.label}">
    <defs><clipPath id="${id}"><path d="${shield}"/></clipPath></defs>
    <g clip-path="url(#${id})">
      <rect width="100" height="106" fill="${t.top}"/>
      ${code === "OM"
        ? `<rect y="64" width="100" height="42" fill="${t.bottom}"/><rect y="60" width="100" height="6" fill="#0b1f3a" opacity=".15"/>`
        : `<rect x="40" width="20" height="106" fill="${t.band}"/><rect x="36" width="4" height="106" fill="#fff"/><rect x="60" width="4" height="106" fill="#fff"/>`}
    </g>
    <path d="${shield}" fill="none" stroke="${t.stroke}" stroke-width="4"/>
    <text x="50" y="${code === "OM" ? 50 : 60}" text-anchor="middle" font-family="Segoe UI, Arial Black, sans-serif" font-weight="900"
      font-size="${code === "OM" ? 34 : 26}" fill="${t.ink}" stroke="#0b1f3a" stroke-width="${code === "OM" ? 1.5 : 0}" letter-spacing="1">${t.label}</text>
    ${code === "OM" ? `<path d="M30 80 Q50 92 70 80" stroke="#2aa7df" stroke-width="5" fill="none" stroke-linecap="round"/>` : ""}
  </svg>`;
}

/** Étoile à cinq branches centrée en (cx, cy). */
function star(cx, cy, r) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return pts.join(" ");
}

/** Écusson OM : blason bleu ciel et blanc surmonté d'une étoile dorée. */
function omCrest(size) {
  const id = `cr-om-${size}`;
  const shield = "M50 26 L90 36 V70 C90 96 72 112 50 120 C28 112 10 96 10 70 V36 Z";
  return `<svg width="${Math.round(size * 0.85)}" height="${size}" viewBox="0 0 100 124" role="img" aria-label="OM" style="flex:none">
    <defs>
      <clipPath id="${id}"><path d="${shield}"/></clipPath>
      <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2b200"/></linearGradient>
    </defs>
    <polygon points="${star(50, 13, 13)}" fill="url(#${id}-g)" stroke="#b37f00" stroke-width="1.2" stroke-linejoin="round"/>
    <g clip-path="url(#${id})">
      <rect width="100" height="124" fill="#2aa7df"/>
      <path d="M0 92 Q50 78 100 92 V124 H0 Z" fill="#ffffff"/>
      <path d="M0 98 Q50 84 100 98" stroke="#2aa7df" stroke-width="3" fill="none" opacity=".5"/>
    </g>
    <path d="${shield}" fill="none" stroke="#ffffff" stroke-width="3"/>
    <path d="${shield}" fill="none" stroke="#0b1f3a" stroke-width="1.5" transform="translate(50 73) scale(1.04) translate(-50 -73)"/>
    <text x="50" y="76" text-anchor="middle" font-family="Segoe UI, Arial Black, sans-serif" font-weight="900" font-size="36"
      fill="#ffffff" stroke="#0b1f3a" stroke-width="1.2" letter-spacing="-1">OM</text>
  </svg>`;
}
