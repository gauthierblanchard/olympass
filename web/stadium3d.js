// Stade 3D navigable (three.js) : modélisation originale inspirée de l'Orange Vélodrome.
// Tribunes en gradins, ~14 000 sièges cliquables, toit ondulé, vue depuis chaque place.
// Aucun modèle externe : toute la géométrie est générée ici.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- Dimensions (mètres) ----------
const L = 52.5; // demi-longueur du terrain
const P = 34; // demi-largeur du terrain
const ROWS = 26;
const ROW_D = 0.8; // profondeur d'une rangée
const ROW_H = 0.42; // hauteur d'une marche
const FIRST_H = 1.2; // hauteur du premier rang
const AISLE = 1.2; // allée entre deux blocs
const SEAT_W = 0.55;

const COLORS = {
  seat: new THREE.Color("#3f6f96"),
  sale: new THREE.Color("#2ee6a6"),
  mine: new THREE.Color("#f2b544"),
  selected: new THREE.Color("#ffffff"),
  hover: new THREE.Color("#b7fbe3"),
};

const STANDS = [
  { name: "Jean-Bouin", out: [0, 0, -1], u: [1, 0, 0], center: [0, 0, -P - 7], length: 104, blocs: 8 },
  { name: "Ganay", out: [0, 0, 1], u: [-1, 0, 0], center: [0, 0, P + 7], length: 104, blocs: 8 },
  { name: "Virage Nord", out: [-1, 0, 0], u: [0, 0, -1], center: [-L - 9, 0, 0], length: 64, blocs: 5 },
  { name: "Virage Sud", out: [1, 0, 0], u: [0, 0, 1], center: [L + 9, 0, 0], length: 64, blocs: 5 },
].map((s) => {
  const blocW = s.length / s.blocs;
  return {
    ...s,
    out: new THREE.Vector3(...s.out),
    u: new THREE.Vector3(...s.u),
    center: new THREE.Vector3(...s.center),
    blocW,
    perRow: Math.floor((blocW - AISLE) / SEAT_W),
  };
});

const UP = new THREE.Vector3(0, 1, 0);
const num = (v) => Number(String(v ?? "").replace(/\D/g, "")) || 1;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Position d'un siège (base du siège) dans la scène. */
function seatPosition(stand, b, r, s) {
  const along = -stand.length / 2 + b * stand.blocW + AISLE / 2 + (s - 0.5) * ((stand.blocW - AISLE) / stand.perRow);
  return stand.center
    .clone()
    .addScaledVector(stand.u, along)
    .addScaledVector(stand.out, (r - 0.5) * ROW_D)
    .addScaledVector(UP, FIRST_H + (r - 1) * ROW_H);
}

// ---------- Textures générées ----------

function pitchTexture() {
  const c = document.createElement("canvas");
  c.width = 1050;
  c.height = 680;
  const g = c.getContext("2d");
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? "#2f9e58" : "#37ad62";
    g.fillRect((i * c.width) / 14, 0, c.width / 14 + 1, c.height);
  }
  g.strokeStyle = "rgba(255,255,255,.92)";
  g.lineWidth = 4;
  const m = 10; // 1 m = 10 px
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  g.beginPath();
  g.moveTo(c.width / 2, 0);
  g.lineTo(c.width / 2, c.height);
  g.stroke();
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, 9.15 * m, 0, Math.PI * 2);
  g.stroke();
  for (const x of [0, c.width]) {
    const d = x ? -1 : 1;
    g.strokeRect(Math.min(x, x + d * 16.5 * m), c.height / 2 - 20.16 * m, 16.5 * m, 40.32 * m);
    g.strokeRect(Math.min(x, x + d * 5.5 * m), c.height / 2 - 9.16 * m, 5.5 * m, 18.32 * m);
    g.beginPath();
    g.arc(x + d * 11 * m, c.height / 2, 9.15 * m, d > 0 ? -0.93 : Math.PI - 0.93, d > 0 ? 0.93 : Math.PI + 0.93);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function textTexture(text, { w = 512, h = 128, font = "700 64px 'Space Grotesk', 'Segoe UI', sans-serif", color = "#fff", bg = null } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = font;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ledTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, c.width, 0);
  grd.addColorStop(0, "#0b1f3a");
  grd.addColorStop(0.5, "#12305a");
  grd.addColorStop(1, "#0b1f3a");
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  g.font = "700 40px 'Space Grotesk', 'Segoe UI', sans-serif";
  g.textBaseline = "middle";
  for (let x = 30; x < c.width; x += 520) {
    g.fillStyle = "#5fd0f5";
    g.fillText("olympass", x, 34);
    g.fillStyle = "#ffffff";
    g.fillText("· billets sur XRP Ledger", x + 190, 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- Géométries ----------

/** Gradins d'une tribune : profil en escalier extrudé sur la longueur. */
function standSteps(stand) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.6, 0);
  shape.lineTo(-0.6, FIRST_H);
  for (let r = 0; r < ROWS; r++) {
    const h = FIRST_H + r * ROW_H;
    shape.lineTo(r * ROW_D, h);
    shape.lineTo((r + 1) * ROW_D, h);
    if (r < ROWS - 1) shape.lineTo((r + 1) * ROW_D, h + ROW_H);
  }
  const top = FIRST_H + (ROWS - 1) * ROW_H;
  shape.lineTo(ROWS * ROW_D, top + 1.4); // muret arrière
  shape.lineTo(ROWS * ROW_D + 0.4, top + 1.4);
  shape.lineTo(ROWS * ROW_D + 0.4, 0);
  shape.lineTo(-0.6, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: stand.length, bevelEnabled: false });
  const m = new THREE.Matrix4().makeBasis(stand.out, UP, stand.u);
  m.setPosition(stand.center.clone().addScaledVector(stand.u, -stand.length / 2));
  geo.applyMatrix4(m);
  return geo;
}

/** Toit ondulé : la signature visuelle du Vélodrome. */
function roof(stand, phase) {
  const nu = 48;
  const nv = 8;
  const pos = [];
  const idx = [];
  const rearOut = ROWS * ROW_D + 3;
  const rearH = FIRST_H + ROWS * ROW_H + 8;
  const frontOut = -5;
  const frontH = 27;
  for (let i = 0; i <= nu; i++) {
    const a = i / nu;
    const along = -stand.length / 2 - 8 + a * (stand.length + 16);
    const wave = 3.2 * Math.sin(a * Math.PI * 2 * (stand.length > 80 ? 1.5 : 1) + phase);
    for (let j = 0; j <= nv; j++) {
      const b = j / nv;
      const out = rearOut + (frontOut - rearOut) * b;
      const y = rearH + (frontH - rearH) * Math.sin((b * Math.PI) / 2) + wave * b;
      const p = stand.center.clone().addScaledVector(stand.u, along).addScaledVector(stand.out, out);
      pos.push(p.x, y, p.z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k = i * (nv + 1) + j;
      idx.push(k, k + nv + 1, k + 1, k + 1, k + nv + 1, k + nv + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function seatGeometry() {
  const pan = new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.36, 0);
  const back = new THREE.BoxGeometry(0.46, 0.44, 0.06).translate(0, 0.6, 0.2);
  return mergeGeometries([pan, back]);
}

// ---------- Scène ----------

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Crée le stade dans `container`.
 * sale / mine : billets en vente au club et billets du supporter ({ nftId, seat }).
 * onSelect(info) est appelé quand un siège est sélectionné.
 */
export function createStadium(container, { sale = [], mine = [], onSelect = () => {}, onHover = () => {} } = {}) {
  const width = () => container.clientWidth || 800;
  const height = () => container.clientHeight || 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width(), height());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1f3a");
  scene.fog = new THREE.Fog("#0b1f3a", 220, 520);

  const camera = new THREE.PerspectiveCamera(48, width() / height(), 0.1, 1200);
  camera.position.set(-95, 85, 120);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minDistance = 12;
  controls.maxDistance = 300;
  controls.target.set(0, 4, 0);

  // Lumières de stade
  scene.add(new THREE.HemisphereLight("#cfe8ff", "#1b2a3a", 1.1));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(60, 140, 40);
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#9fd8ff", 0.5);
  fill.position.set(-80, 60, -60);
  scene.add(fill);

  // Sol et pelouse
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: "#16273d", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 14, 2 * P + 12), new THREE.MeshStandardMaterial({ color: "#2b8a4c", roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0;
  scene.add(apron);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, 2 * P), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.02;
  scene.add(pitch);

  // Buts
  const goalMat = new THREE.MeshStandardMaterial({ color: "#ffffff" });
  for (const sx of [-1, 1]) {
    const goal = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.07, 0.07, 2.44, 8);
    for (const z of [-3.66, 3.66]) {
      const m = new THREE.Mesh(post, goalMat);
      m.position.set(0, 1.22, z);
      goal.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 8), goalMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    goal.add(bar);
    goal.position.x = sx * L;
    scene.add(goal);
  }

  // Tribunes, panneaux LED, toits, coins
  const concrete = new THREE.MeshStandardMaterial({ color: "#c9d2dc", roughness: 0.9, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: "#f4f7fb", roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  const led = ledTexture();
  const roofs = [];
  STANDS.forEach((stand, i) => {
    scene.add(new THREE.Mesh(standSteps(stand), concrete));
    const r = new THREE.Mesh(roof(stand, i * 1.3), roofMat.clone());
    r.userData.stand = stand;
    roofs.push(r);
    scene.add(r);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(stand.length, 1),
      new THREE.MeshBasicMaterial({ map: led.clone() }),
    );
    // Dos du panneau (côté spectateurs) : sobre, sans texte inversé
    const back = new THREE.Mesh(new THREE.PlaneGeometry(stand.length, 1), new THREE.MeshStandardMaterial({ color: "#1a2b44" }));
    back.rotation.y = Math.PI;
    board.add(back);
    board.material.map.repeat.set(stand.length / 40, 1);
    board.material.map.needsUpdate = true;
    const bp = stand.center.clone().addScaledVector(stand.out, -2.2);
    board.position.set(bp.x, 0.55, bp.z);
    board.lookAt(new THREE.Vector3(0, 0.55, 0));
    scene.add(board);

    // Nom de la tribune, au-dessus du toit
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(stand.name.toUpperCase()), transparent: true, depthWrite: false }));
    const lp = stand.center.clone().addScaledVector(stand.out, ROWS * ROW_D * 0.4);
    label.position.set(lp.x, 36, lp.z);
    label.scale.set(22, 5.5, 1);
    scene.add(label);
  });
  const cornerH = (ROWS - 1) * ROW_H;
  const corners = [
    [-L, -P + 2, Math.PI],
    [L, -P + 2, Math.PI / 2],
    [L, P - 2, 0],
    [-L, P - 2, 1.5 * Math.PI],
  ];
  for (const [x, z, t0] of corners) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(9 + ROWS * ROW_D, 9, cornerH, 24, 1, true, t0, Math.PI / 2), concrete);
    cone.position.set(x, FIRST_H + cornerH / 2, z);
    scene.add(cone);
  }

  // ---------- Sièges (InstancedMesh) ----------
  const seats = [];
  for (const stand of STANDS) {
    for (let b = 0; b < stand.blocs; b++) {
      for (let r = 1; r <= ROWS; r++) {
        for (let s = 1; s <= stand.perRow; s++) seats.push({ stand, b, r, s });
      }
    }
  }
  const seatMesh = new THREE.InstancedMesh(seatGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6 }), seats.length);
  const dummy = new THREE.Object3D();
  const keyOf = (name, b, r, s) => `${name}|${b}|${r}|${s}`;
  const indexByKey = new Map();
  seats.forEach((seat, i) => {
    const p = seatPosition(seat.stand, seat.b, seat.r, seat.s);
    dummy.position.copy(p);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seat.stand.out);
    dummy.updateMatrix();
    seatMesh.setMatrixAt(i, dummy.matrix);
    seatMesh.setColorAt(i, COLORS.seat);
    indexByKey.set(keyOf(seat.stand.name, seat.b, seat.r, seat.s), i);
  });
  scene.add(seatMesh);

  // Associer chaque billet (tribune, bloc, rang, siège) à un siège 3D
  const ticketByIndex = new Map();
  const place = (t, status) => {
    const st = STANDS.find((x) => x.name === t.seat?.tribune);
    if (!st) return;
    const b = (num(t.seat.bloc) - 1) % st.blocs;
    const r = Math.min(Math.max(Number(t.seat.rang) || 1, 1), ROWS);
    let s = ((Number(t.seat.siege) || 1) - 1) % st.perRow;
    for (let k = 0; k < st.perRow; k++) {
      const i = indexByKey.get(keyOf(st.name, b, r, ((s + k) % st.perRow) + 1));
      if (!ticketByIndex.has(i)) {
        ticketByIndex.set(i, { ...t, status });
        seatMesh.setColorAt(i, status === "mine" ? COLORS.mine : COLORS.sale);
        return;
      }
    }
  };
  sale.forEach((t) => place(t, "sale"));
  mine.forEach((t) => place(t, "mine"));
  seatMesh.instanceColor.needsUpdate = true;

  // Repères flottants au-dessus des places en vente (visibles de loin)
  const pins = [];
  const pinGeo = mergeGeometries([new THREE.ConeGeometry(0.55, 1.4, 16).rotateX(Math.PI).translate(0, 0.7, 0), new THREE.SphereGeometry(0.75, 20, 14).translate(0, 1.9, 0)]);
  for (const [i, t] of ticketByIndex) {
    const color = t.status === "mine" ? COLORS.mine : COLORS.sale;
    const pin = new THREE.Mesh(pinGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65 }));
    seatMesh.getMatrixAt(i, dummy.matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(dummy.matrix);
    pin.position.set(p.x, p.y + 1.6, p.z);
    pin.userData = { index: i, baseY: p.y + 1.6, phase: Math.random() * 6 };
    scene.add(pin);
    pins.push(pin);
  }

  // ---------- Interaction ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = -1;
  let selected = -1;
  let down = null;

  const colorFor = (i) => {
    if (i === selected) return COLORS.selected;
    const t = ticketByIndex.get(i);
    if (i === hovered && t) return COLORS.hover;
    return t ? (t.status === "mine" ? COLORS.mine : COLORS.sale) : COLORS.seat;
  };
  const repaint = (...ids) => {
    ids.filter((i) => i >= 0).forEach((i) => seatMesh.setColorAt(i, colorFor(i)));
    seatMesh.instanceColor.needsUpdate = true;
  };

  function infoFor(i) {
    const seat = seats[i];
    const t = ticketByIndex.get(i);
    const prefix = { "Jean-Bouin": "J", Ganay: "G", "Virage Nord": "N", "Virage Sud": "S" }[seat.stand.name];
    return {
      index: i,
      nftId: t?.nftId ?? null,
      status: t ? t.status : "unavailable",
      tribune: seat.stand.name,
      bloc: t?.seat?.bloc ?? `${prefix}${seat.b + 1}`,
      rang: t?.seat?.rang ?? seat.r,
      siege: t?.seat?.siege ?? seat.s,
      prix: t?.seat?.prix ?? null,
    };
  }

  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const pinHit = raycaster.intersectObjects(pins, false)[0];
    if (pinHit) return pinHit.object.userData.index;
    const hit = raycaster.intersectObject(seatMesh, false)[0];
    return hit ? hit.instanceId : -1;
  }

  const onMove = (ev) => {
    if (down) return;
    const i = pick(ev);
    if (i === hovered) return;
    const prev = hovered;
    hovered = i;
    repaint(prev, i);
    renderer.domElement.style.cursor = i >= 0 ? "pointer" : "grab";
    onHover(i >= 0 ? { ...infoFor(i), x: ev.clientX, y: ev.clientY } : null);
  };
  const onDown = (ev) => (down = { x: ev.clientX, y: ev.clientY });
  const onUp = (ev) => {
    const moved = down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5;
    down = null;
    if (moved) return;
    const i = pick(ev);
    if (i < 0) return;
    select(i);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointerleave", () => onHover(null));

  function select(i) {
    const prev = selected;
    selected = i;
    repaint(prev, i);
    onSelect(infoFor(i));
  }

  // ---------- Caméra : vols animés et vue depuis la place ----------
  let flight = null;
  let pov = false;

  function flyTo(position, target, duration = 1400) {
    flight = { from: camera.position.clone(), fromT: controls.target.clone(), to: position, toT: target, t0: performance.now(), duration };
  }

  function setPov(on) {
    pov = on;
    controls.enableZoom = !on;
    controls.enablePan = !on;
    controls.minDistance = 0.01; // rétabli à 12 à la fin du vol vers la vue d'ensemble
    controls.maxPolarAngle = on ? Math.PI * 0.62 : Math.PI / 2.08;
    controls.rotateSpeed = on ? -0.32 : 1;
  }

  function seatEye(i) {
    seatMesh.getMatrixAt(i, dummy.matrix);
    return new THREE.Vector3().setFromMatrixPosition(dummy.matrix).add(new THREE.Vector3(0, 1.25, 0));
  }

  const api = {
    overview() {
      setPov(false);
      flyTo(new THREE.Vector3(-95, 85, 120), new THREE.Vector3(0, 4, 0));
    },
    focusStand(name) {
      const st = STANDS.find((s) => s.name === name);
      if (!st) return api.overview();
      setPov(false);
      const target = st.center.clone().addScaledVector(st.out, ROWS * ROW_D * 0.5).setY(7);
      const pos = st.center.clone().addScaledVector(st.out, -(st.length > 80 ? 70 : 95)).setY(38);
      flyTo(pos, target);
    },
    /** Vue depuis le siège sélectionné (ou un index donné). */
    viewFromSeat(i = selected) {
      if (i < 0) return;
      const eye = seatEye(i);
      const look = new THREE.Vector3(0, 0, 0).sub(eye).normalize();
      setPov(true);
      flyTo(eye, eye.clone().addScaledVector(look, 0.6), 1800);
    },
    /** Sélectionne et montre la place d'un billet donné. */
    showTicket(nftId, { pov: wantPov = true } = {}) {
      for (const [i, t] of ticketByIndex) {
        if (t.nftId === nftId) {
          select(i);
          if (wantPov) api.viewFromSeat(i);
          return true;
        }
      }
      return false;
    },
    get pov() {
      return pov;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => {
          m.map?.dispose?.();
          m.dispose?.();
        });
      });
      renderer.domElement.remove();
    },
  };

  // ---------- Boucle de rendu ----------
  const ro = new ResizeObserver(() => {
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
  });
  ro.observe(container);

  let raf = 0;
  const clock = new THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    if (flight) {
      const k = Math.min(1, (performance.now() - flight.t0) / flight.duration);
      const e = ease(k);
      camera.position.lerpVectors(flight.from, flight.to, e);
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      // Arc au-dessus du stade pendant le vol, pour une transition cinématique
      camera.position.y += Math.sin(Math.PI * e) * (pov ? 18 : 10);
      if (k >= 1) {
        flight = null;
        if (!pov) controls.minDistance = 12;
      }
    }
    // Le toit situé entre la caméra et le terrain s'estompe pour laisser voir les sièges
    const flat = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    const far = flat.length() > 40;
    for (const r of roofs) {
      const side = r.userData.stand.out.dot(flat.clone().normalize());
      const target = pov ? 0.93 : far && side > 0.35 ? 0.12 : 0.93;
      r.material.opacity += (target - r.material.opacity) * 0.12;
      r.material.depthWrite = r.material.opacity > 0.5;
    }
    for (const pin of pins) {
      pin.position.y = pin.userData.baseY + Math.sin(t * 2.2 + pin.userData.phase) * 0.35;
      pin.rotation.y = t * 0.8;
      pin.visible = !pov || pin.userData.index !== selected;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return api;
}
