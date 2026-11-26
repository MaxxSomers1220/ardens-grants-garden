import * as THREE from "./vendor/three-0.180.0/three.module.min.js";
import { addGlobeCrops } from "./garden-globe-crops.js";
import { createGlobeTerrain } from "./garden-globe-terrain.js";

const defaultPose = { yaw: -2.14, pitch: .68 };
const fullTurn = Math.PI * 2;
const halfMinView = 10.48;
const gestureThreshold = 6;
const { clamp } = THREE.MathUtils;

export function createGardenGlobe({
  canvas,
  beds,
  paint = {},
  onLayout = () => {},
  onSelect = () => {},
  onUnavailable = () => {},
}) {
  const touch = matchMedia("(pointer: coarse)");
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: !touch.matches,
    powerPreference: "low-power",
  });
  if (!context) throw new Error("WebGL 2 is unavailable for the garden globe.");

  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 90);
  camera.position.set(0, 0, 36);
  camera.updateMatrixWorld();

  const sky = new THREE.Color(paint.crayonBlue || "#8BB4CF").lerp(new THREE.Color("#FAF1DD"), .72);
  const bounced = new THREE.Color(paint.hillGreen || "#648854")
    .lerp(new THREE.Color(paint.cream || "#F7F1E3"), .18)
    .lerp(new THREE.Color("#AB7E8A"), .48);
  const ambient = new THREE.HemisphereLight(sky, bounced, 1.62);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffedcc, 1.43);
  sun.position.set(-12, 18, 14);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe0e2f9, .43);
  fill.position.set(11, 6, 5);
  scene.add(fill);
  const warm = new THREE.Color(paint.light || "#F2C14E").lerp(new THREE.Color("#FFF1DA"), .73);
  const rose = new THREE.Color(paint.crayonPink || "#D7B1BA").lerp(new THREE.Color("#FBE1BB"), .54);
  const rim = new THREE.DirectionalLight(rose, .67);
  rim.position.set(3, 10, -8);
  scene.add(rim);

  let terrain;
  let crops;
  function disposeMeshes() {
    const materials = new Set();
    world.traverse(mesh => {
      if (mesh.isInstancedMesh) mesh.dispose();
      mesh.geometry?.dispose();
      if (mesh.material) materials.add(mesh.material);
    });
    for (const material of materials) material.dispose();
  }
  try {
    terrain = createGlobeTerrain(THREE, beds, paint);
    world.add(terrain.land, terrain.trails, terrain.banks, terrain.pads, terrain.lines, terrain.wet);
    crops = addGlobeCrops(THREE, world, terrain.plots, paint);
  } catch (error) {
    disposeMeshes();
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }

  const lifecycle = new AbortController();
  const listen = (target, type, callback, options = {}) =>
    target.addEventListener(type, callback, { ...options, signal: lifecycle.signal });
  const pose = { ...defaultPose };
  const projected = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const anchors = terrain.plots.map(plot => ({
    plot,
    point: plot.point(0, plot.depth * .26, .25),
  }));
  let frame = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let visible = false;
  let disposed = false;
  let unavailable = false;
  let pointerGesture;

  function reportUnavailable(error) {
    if (disposed || unavailable) return;
    unavailable = true;
    onUnavailable(error);
  }

  function cameraFrame(w, h) {
    const aspect = w / h;
    const half = halfMinView * Math.max(1, 1 / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }

  function placeLabels() {
    const markers = [];
    const minimumFacing = width < 420 ? .45 : .39;
    for (const { plot, point } of anchors) {
      if (normal.copy(plot.normal).transformDirection(world.matrixWorld).z < minimumFacing) continue;
      const depth = projected.copy(point).applyMatrix4(world.matrixWorld).z;
      projected.project(camera);
      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      if (x >= 0 && x <= width && y >= 0 && y <= height) markers.push({ id: plot.bed.id, x, y, depth });
    }
    onLayout(markers);
  }

  function draw() {
    frame = 0;
    if (!visible || unavailable || disposed || document.hidden) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const nextRatio = Math.min(window.devicePixelRatio || 1, touch.matches ? 1.25 : 1.5);
    if (nextRatio !== pixelRatio) {
      pixelRatio = nextRatio;
      renderer.setPixelRatio(pixelRatio);
    }
    if (width !== w || height !== h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      cameraFrame(w, h);
    }
    world.rotation.set(pose.pitch, pose.yaw, 0, "XYZ");
    world.updateMatrixWorld(true);
    try {
      renderer.render(scene, camera);
    } catch (error) {
      reportUnavailable(error);
      return;
    }
    Object.assign(canvas.dataset, {
      renderer: "webgl",
      plotCount: String(terrain.plots.length),
      plantCount: String(world.userData.globePlantCount),
      triangles: String(renderer.info.render.triangles),
      drawCalls: String(renderer.info.render.calls),
      yaw: pose.yaw.toFixed(4),
      pitch: pose.pitch.toFixed(4),
    });
    placeLabels();
  }

  function requestDraw() {
    if (!frame && visible && !unavailable && !disposed && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function rotate({ yaw = 0, pitch = 0 } = {}) {
    const turned = (pose.yaw + yaw + Math.PI) % fullTurn;
    pose.yaw = (turned + fullTurn) % fullTurn - Math.PI;
    pose.pitch = clamp(pose.pitch + pitch, -Math.PI / 2, Math.PI / 2);
    requestDraw();
  }

  function selectAt(event) {
    if (!width || !height) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    pointer.set(2 * x - 1, 1 - 2 * y);
    raycaster.setFromCamera(pointer, camera);
    const bed = raycaster.intersectObject(terrain.pads, false)[0];
    if (!bed) return;
    const land = raycaster.intersectObject(terrain.land, false)[0];
    if (!land || bed.distance < land.distance) onSelect(terrain.padFaces[bed.faceIndex]);
  }

  listen(canvas, "pointerdown", event => {
    if (!visible || !event.isPrimary || event.button !== 0) return;
    pointerGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, "pointermove", event => {
    const drag = pointerGesture;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.distance += Math.hypot(dx, dy);
    drag.moved ||= drag.distance > gestureThreshold;
    if (drag.moved) rotate({ yaw: dx * .009, pitch: dy * .009 });
  });
  listen(canvas, "pointerup", event => {
    const drag = pointerGesture;
    if (!drag || drag.id !== event.pointerId) return;
    pointerGesture = undefined;
    if (!drag.moved && visible) selectAt(event);
  });
  function cancelDrag(event) {
    if (pointerGesture?.id === event.pointerId) pointerGesture = undefined;
  }
  listen(canvas, "pointercancel", cancelDrag);
  listen(canvas, "lostpointercapture", cancelDrag);
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    reportUnavailable(new Error("The garden globe lost its WebGL context."));
  });
  listen(document, "visibilitychange", requestDraw);
  listen(window, "resize", requestDraw, { passive: true });
  listen(touch, "change", requestDraw);
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(requestDraw) : null;
  resize?.observe(canvas);

  return {
    setVisible(show) {
      if (visible === show) return;
      visible = show;
      if (visible) {
        requestDraw();
      } else {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        pointerGesture = undefined;
      }
    },
    setWeather({ funding, research }) {
      terrain.wet.visible = Boolean(funding);
      sun.color.copy(research ? warm : sky);
      sun.intensity = research ? 1.55 : 1.10;
      rim.intensity = research ? .67 : .40;
      requestDraw();
    },
    setMinimumScore(value) {
      crops.setMinimumScore(value);
      requestDraw();
    },
    rotate,
    reset() {
      Object.assign(pose, defaultPose);
      requestDraw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      resize?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      disposeMeshes();
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.renderer;
    },
  };
}
