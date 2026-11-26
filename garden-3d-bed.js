import * as THREE from "./vendor/three-0.180.0/three.module.min.js";
import { addGlobeCrops } from "./garden-globe-crops.js";

const up = new THREE.Vector3(0, 1, 0);
const defaultPose = { yaw: -.28, pitch: .79, zoom: 1 };
const { clamp, lerp } = THREE.MathUtils;
const gestureThreshold = 6;

function loop(width, depth, radius, elevation, waviness = 0) {
  const x = width / 2 - radius;
  const z = depth / 2 - radius;
  const corners = [[x, z], [-x, z], [-x, -z], [x, -z]];
  return corners.flatMap(([cx, cz], quadrant) => Array.from({ length: 10 }, (_, step) => {
    const angle = (quadrant + step / 9) * Math.PI / 2;
    const edge = radius + waviness * Math.sin(angle * 5 + .3) + .45 * waviness * Math.cos(angle * 9);
    const x = cx + Math.cos(angle) * edge;
    const z = cz + Math.sin(angle) * edge;
    return new THREE.Vector3(x, elevation(x, z), z);
  }));
}

function createSurface() {
  const vertices = [];
  const colors = [];
  function triangle(a, b, c, color) {
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let index = 0; index < 3; index++) colors.push(color.r, color.g, color.b);
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
  function cover(rings, center, tint) {
    for (let index = 0; index < rings[0].length; index++) {
      const next = (index + 1) % rings[0].length;
      triangle(center, rings[0][next], rings[0][index], tint(index, 0));
    }
    for (let index = 1; index < rings.length; index++) {
      band(rings[index - 1], rings[index], point => tint(point, index));
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

function bedLayout(bed, plotGroup, paint) {
  const width = 10.8;
  const depth = 7.8;
  const soilTop = (x, z) => .48 + .045 * Math.sin(x * .54 + z * .59) - .017 * z;
  const lawnTop = (x, z) => .036 + .056 * Math.sin(x * .8 - z * .56);
  const plot = {
    bed, width, depth,
    normalAt: () => up,
    point: (x, z, rise = 0) => new THREE.Vector3(x, soilTop(x, z) + rise, z),
  };
  const color = (token, fallback) => new THREE.Color(paint[token] || fallback);
  const earth = color("soil", "#6B4A2F");
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
  const surfaceWidth = width + 2.96;
  const surfaceDepth = depth + 2.62;
  const strata = [
    loop(surfaceWidth - 1.02, surfaceDepth - .92, 1.31, () => -1.02, .045),
    loop(surfaceWidth - .43, surfaceDepth - .40, 1.54, (x, z) => -.63 + .043 * Math.sin(x * 1.2 - z * .67), .071),
    loop(surfaceWidth - .17, surfaceDepth - .17, 1.52, (x, z) => -.37 + .032 * Math.cos(x * .67 + z * 1.2), .058),
    loop(surfaceWidth, surfaceDepth, 1.43, (x, z) => lawnTop(x, z) - .14, .051),
    loop(surfaceWidth + .04, surfaceDepth + .04, 1.40, lawnTop, .037),
  ];
  const shale = [earth.clone().multiplyScalar(.79), earth.clone().lerp(loam, .46),
    earth.clone().lerp(loam, .16), deep.clone().lerp(green, .24)];
  for (let index = 0; index < strata.length - 1; index++) {
    solid.wall(strata[index], strata[index + 1], segment => wavyColor(shale[index], .065, segment + 4 * index));
  }
  const lawn = green.clone().lerp(sap, .64).lerp(sunlit, .20);
  solid.cover([loop(width, depth, .77, lawnTop), strata[4]], new THREE.Vector3(0, lawnTop(0, 0), 0),
    (index, ring) => wavyColor(lawn, ring ? .10 : .03, index));

  // The golden footpath is a single continuous loop around the cutaway bed.
  const trim = loam.clone().lerp(sunlit, .53);
  const walk = sunlit.clone().lerp(loam, .19).lerp(cream, .25);
  const trail = [
    loop(width + .87, depth + .73, .78, (x, z) => lawnTop(x, z) + .029, .044),
    loop(width + 1.06, depth + .96, .82, (x, z) => lawnTop(x, z) + .049, .044),
    loop(width + 2.21, depth + 1.99, 1.13, (x, z) => lawnTop(x, z) + .047, .046),
    loop(width + 2.44, depth + 2.14, 1.19, (x, z) => lawnTop(x, z) + .031, .048),
  ];
  for (let index = 0; index < trail.length - 1; index++) {
    solid.band(trail[index], trail[index + 1], segment =>
      wavyColor(index === 1 ? walk : trim, index === 1 ? .058 : .044, segment));
  }

  const pad = loam.clone().lerp(green, .59).lerp(sap, .13);
  const foot = loop(width + .8, depth + .69, .78, lawnTop, .035);
  const upperRim = loop(width + .44, depth + .43, .63, (x, z) => soilTop(x, z) - .069, .032);
  const soilEdge = loop(width + .14, depth + .14, .57, soilTop, .03);
  solid.wall(foot, upperRim, segment => wavyColor(earth, .12, segment));
  solid.band(soilEdge, upperRim, segment => wavyColor(loam.clone().lerp(sunlit, .32), .061, segment));
  solid.cover([
    loop(width * .46, depth * .46, .37, soilTop),
    loop(width * .77, depth * .77, .48, soilTop),
    soilEdge,
  ], plot.point(0, 0), (index, ring) => wavyColor(pad, .034 + ring * .015, index + ring * 3));

  const groundMesh = solid.mesh();
  plotGroup.add(groundMesh);
  const cropGroup = new THREE.Group();
  plotGroup.add(cropGroup);
  const crop = addGlobeCrops(THREE, cropGroup, [plot], paint);
  const { picks, layouts } = crop;

  const strokes = createSurface();
  const water = createSurface();
  const crease = earth.clone().lerp(deep, .35);
  const edgeLight = pad.clone().lerp(cream, .25);
  const layout = layouts[0];
  for (const [index, row] of (layout?.rows ?? []).entries()) {
    const z = row.z + layout.strideZ * .30;
    const half = Math.min(width * .5 - .38, row.width * .5 + layout.strideX * .19);
    const rowPoint = (x, across) => plot.point(x, z - across + .038 * Math.sin(x * 1.4 + index * .75), .024);
    const widthAt = x => .026 + .068 * (1 - Math.abs(x / half) ** 5);
    strokes.ribbon(-half, half, 24, rowPoint, widthAt, segment => wavyColor(crease, .16, segment));
    strokes.ribbon(-half * .92, half * .92, 23, (x, across) => rowPoint(x, across + .11),
      () => .022, segment => wavyColor(edgeLight, .075, segment));
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

  const grassTone = lawn.clone().lerp(deep, .28);
  const tips = lawn.clone().lerp(cream, .34);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 26; index++) {
      const along = (index + .5) / 26;
      const x = lerp(-width / 2 + .7, width / 2 - .8, along);
      const z = side * (depth / 2 + 1.19) + .079 * Math.sin(index * 4.24);
      const base = new THREE.Vector3(x, lawnTop(x, z) + .014, z);
      const end = base.clone().add(new THREE.Vector3(.075 * Math.cos(index * 3.18), .16 + .06 * Math.sin(index * 1.5), .037));
      const foot = base.clone().add(new THREE.Vector3(.065, .018, .008));
      strokes.triangle(base, foot, end, index % 4 === 0 ? tips : grassTone);
      strokes.triangle(foot, base, end, index % 4 === 0 ? tips : grassTone);
    }
  }
  plotGroup.add(strokes.mesh());
  const wet = water.mesh();
  plotGroup.add(wet);

  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14),
    new THREE.MeshBasicMaterial({ color: earth, transparent: true, opacity: .24, depthWrite: false }), picks.length);
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

  const fit = strata.flat();
  const byId = new Map(picks.map(pick => [pick.id, pick]));
  for (const { position, width, height } of picks) {
    for (const side of [-1, 1]) {
      fit.push(position.clone().add(new THREE.Vector3(side * width / 2, height, side * width / 2)));
      fit.push(position.clone().add(new THREE.Vector3(side * width / 2, height, -side * width / 2)));
    }
  }
  return { crop, picks, byId, pickMeshes: cropGroup.children, groundMesh, fit, wet };
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
  const ambient = new THREE.HemisphereLight(0xffefd8, 0xc0a599, 1.71);
  const sun = new THREE.DirectionalLight(paint.light || "#F2C14E", 1.51);
  const fill = new THREE.DirectionalLight(0xdae7f1, .47);
  const rim = new THREE.DirectionalLight(paint.crayonPink || "#D7B1BA", .45);
  sun.position.set(-8, 15, 8);
  fill.position.set(8, 5, 7);
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
    camera.lookAt(0, .3, 0);
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
    const halfHeight = Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect)) * 1.10 / pose.zoom;
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
        yaw: pose.yaw.toFixed(4), pitch: pose.pitch.toFixed(4), zoom: pose.zoom.toFixed(4),
        triangles: String(renderer.info.render.triangles), drawCalls: String(renderer.info.render.calls),
      });
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
    sun.intensity = weather.research ? 1.62 : 1.08;
    rim.intensity = weather.research ? .51 : .31;
    requestFrame();
  }

  function setBed(next) {
    if (bed === next) return;
    const nextGroup = new THREE.Group();
    let nextLayout;
    try {
      nextLayout = bedLayout(next, nextGroup, paint);
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
      }
    },
    setWeather,
    setMinimumScore(value) {
      minimum = value;
      layout?.crop.setMinimumScore(value);
      requestFrame();
    },
    setSelection(id) {
      const selected = layout?.byId.get(id);
      ring.visible = Boolean(selected);
      if (selected) {
        ring.position.copy(selected.position).y += .047;
        ring.scale.setScalar(clamp(selected.width * .56, .19, .74));
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
