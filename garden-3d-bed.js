import * as THREE from "./vendor/three-0.180.0/three.module.min.js";
import { createDeadlineTerrace } from "./garden-3d-deadline-terrace.js";

const up = new THREE.Vector3(0, 1, 0);
const defaultPose = { yaw: .22, pitch: .66, zoom: 1 };
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
    camera.lookAt(0, .53, 0);
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
        terraceCount: String(bed.deadlinePath.terraces.length),
        yaw: pose.yaw.toFixed(4), pitch: pose.pitch.toFixed(4), zoom: pose.zoom.toFixed(4),
        triangles: String(renderer.info.render.triangles), drawCalls: String(renderer.info.render.calls),
      });
      const tip = selectedPlant && project(view.copy(selectedPlant.position).addScaledVector(up, selectedPlant.height));
      onAnchor(tip && tip.x >= 0 && tip.x <= width && tip.y >= 0 && tip.y <= height
        ? { ...tip, id: selectedPlant.id } : null);
      const signs = layout.markers.map(({ id, point }) => ({ id, ...project(point) }));
      const crowns = layout.picks.map(pick => project(view.copy(pick.position).addScaledVector(up, pick.height * .93)));
      onTerraces(signs, crowns);
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
      const terrain = createDeadlineTerrace(next, nextGroup, paint, { createSurface, loop, addTrail, groundShadow });
      nextLayout = finishBed(nextGroup, terrain);
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
    Object.assign(pose, defaultPose);
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
      Object.assign(pose, defaultPose);
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
