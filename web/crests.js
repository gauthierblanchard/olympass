// Écussons stylisés aux couleurs des équipes. Création originale : ce ne sont pas les logos
// officiels (marques déposées), seulement les initiales et les couleurs des clubs.

const TEAMS = {
  OM: { label: "OM", top: "#2aa7df", bottom: "#ffffff", ink: "#ffffff", stroke: "#0b1f3a", band: "#ffffff" },
  PSG: { label: "PSG", top: "#0b2a5b", bottom: "#0b2a5b", ink: "#ffffff", stroke: "#0b1f3a", band: "#d4213d" },
};

export function crest(code, size = 56) {
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
