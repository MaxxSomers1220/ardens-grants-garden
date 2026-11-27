import * as THREE from "./vendor/three-0.180.0/three.module.min.js";
import { addGlobeCrops } from "./garden-globe-crops.js";
import { createDeadlineTerrace } from "./garden-3d-deadline-terrace.js";

const up = new THREE.Vector3(0, 1, 0);
const defaultPose = { yaw: -.33, pitch: .73, zoom: 1 };
const deadlinePose = { yaw: .22, pitch: .66, zoom: 1 };
const { clamp, lerp } = THREE.MathUtils;
const gestureThreshold = 6;

function loop(width, depth, roundness, elevation, waviness, phase) {
  return Array.from({ length: 64 }, (_, index) => {
    const angle = 2 * Math.PI * index / 64;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const ripple = waviness * (.65 * Math.sin(3 * angle + phase) + .35 * Math.cos(7 * angle - phase));
    const x = Math.sign(cosine) * (width / 2 + ripple) * Math.abs(cosine) ** roundness
      + waviness * .32 * Math.sin(angle + phase);
    const z = Math.sign(sine) * (depth / 2 + ripple) * Math.abs(sine) ** roundness
      + waviness * .26 * Math.cos(2 * angle - phase);
    return new THREE.Vector3(x, elevation(x, z), z);
  });
}

function createSurface() {
  const vertices = [];
  const colors = [];
  function triangle(a, b, c, color) {
    for (const point of [a, b, c]) {
      const tint = typeof color === "function" ? color(point) : color;
      vertices.push(point.x, point.y, point.z);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  function quad(a, b, c, d, color) {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  }
  function band(inner, outer, tint) {
    for (let index = 0; index < inner.length; index++) {
      const next = (index + 1) % inner.length;
      quad(inner[index], inner[next], outer[next], outer[index], tint(index));
    }
  }
  function wall(lower, upper, tint) {
    for (let index = 0; index < lower.length; index++) {
      const next = (index + 1) % lower.length;
      quad(lower[index], upper[index], upper[next], lower[next], tint(index));
    }
  }
  function cover(edge, elevation, tint, [originX, originZ] = [0, 0]) {
    const center = new THREE.Vector3(originX, elevation(originX, originZ), originZ);
    const rings = [.19, .38, .56, .74, .89].map(fraction => edge.map(point => {
      const x = originX + (point.x - originX) * fraction;
      const z = originZ + (point.z - originZ) * fraction;
      return new THREE.Vector3(x, elevation(x, z), z);
    }));
    rings.push(edge);
    for (let index = 0; index < edge.length; index++) {
      const next = (index + 1) % edge.length;
      triangle(center, rings[0][next], rings[0][index], tint);
    }
    for (let index = 1; index < rings.length; index++) {
      band(rings[index - 1], rings[index], () => tint);
    }
  }
  function ribbon(start, end, steps, point, width, tint) {
    let left = point(start, -width(start));
    let right = point(start, width(start));
    for (let index = 1; index <= steps; index++) {
      const at = lerp(start, end, index / steps);
      const nextLeft = point(at, -width(at));
      const nextRight = point(at, width(at));
      quad(left, nextLeft, nextRight, right, tint(index));
      left = nextLeft;
      right = nextRight;
    }
  }
  function mesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
  return { triangle, band, wall, cover, ribbon, mesh };
}

function addTrail(surface, coordinates, elevation, color, edge, size = 1) {
  const route = new THREE.CatmullRomCurve3(
    coordinates.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "chordal");
  function point(t, offset, lift) {
    const position = route.getPoint(t);
    const direction = route.getTangent(t);
    position.x += direction.z * offset;
    position.z -= direction.x * offset;
    position.y = elevation(position.x, position.z) + lift;
    return position;
  }
  const halfWidth = t => size * (.078 + .155 * Math.sin(Math.PI * t) ** .64 + .016 * Math.sin(t * 16));
  surface.ribbon(0, 1, 44, (t, width) => point(t, width, .027), halfWidth, () => edge);
  surface.ribbon(.014, .986, 43, (t, width) => point(t, width, .032),
    t => halfWidth(t) * .77, index => color.clone().multiplyScalar(.98 + .029 * Math.cos(index * 1.9)));
}

function groundShadow(edge, tint) {
  const level = Math.min(...edge.map(point => point.y)) - .013;
  const rings = [[.54, .19], [.83, .15], [1.02, .083], [1.19, 0]];
  const positions = [.21, level, .04];
  const colors = [tint.r, tint.g, tint.b, .20];
  const indices = [];
  for (const [ring, [extent, opacity]] of rings.entries()) {
    for (const [index, point] of edge.entries()) {
      positions.push(point.x * extent + .21, level, point.z * extent + .04);
      colors.push(tint.r, tint.g, tint.b, opacity);
      const current = 1 + ring * edge.length + index;
      const next = 1 + ring * edge.length + (index + 1) % edge.length;
      if (ring === 0) indices.push(0, next, current);
      else indices.push(current - edge.length, next - edge.length, next, current - edge.length, next, current);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
}

function bedLayout(bed, plotGroup, paint) {
  const width = 10.8;
  const depth = 7.8;
  const phase = bed.id.charCodeAt(0) * .16 + bed.id.length * .27;
  const soilTop = (x, z) => .32 + .038 * Math.sin(x * .61 + z * .50) - .016 * z;
  const lawnTop = (x, z) => -.031 + .078 * Math.sin(x * .61 - z * .47) + .031 * Math.cos(z * .88);
  const plot = {
    bed, width, depth,
    normalAt: () => up,
    point: (x, z, rise = 0) => new THREE.Vector3(x, soilTop(x, z) + rise, z),
  };
  const color = (token, fallback) => new THREE.Color(paint[token] || fallback);
  const earth = color("soil", "#6B4A2F").lerp(color("ink", "#2E3A45"), .24);
  const loam = color("dry", "#8A6B45");
  const green = color("leaf", "#5B8C4A");
  const sap = color("hillGreen", "#69A84F");
  const deep = color("evergreen", "#3E6B34");
  const cream = color("cream", "#F7F1E3");
  const sunlit = color("sunshineGround", "#F5E98A");
  const stream = color("water", "#5A8FA8");
  const wavyColor = (base, weight, index) =>
    base.clone().multiplyScalar(1 + weight * (.68 * Math.sin(index * 1.61) + .32 * Math.cos(index * 2.3)));

  const solid = createSurface();
  const surfaceWidth = width + 3.02;
  const surfaceDepth = depth + 2.45;
  const strata = [
    loop(surfaceWidth - 1.03, surfaceDepth - .98, .63, (x, z) =>
      -.54 + .079 * Math.sin(x * .76 + z * .45), .30, phase + .25),
    loop(surfaceWidth - .53, surfaceDepth - .49, .61, (x, z) =>
      -.38 + .055 * Math.sin(x * 1.32 + z * 1.1), .33, phase + .16),
    loop(surfaceWidth - .14, surfaceDepth - .10, .62, (x, z) =>
      lawnTop(x, z) - .22 + .032 * Math.sin(x * .89 + z * .69), .35, phase),
    loop(surfaceWidth, surfaceDepth, .58, (x, z) =>
      lawnTop(x, z) - .075 + .025 * Math.cos(x * 1.25 - z * 2.01), .36, phase),
    loop(surfaceWidth + .02, surfaceDepth + .04, .58, lawnTop, .36, phase),
  ];
  const shale = [earth.clone().multiplyScalar(.80), earth.clone().lerp(loam, .32),
    earth.clone().lerp(loam, .20), earth.clone().lerp(deep, .55)];
  for (let index = 0; index < strata.length - 1; index++) {
    solid.wall(strata[index], strata[index + 1], segment =>
      wavyColor(shale[index], .125, segment * .71 + 4 * index));
  }
  const lawn = green.clone().lerp(sap, .49).lerp(sunlit, .11);
  const meadow = lawn.clone().lerp(sunlit, .21);
  solid.cover(strata[4], lawnTop, ({ x, z }) =>
    lawn.clone().lerp(meadow, .30 + .25 * Math.cos(x * .62 + z * .78) + .15 * Math.sin(z * 1.51 - x * 1.1)));

  const trim = loam.clone().lerp(earth, .21);
  const walk = loam.clone().lerp(sunlit, .46).lerp(cream, .14);
  addTrail(solid, [[-4.35, 4.64], [-5.38, 4.2], [-6.12, 2.70], [-6.19, .72],
    [-6.06, -1.31], [-5.83, -3.02], [-4.55, -4.10], [-2.92, -4.67]], lawnTop, walk, trim);
  addTrail(solid, [[3.72, 4.57], [4.68, 4.34], [5.65, 3.68], [6.14, 2.34],
    [6.47, 1.02]], lawnTop, walk, trim);

  const pad = loam.clone().lerp(earth, .20).lerp(green, .46).lerp(deep, .08);
  const soilShadow = earth.clone().lerp(deep, .23);
  const soilHighlight = pad.clone().lerp(sunlit, .14).lerp(green, .15);
  const foot = loop(width + .80, depth + .78, .42, lawnTop, .14, phase + .2);
  const bank = loop(width + .56, depth + .57, .38, (x, z) =>
    lerp(lawnTop(x, z), soilTop(x, z), .58), .15, phase + .1);
  const soilEdge = loop(width + .31, depth + .30, .36, soilTop, .122, phase - .15);
  solid.wall(foot, bank, segment => wavyColor(soilShadow, .145, segment * .78));
  solid.wall(bank, soilEdge, segment => wavyColor(pad.clone().lerp(earth, .31), .112, segment));
  solid.cover(soilEdge, soilTop, ({ x, z }) => pad.clone().lerp(soilHighlight,
    .41 + .16 * Math.sin(z * 3.8 + x * .26) + .19 * Math.cos(x * 1.6 - z * .79)));

  const groundMesh = solid.mesh();
  plotGroup.add(groundShadow(strata[0], color("ink", "#2E3A45").lerp(earth, .35)), groundMesh);
  const cropGroup = new THREE.Group();
  plotGroup.add(cropGroup);
  const crop = addGlobeCrops(THREE, cropGroup, [plot], paint);
  const { picks, layouts } = crop;

  const strokes = createSurface();
  const water = createSurface();
  const crease = earth.clone().lerp(deep, .42);
  const edgeLight = soilHighlight.clone().lerp(green, .28).lerp(cream, .08);
  const layout = layouts[0];
  for (const [index, row] of (layout?.rows ?? []).entries()) {
    const z = row.z + layout.strideZ * .32;
    const half = Math.min(width * .5 - .38, row.width * .5 + layout.strideX * .19);
    const rowPoint = (x, across) => plot.point(x, z - across + .067 * Math.sin(x * .81 + index * .65), .022);
    const widthAt = x => .022 + .091 * (1 - Math.abs(x / half) ** 3) + .012 * Math.cos(x * 2.2 + index);
    strokes.ribbon(-half, half, 30, rowPoint, widthAt, segment => wavyColor(crease, .12, segment));
    strokes.ribbon(-half * .86, half * .91, 25, (x, across) => rowPoint(x, across + .12),
      x => .021 + .018 * Math.sin(x * 1.55 + index) ** 2, segment => wavyColor(edgeLight, .15, segment));
  }

  const funded = bed.slots.some(slot => {
    const amount = slot.record?.award_amount_parsed;
    return slot.awards > 0 || Boolean(amount && (amount.floor > 0 || amount.ceiling > 0));
  });
  const gutter = earth.clone().lerp(deep, .27);
  const flowing = stream.clone().lerp(cream, .16);
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - .11);
    const span = depth / 2 - .46;
    const cut = (z, across, lift) => plot.point(x + across + Math.sin(z * .84) * .039, z, lift);
    strokes.ribbon(-span, span, 28, (z, across) => cut(z, across, .037), () => .126,
      segment => wavyColor(gutter, .055, segment));
    if (funded) {
      water.ribbon(-span, span, 28, (z, across) => cut(z, across, .043), () => .085,
        segment => wavyColor(flowing, .13, segment));
      water.ribbon(-span + .2, span - .19, 27, (z, across) => cut(z, across - .032, .047), () => .017,
        segment => wavyColor(cream.clone().lerp(flowing, .18), .13, segment));
    }
  }

  const grassTone = lawn.clone().lerp(deep, .29);
  const tips = lawn.clone().lerp(cream, .29);
  const tussocks = [[-2.8, 4.78], [-1.36, 4.64], [-.74, -4.64], [1.48, -4.48], [-5.7, -.13],
    [-6.48, 1.65], [6.07, -1.4], [6.18, -.62], [5.36, -3.65], [2.15, 4.92], [3.23, -4.57]];
  for (const [patch, [cx, cz]] of tussocks.entries()) {
    for (let index = 0; index < 6; index++) {
      const turn = index * 2.4 + patch * .31;
      const x = cx + Math.cos(turn) * (.09 + index * .034);
      const z = cz + Math.sin(turn) * (.07 + index * .027);
      const base = new THREE.Vector3(x, lawnTop(x, z) + .014, z);
      const end = base.clone().add(new THREE.Vector3(.12 * Math.cos(turn), .16 + .12 * Math.sin(turn) ** 2, .13 * Math.sin(turn)));
      const foot = base.clone().add(new THREE.Vector3(.066, .01, .017));
      const tint = index % 3 === 0 ? tips : grassTone;
      strokes.triangle(base, foot, end, tint);
      strokes.triangle(foot, base, end, tint);
    }
  }

  const slate = color("ink", "#2E3A45").lerp(loam, .39).lerp(cream, .35);
  const stones = [[-.25, 4.55, .21], [.08, 4.62, .11], [1.73, 4.52, .13],
    [-5.63, 3.49, .14], [-6.32, -.57, .19], [-6.43, -.37, .09], [-4.39, -4.38, .17],
    [1.90, -4.63, .24], [2.25, -4.42, .11], [5.78, -2.72, .17], [6.03, 3.17, .20]];
  for (const [index, [x, z, size]] of stones.entries()) {
    const sides = Array.from({ length: 6 }, (_, corner) => {
      const angle = (corner + index * .28) * Math.PI / 3;
      const scale = size * (1 + .18 * Math.sin(corner * 4.2 + index));
      const vx = x + Math.cos(angle) * scale;
      const vz = z + Math.sin(angle) * scale * .72;
      return new THREE.Vector3(vx, lawnTop(vx, vz) + .018, vz);
    });
    const crest = new THREE.Vector3(x - size * .14, lawnTop(x, z) + size * .48, z - size * .11);
    sides.forEach((point, corner) => strokes.triangle(point, crest, sides[(corner + 1) % sides.length],
      wavyColor(slate, .25, corner + index)));
  }
  plotGroup.add(strokes.mesh());
  const wet = water.mesh();
  plotGroup.add(wet);

  return finishBed(plotGroup, { crop, cropGroup, groundMesh, fit: strata.flat(), wet, shadowColor: earth });
}

function finishBed(plotGroup, { crop, cropGroup, groundMesh, fit, wet, shadowColor, markers }) {
  const { picks } = crop;
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14),
    new THREE.MeshBasicMaterial({ color: shadowColor, transparent: true, opacity: .24, depthWrite: false }), picks.length);
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const matrix = new THREE.Matrix4();
  picks.forEach((pick, index) => {
    const extent = Math.min(.74, .15 + pick.width * .44);
    position.copy(pick.position).y += .006;
    size.set(extent, extent * .64, 1);
    shadows.setMatrixAt(index, matrix.compose(position, flat, size));
  });
  shadows.instanceMatrix.needsUpdate = true;
  shadows.computeBoundingSphere();
  plotGroup.add(shadows);

  const byId = new Map(picks.map(pick => [pick.id, pick]));
  for (const { position, width, height } of picks) {
    for (const side of [-1, 1]) {
      fit.push(position.clone().add(new THREE.Vector3(side * width / 2, height, side * width / 2)));
      fit.push(position.clone().add(new THREE.Vector3(side * width / 2, height, -side * width / 2)));
    }
  }
  return { crop, picks, byId, pickMeshes: cropGroup.children, groundMesh, fit, wet, markers };
}

function disposeGroup(group) {
  const materials = new Set();
  group.traverse(node => {
    if (node.isInstancedMesh) node.dispose();
    node.geometry?.dispose();
    if (node.material) materials.add(node.material);
  });
  for (const material of materials) material.dispose();
}

export function createGardenBed3D({
  canvas,
  paint = {},
  onAnchor = () => {},
  onTerraces = () => {},
  onHover = () => {},
  onSelect = () => {},
  onUnavailable = () => {},
}) {
  const touch = matchMedia("(pointer: coarse)");
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  if (!context) throw new Error("WebGL 2 is unavailable for the garden bed.");
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 95);
  const ambient = new THREE.HemisphereLight(0xfff1e1, 0xc4aaa0, 1.80);
  const sun = new THREE.DirectionalLight(paint.light || "#F2C14E", 1.44);
  const fill = new THREE.DirectionalLight(0xe5eff1, .53);
  const rim = new THREE.DirectionalLight(paint.crayonPink || "#D7B1BA", .37);
  sun.position.set(-9, 12, 9);
  fill.position.set(8, 6, 8);
  rim.position.set(4, 7, -10);
  scene.add(ambient, sun, fill, rim);
  const warm = new THREE.Color(paint.light || "#F2C14E").lerp(new THREE.Color("#FFF0D8"), .75);
  const cool = new THREE.Color(paint.crayonBlue || "#8BB4CF").lerp(new THREE.Color("#F2F4F2"), .75);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.83, 1, 32),
    new THREE.MeshBasicMaterial({ color: paint.cream || "#F7F1E3", depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const lifecycle = new AbortController();
  const listen = (target, type, callback, options = {}) =>
    target.addEventListener(type, callback, { ...options, signal: lifecycle.signal });
  const pose = { ...defaultPose };
  const view = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let bed;
  let group;
  let layout;
  let selectedPlant = null;
  let weather = { funding: true, research: true };
  let minimum = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let unitsPerPixel = 0;
  let frame = 0;
  let visible = false;
  let disposed = false;
  let unavailable = false;
  let dirty = false;
  let gesture;
  let hovered = null;
  let pendingHover;

  function reportUnavailable(error) {
    if (disposed || unavailable) return;
    unavailable = true;
    onUnavailable(error);
  }

  function hover(id) {
    if (hovered === id) return;
    hovered = id;
    onHover(id);
  }

  function frameCamera() {
    const distance = 38;
    const horizontal = distance * Math.cos(pose.pitch);
    camera.position.set(horizontal * Math.sin(pose.yaw), distance * Math.sin(pose.pitch), horizontal * Math.cos(pose.yaw));
    camera.lookAt(0, layout.markers ? .53 : .24, 0);
    camera.updateMatrixWorld();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of layout.fit) {
      view.copy(point).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, view.x);
      maxX = Math.max(maxX, view.x);
      minY = Math.min(minY, view.y);
      maxY = Math.max(maxY, view.y);
    }
    const aspect = width / height;
    const halfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect)) * 1.075 / pose.zoom;
    const middleX = (minX + maxX) / 2;
    const middleY = (minY + maxY) / 2;
    const halfWidth = halfHeight * aspect;
    camera.left = middleX - halfWidth;
    camera.right = middleX + halfWidth;
    camera.bottom = middleY - halfHeight;
    camera.top = middleY + halfHeight;
    camera.updateProjectionMatrix();
    unitsPerPixel = halfHeight * 2 / height;
  }

  function requestFrame(render = true) {
    dirty ||= render;
    if (!frame && layout && visible && !unavailable && !disposed && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function project(point) {
    screen.copy(point).project(camera);
    return { x: (1 + screen.x) * width / 2, y: (1 - screen.y) * height / 2 };
  }

  function rayPick({ clientX, clientY, pointerType }) {
    if (!layout || !width || !height) return null;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    pointer.set(2 * x - 1, 1 - 2 * y);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(layout.pickMeshes, false)[0];
    const surface = raycaster.intersectObject(layout.groundMesh, false)[0];
    if (hit && (!surface || hit.distance < surface.distance)) return hit.object.userData.recordIds[hit.instanceId];

    // A narrow stem remains tappable without making adjacent bare soil select a grant.
    const tolerance = (pointerType === "touch" ? 5.4 : 2.6) * unitsPerPixel;
    let closest = null;
    let distance = Infinity;
    for (const pick of layout.picks) {
      const foot = view.copy(pick.position).addScaledVector(up, pick.height * .18);
      const head = screen.copy(pick.position).addScaledVector(up, pick.height * .79);
      const separation = raycaster.ray.distanceSqToSegment(foot, head);
      const reach = Math.min(pick.width * .45, pick.height * .34) + tolerance;
      if (separation > reach * reach || separation >= distance) continue;
      if (surface && surface.distance + tolerance < raycaster.ray.origin.distanceTo(head)) continue;
      closest = pick.id;
      distance = separation;
    }
    return closest;
  }

  function draw() {
    frame = 0;
    if (!visible || !layout || unavailable || disposed || document.hidden) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1, touch.matches ? 1.25 : 1.55);
    if (ratio !== pixelRatio) {
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      dirty = true;
    }
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      frameCamera();
      try {
        renderer.render(scene, camera);
      } catch (error) {
        reportUnavailable(error);
        return;
      }
      Object.assign(canvas.dataset, {
        renderer: "webgl", bed: bed.id, plantCount: String(layout.picks.length),
        terraceCount: String(layout.markers ? layout.markers.length - 1 : 0),
        yaw: pose.yaw.toFixed(4), pitch: pose.pitch.toFixed(4), zoom: pose.zoom.toFixed(4),
        triangles: String(renderer.info.render.triangles), drawCalls: String(renderer.info.render.calls),
      });
      const tip = selectedPlant && project(view.copy(selectedPlant.position).addScaledVector(up, selectedPlant.height));
      onAnchor(tip && tip.x >= 0 && tip.x <= width && tip.y >= 0 && tip.y <= height
        ? { ...tip, id: selectedPlant.id } : null);
      if (layout.markers) {
        onTerraces(layout.markers.map(({ id, point }) => ({
          id, ...project(point), depth: view.copy(point).applyMatrix4(camera.matrixWorldInverse).z,
        })).filter(({ x, y }) => x >= 0 && x <= width && y >= 0 && y <= height));
      }
    }
    if (pendingHover) {
      const event = pendingHover;
      pendingHover = undefined;
      hover(rayPick(event));
    }
  }

  function rotate({ yaw = 0, pitch = 0 } = {}) {
    pose.yaw = Math.atan2(Math.sin(pose.yaw + yaw), Math.cos(pose.yaw + yaw));
    pose.pitch = clamp(pose.pitch + pitch, .39, 1.23);
    requestFrame();
  }

  function setWeather(next) {
    weather = next;
    if (layout) layout.wet.visible = Boolean(weather.funding);
    sun.color.copy(weather.research ? warm : cool);
    sun.intensity = weather.research ? 1.47 : 1.03;
    rim.intensity = weather.research ? .45 : .30;
    requestFrame();
  }

  function setBed(next) {
    if (bed === next) return;
    const nextGroup = new THREE.Group();
    let nextLayout;
    try {
      if (next.id === "neuro" && next.deadlinePath) {
        const terrain = createDeadlineTerrace(next, nextGroup, paint, { createSurface, loop, addTrail, groundShadow });
        nextLayout = finishBed(nextGroup, terrain);
      } else {
        nextLayout = bedLayout(next, nextGroup, paint);
      }
    } catch (error) {
      disposeGroup(nextGroup);
      throw error;
    }
    if (group) {
      scene.remove(group);
      disposeGroup(group);
    }
    bed = next;
    group = nextGroup;
    layout = nextLayout;
    scene.add(group);
    scene.updateMatrixWorld(true);
    pendingHover = undefined;
    gesture = undefined;
    hover(null);
    selectedPlant = null;
    onAnchor(null);
    onTerraces([]);
    ring.visible = false;
    Object.assign(pose, layout.markers ? deadlinePose : defaultPose);
    layout.crop.setMinimumScore(minimum);
    setWeather(weather);
  }

  listen(canvas, "pointerdown", event => {
    if (!visible || !event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, "pointermove", event => {
    if (!visible) return;
    if (!gesture) {
      if (event.pointerType !== "touch") {
        pendingHover = event;
        requestFrame(false);
      }
      return;
    }
    if (event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    gesture.distance += Math.hypot(dx, dy);
    if (!gesture.moved && gesture.distance > gestureThreshold) {
      gesture.moved = true;
      pendingHover = undefined;
      hover(null);
    }
    if (gesture.moved) rotate({ yaw: -dx * .008, pitch: dy * .007 });
  });
  listen(canvas, "pointerup", event => {
    if (event.pointerId !== gesture?.id) return;
    const wasDrag = gesture.moved;
    gesture = undefined;
    if (visible && !wasDrag) onSelect(rayPick(event), event.pointerType);
  });
  listen(canvas, "pointerleave", () => {
    pendingHover = undefined;
    hover(null);
  });
  function cancelDrag(event) {
    if (gesture?.id === event.pointerId) gesture = undefined;
  }
  listen(canvas, "pointercancel", cancelDrag);
  listen(canvas, "lostpointercapture", cancelDrag);
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    reportUnavailable(new Error("The garden bed lost its WebGL context."));
  });
  listen(document, "visibilitychange", () => requestFrame());
  listen(window, "resize", () => requestFrame(), { passive: true });
  listen(touch, "change", () => requestFrame());
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestFrame()) : null;
  resize?.observe(canvas);

  return {
    setBed,
    setVisible(show) {
      if (visible === show) return;
      visible = show;
      if (visible) requestFrame();
      else {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        gesture = undefined;
        pendingHover = undefined;
        hover(null);
        onTerraces([]);
      }
    },
    setWeather,
    setMinimumScore(value) {
      minimum = value;
      layout?.crop.setMinimumScore(value);
      requestFrame();
    },
    setSelection(id) {
      const selected = layout?.byId.get(id) ?? null;
      if (selectedPlant === selected) return;
      selectedPlant = selected;
      ring.visible = Boolean(selectedPlant);
      if (selectedPlant) {
        ring.position.copy(selectedPlant.position).y += .047;
        ring.scale.setScalar(clamp(selectedPlant.width * .56, .19, .74));
      } else {
        onAnchor(null);
      }
      requestFrame();
    },
    rotate,
    zoom(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      pose.zoom = clamp(pose.zoom * factor, .79, 1.95);
      requestFrame();
    },
    reset() {
      Object.assign(pose, layout?.markers ? deadlinePose : defaultPose);
      requestFrame();
    },
    getProjectedPlants() {
      if (!layout || !width || !height) return [];
      return layout.picks.map(pick => ({
        id: pick.id,
        ...project(view.copy(pick.position).addScaledVector(up, pick.height * .64)),
      }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      resize?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.renderer;
    },
  };
}
