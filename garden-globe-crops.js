import { namedGardenCrops } from "./garden-named-crops.js";

const originalHeights = { healthy: .94, seedling: .69, corn: 1.06, pumpkin: .60, orchard: 1.08 };
const fullTurn = Math.PI * 2;

function seededOffset(key) {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function cropArtwork(THREE, paint) {
  const colors = {
    leaf: paint.leaf || "#5B8C4A",
    deep: paint.evergreen || "#3E6B34",
    light: "#A0B871", cream: paint.cream || "#F7F1E3", ink: paint.ink || "#2E3A45",
    soil: paint.soil || "#6B4A2F", dry: paint.dry || "#8A6B45", corn: paint.corn || "#D9A441",
    bloom: paint.bloom || "#F2C14E", pumpkin: paint.pumpkin || "#E07830", apple: paint.apple || "#C14A3A",
    rose: "#B76287", pink: "#D88FAF", purple: "#9C73B6", deepPurple: "#684D84",
    gold: "#D5AD58", blue: "#5EA8CA", navy: "#455775", teal: "#77AFA0", tealEdge: "#386D63",
    red: "#C45150", lime: "#95B56A",
  };
  const sources = new Set();
  const keep = geometry => (sources.add(geometry), geometry);
  const lobe = keep(new THREE.IcosahedronGeometry(1, 0));
  const round = keep(new THREE.SphereGeometry(1, 8, 4));
  const stalk = keep(new THREE.CylinderGeometry(.73, 1, 1, 5, 1, true));
  const cube = keep(new THREE.BoxGeometry(1, 1, 1));
  const disk = keep(new THREE.CylinderGeometry(1, .85, 1, 9));
  const cupHandle = keep(new THREE.TorusGeometry(.11, .03, 5, 8));
  const up = new THREE.Vector3(0, 1, 0);
  const identity = new THREE.Quaternion();

  const leaf = keep(new THREE.BufferGeometry());
  leaf.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, .33, -.016, -.20, .71, .07, -.15, 1, .21, 0,
    .71, .07, .16, .31, 0, .18, .49, .15, 0,
  ], 3));
  leaf.setIndex([0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 4, 4, 6, 5, 5, 6, 0]);
  leaf.computeVertexNormals();

  const gourd = keep(new THREE.SphereGeometry(1, 16, 6));
  const gourdVertices = gourd.attributes.position;
  for (let i = 0; i < gourdVertices.count; i++) {
    const x = gourdVertices.getX(i);
    const z = gourdVertices.getZ(i);
    const ridge = 1 + .095 * Math.cos(Math.atan2(z, x) * 8);
    gourdVertices.setX(i, x * ridge);
    gourdVertices.setZ(i, z * ridge);
  }
  gourd.computeVertexNormals();

  function extrusion(draw, depth) {
    const outline = new THREE.Shape();
    draw(outline);
    const geometry = keep(new THREE.ExtrudeGeometry(outline, {
      depth, bevelEnabled: true, bevelSegments: 1, bevelSize: .009, bevelThickness: .009,
      curveSegments: 4, steps: 1,
    }));
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  const fan = extrusion(shape => {
    shape.moveTo(-.43, .76);
    shape.quadraticCurveTo(-.31, .81, -.23, .92);
    shape.quadraticCurveTo(-.12, .87, -.01, .98);
    shape.quadraticCurveTo(.11, .87, .24, .92);
    shape.quadraticCurveTo(.32, .82, .43, .79);
    shape.quadraticCurveTo(.38, .48, 0, .42);
    shape.quadraticCurveTo(-.39, .50, -.43, .76);
  }, .12);
  const paletteHead = extrusion(shape => {
    shape.moveTo(-.39, .68);
    shape.bezierCurveTo(-.48, .94, .16, 1.03, .38, .86);
    shape.bezierCurveTo(.55, .73, .20, .54, -.04, .61);
    shape.quadraticCurveTo(-.20, .66, -.39, .68);
  }, .10);
  const foamStem = keep(new THREE.LatheGeometry([
    [0, 0], [.165, 0], [.19, .049], [.133, .15], [.083, .34], [.047, .65], [.09, .87], [0, .91],
  ].map(point => new THREE.Vector2(...point)), 9));
  const foamRims = [[-.52, .76], [-.35, .74], [-.17, .71], [.01, .70], [.19, .72], [.35, .74], [.51, .78]];
  const foamBands = foamRims.slice(0, -1).map(([x, y], index) => extrusion(shape => {
    const [endX, endY] = foamRims[index + 1];
    shape.moveTo(.016, 1.30);
    shape.bezierCurveTo(x * .4, 1.30, x * .96, 1.09, x, y);
    shape.quadraticCurveTo((x + endX) / 2, Math.min(y, endY) - .16 - index % 2 * .025, endX, endY);
    shape.bezierCurveTo(endX * .98, 1.09, endX * .41, 1.30, .016, 1.30);
  }, .108 + .012 * (2 - Math.abs(2 - index))));
  const foamColors = ["#B76A89", "#C75C47", "#E0B74D", "#7DA75E", "#578DAA", "#805FA2"];

  function component(parts, geometry, color, position, scale, rotation = identity) {
    parts.push({ geometry, color, position, scale, rotation });
  }

  function line(parts, color, start, end, radius) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const difference = b.clone().sub(a);
    const length = difference.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, difference.divideScalar(length));
    component(parts, stalk, color, a.add(b).multiplyScalar(.5).toArray(), [radius, length, radius], rotation);
  }

  function petal(parts, color, position, scale, yaw = 0, tilt = 0, geometry = lobe) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt));
    component(parts, geometry, color, position, scale, rotation);
  }

  function foliage(parts, color, y, yaw, reach, neutral, width = 1) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, .30, "YXZ"));
    const position = [0, y, 0];
    component(parts, leaf, color, position, [reach, reach, reach * width * (neutral ? .76 : 1)], rotation);
    if (!neutral) return;
    // Separated vein segments remain visible even when the palette is desaturated.
    for (const [from, to] of [[.24, .39], [.49, .63]]) {
      const point = value => new THREE.Vector3(value * reach, (.10 + value * .14) * reach, 0)
        .applyQuaternion(rotation).add(new THREE.Vector3(...position)).toArray();
      line(parts, "#74806B", point(from), point(to), .006);
    }
  }

  function branch(parts, color, height, neutral, base = .037) {
    line(parts, color, [0, 0, 0], [.026, height, 0], base * (neutral ? .59 : 1));
  }

  function healthy(parts, neutral, seedling = false) {
    const height = seedling ? .57 : .91;
    branch(parts, colors.deep, height, neutral);
    const tiers = neutral ? [.31, .65] : seedling ? [.35, .66, .83] : [.26, .45, .65, .84];
    tiers.forEach((y, i) => foliage(parts, i % 2 ? colors.light : colors.leaf,
      height * y, i * 2.40, (1.10 - y * .5) * (seedling ? .34 : .46), neutral));
    petal(parts, seedling ? colors.light : colors.leaf, [.026, height, 0], [.058, .12, .055]);
  }

  function corn(parts, neutral) {
    branch(parts, colors.dry, 1.08, neutral, .040);
    const tiers = neutral ? [.36, .58, .74] : [.27, .44, .59, .74];
    tiers.forEach((y, i) => foliage(parts, i % 2 ? colors.corn : colors.dry, y, i * 2.57, .47, neutral, .59));
    petal(parts, colors.corn, [.087, .64, .04], [.089, .22, .076], 0, -.24, round);
    for (const side of [-1, 1]) {
      line(parts, colors.dry, [.070 + side * .039, .52, .095], [.105 + side * .024, .79, .096], .008);
    }
    for (const side of [-1, 0, 1]) {
      line(parts, colors.corn, [.026, 1.01, 0], [.034 + side * .076, 1.18, .027], .009);
    }
  }

  function pumpkins(parts, neutral) {
    for (const [x, y, z, size] of [[-.25, .19, -.09, .24], [.22, .25, .035, .31], [.025, .13, .24, .17]]) {
      component(parts, gourd, colors.pumpkin, [x, y, z], [size, y, size]);
      line(parts, colors.deep, [x, y * 1.87, z], [x + .034, y * 2.17, z + .023], .026);
    }
    foliage(parts, colors.leaf, .13, 1.03, .46, neutral);
    foliage(parts, colors.light, .17, -1.18, .36, neutral);
  }

  function orchard(parts, neutral, papers) {
    branch(parts, colors.soil, .82, neutral, .085);
    line(parts, colors.soil, [0, .43, 0], [-.24, .74, .016], neutral ? .027 : .045);
    line(parts, colors.soil, [0, .47, 0], [.25, .74, -.077], neutral ? .027 : .043);
    petal(parts, colors.deep, [0, .88, 0], [.37, .39, .31], 0, .05);
    petal(parts, colors.leaf, [-.23, .77, .02], [.24, .22, .24]);
    if (!neutral) petal(parts, colors.leaf, [.25, .81, -.04], [.26, .27, .24]);
    const fruit = [[-.26, .75, .17], [.13, .88, .25], [.23, 1.01, .07], [-.14, 1.05, .18], [.05, .77, -.26], [-.23, .92, -.16]];
    for (const at of fruit.slice(0, papers)) petal(parts, colors.apple, at, [.065, .073, .064]);
  }

  function elephant(parts) {
    component(parts, foamStem, colors.cream, [0, 0, 0], [1, 1, 1]);
    line(parts, "#BEAC8D", [.085, .17, .112], [.030, .54, .064], .009);
    foamBands.forEach((geometry, index) => component(parts, geometry, foamColors[index], [0, 0, 0], [1, 1, 1]));
  }

  function mind(parts, neutral) {
    branch(parts, colors.rose, .74, neutral, .043);
    foliage(parts, colors.pink, .48, -.10, .24, neutral, .75);
    petal(parts, colors.rose, [0, .74, 0], [.34, .105, .15]);
    for (const [x, y, z, w, h] of [[-.25, .81, .01, .175, .14], [-.09, .91, 0, .19, .20],
      [.10, .88, 0, .19, .17], [.26, .81, .01, .16, .14]]) {
      petal(parts, colors.pink, [x, y, z], [w, h, .155], 0, 0, round);
    }
  }

  function rare(parts, neutral) {
    branch(parts, colors.gold, .82, neutral, .043);
    foliage(parts, colors.light, .46, .6, .25, neutral, .80);
    petal(parts, colors.deepPurple, [0, .80, 0], [.15, .12, .13]);
    for (const [x, y, z, tilt] of [[-.17, .90, 0, -.52], [0, 1.01, 0, .03], [.17, .92, 0, .51], [.01, .91, -.10, .11]]) {
      petal(parts, colors.purple, [x, y, z], [.11, .21, .10], 0, tilt);
    }
    petal(parts, colors.pink, [-.25, .63, .11], [.063, .035, .038], 0, -.45);
    if (!neutral) petal(parts, colors.purple, [.22, .54, .07], [.060, .039, .038], 0, .52);
  }

  function data(parts, neutral) {
    branch(parts, colors.ink, .75, neutral, .048);
    component(parts, cube, colors.navy, [0, .88, 0], [.52, .39, .24]);
    for (const face of [-1, 1]) {
      for (const y of [.78, .88, .98]) {
        component(parts, cube, "#A8C0CB", [-.017, y, face * .121], [.37, .032, .02]);
      }
    }
    line(parts, colors.navy, [.02, .57, 0], [.28, .63, .066], .020);
    petal(parts, colors.blue, [.30, .62, .07], [.15, .10, .105], 0, -.24, round);
  }

  function germ(parts, neutral) {
    branch(parts, colors.leaf, .69, neutral, .048);
    petal(parts, colors.lime, [0, .82, 0], [.265, .245, .155], 0, 0, round);
    for (let index = 0; index < 8; index++) {
      const angle = index * fullTurn / 8;
      const x = Math.cos(angle), y = Math.sin(angle);
      line(parts, colors.leaf, [x * .20, .82 + y * .18, 0], [x * .295, .82 + y * .265, 0], .032);
      petal(parts, colors.leaf, [x * .302, .82 + y * .272, 0], [.06, .06, .060]);
    }
    for (const face of [-1, 1]) {
      for (const x of [-.083, .083]) petal(parts, colors.ink, [x, .858, face * .145], [.027, .034, .023]);
      line(parts, colors.deep, [-.096, .79, face * .148], [0, .735, face * .153], .014);
      line(parts, colors.deep, [0, .735, face * .153], [.096, .79, face * .148], .014);
    }
  }

  function science(parts, neutral) {
    branch(parts, colors.tealEdge, .62, neutral, .057);
    component(parts, fan, colors.teal, [0, 0, 0], [1, 1, 1]);
    const glyphs = [
      [-.245, .73, [[1, 1, 0, 1], [0, 1, 0, 0], [0, .5, .75, .5], [0, 0, 1, 0]]],
      [-.057, .815, [[0, 1, 1, 1], [1, 1, 1, .55], [1, .55, 0, 0], [0, 0, 1, 0]]],
      [.154, .75, [[0, 0, .5, 1], [.5, 1, 1, 0], [.23, .45, .77, .45]]],
      [-.126, .57, [[.22, 1, 0, .45], [0, .45, 1, .45], [.78, 1, .78, 0]]],
      [.053, .57, [[0, 0, 0, 1], [0, 1, .82, 1], [.82, 1, .82, .54], [.82, .54, 0, .54], [.42, .54, 1, 0]]],
    ];
    for (const face of [-1, 1]) {
      for (const [x, y, strokes] of glyphs) {
        for (const [a, b, c, d] of strokes) {
          line(parts, colors.tealEdge, [face * (x + a * .082), y + b * .075, face * .073],
            [face * (x + c * .082), y + d * .075, face * .073], .009);
        }
      }
    }
  }

  function medicine(parts, neutral) {
    branch(parts, colors.red, .76, neutral, .065);
    verticalDrop(parts, colors.blue, 0, .13, .10);
    line(parts, colors.red, [.028, .47, 0], [.18, .58, .03], .020);
    petal(parts, colors.purple, [.20, .56, .025], [.12, .18, .095], 0, -.14, round);
    for (let index = 0; index < 5; index++) {
      const angle = index * fullTurn / 5;
      petal(parts, index % 2 ? colors.blue : colors.red, [Math.cos(angle) * .16, .86 + Math.sin(angle) * .16, 0],
        [.107, .10, .095], 0, angle, round);
    }
    petal(parts, colors.rose, [0, .86, .061], [.088, .086, .074]);
  }

  function verticalDrop(parts, color, x, y, radius) {
    petal(parts, color, [x, y, 0], [radius, radius * 1.3, radius]);
  }

  function health(parts, neutral) {
    branch(parts, colors.pink, .70, neutral, .054);
    verticalDrop(parts, colors.blue, 0, .13, .086);
    component(parts, disk, colors.cream, [0, .79, 0], [.24, .31, .168]);
    component(parts, disk, "#BDA88C", [0, .957, 0], [.197, .022, .135]);
    component(parts, cupHandle, colors.cream, [.258, .805, 0], [1, 1, 1]);
    for (const face of [-1, 1]) {
      component(parts, cube, colors.red, [0, .80, face * .158], [.174, .044, .036]);
      component(parts, cube, colors.red, [0, .80, face * .158], [.046, .164, .036]);
    }
  }

  function art(parts, neutral) {
    branch(parts, colors.soil, .64, neutral, .046);
    component(parts, cube, colors.ink, [.019, .61, 0], [.105, .13, .086]);
    component(parts, paletteHead, colors.cream, [0, 0, 0], [1, 1, 1]);
    const paints = [[-.29, .77, colors.gold], [-.12, .86, colors.leaf], [.077, .868, colors.purple],
      [.247, .82, colors.rose], [.211, .70, colors.blue]];
    for (const face of [-1, 1]) {
      for (const [x, y, tint] of paints) petal(parts, tint, [face * x, y, face * .056], [.061, .057, .027]);
    }
  }

  function goldBloom(parts) {
    branch(parts, colors.deep, .42, false, .036);
    for (let i = 0; i < 5; i++) {
      const a = i * fullTurn / 5;
      petal(parts, colors.bloom, [Math.cos(a) * .17, .48 + Math.sin(a) * .17, 0], [.115, .101, .07], 0, a);
    }
    petal(parts, colors.cream, [0, .48, .04], [.083, .082, .075]);
  }

  const models = { healthy, seedling: (parts, neutral) => healthy(parts, neutral, true), corn, pumpkin: pumpkins,
    orchard, elephant, mind, rare, data, germ, science, medicine, health, art, bloom: goldBloom };
  const modelCache = new Map();
  const cream = new THREE.Color(colors.cream);

  function bake(kind, neutral, fruitCount, companion) {
    const key = `${kind}:${neutral ? 1 : 0}:${fruitCount}:${companion || ""}`;
    if (modelCache.has(key)) return modelCache.get(key);
    const parts = [];
    (models[kind] || healthy)(parts, neutral, fruitCount);
    if (companion && models[companion]) {
      const understory = [];
      models[companion](understory, neutral, fruitCount);
      for (const part of understory) {
        const [x, y, z] = part.position;
        component(parts, part.geometry, part.color, [.13 + x * .40, y * .40, .13 + z * .40],
          part.scale.map(size => size * .40), part.rotation);
      }
    }
    const vertexTotal = parts.reduce((sum, part) => sum + part.geometry.attributes.position.count, 0);
    const positions = new Float32Array(vertexTotal * 3);
    const normals = new Float32Array(vertexTotal * 3);
    const vertexColors = new Float32Array(vertexTotal * 3);
    const indices = [];
    const transform = new THREE.Matrix4();
    const normalTransform = new THREE.Matrix3();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const tint = new THREE.Color();
    let start = 0;
    for (const part of parts) {
      const sourcePositions = part.geometry.attributes.position;
      const sourceNormals = part.geometry.attributes.normal;
      transform.compose(new THREE.Vector3(...part.position), part.rotation, new THREE.Vector3(...part.scale));
      normalTransform.getNormalMatrix(transform);
      tint.set(part.color);
      if (neutral) tint.lerp(cream, part.color === colors.ink ? .45 : .64);
      for (let vertex = 0; vertex < sourcePositions.count; vertex++) {
        position.fromBufferAttribute(sourcePositions, vertex).applyMatrix4(transform).toArray(positions, (start + vertex) * 3);
        normal.fromBufferAttribute(sourceNormals, vertex).applyNormalMatrix(normalTransform).toArray(normals, (start + vertex) * 3);
        tint.toArray(vertexColors, (start + vertex) * 3);
      }
      if (part.geometry.index) {
        for (const index of part.geometry.index.array) indices.push(start + index);
      } else {
        for (let vertex = 0; vertex < sourcePositions.count; vertex++) indices.push(start + vertex);
      }
      start += sourcePositions.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    const height = geometry.boundingBox.max.y;
    geometry.scale(1 / height, 1 / height, 1 / height);
    modelCache.set(key, geometry);
    return geometry;
  }

  return { bake, releaseSources: () => sources.forEach(geometry => geometry.dispose()) };
}

function footprintWidth(geometry, angle) {
  const vertices = geometry.attributes.position;
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  let left = Infinity;
  let right = -Infinity;
  let near = Infinity;
  let far = -Infinity;
  for (let index = 0; index < vertices.count; index++) {
    const x = vertices.getX(index);
    const z = vertices.getZ(index);
    const across = cosine * x + sine * z;
    const along = cosine * z - sine * x;
    left = Math.min(left, across);
    right = Math.max(right, across);
    near = Math.min(near, along);
    far = Math.max(far, along);
  }
  return Math.max(right - left, far - near);
}

/** Plant each source slot once in its plot's tangent frame. */
export function addGlobeCrops(THREE, world, plots, paint = {}) {
  const artwork = cropArtwork(THREE, paint);
  const batches = new Map();
  const picks = [];
  const layouts = [];
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .93, metalness: 0, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float cropPresence;\nvarying float vCropPresence;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCropPresence = cropPresence;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vCropPresence;")
      .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
        if (vCropPresence < .999) {
          float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
          if (grain > vCropPresence) discard;
        }`);
  };
  material.customProgramCacheKey = () => "arden-radial-crop-presence";
  const matrix = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const localY = new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let count = 0;
  let bloomCount = 0;

  function batch(geometry, label, position, direction, size, score, neutral, recordId) {
    if (!batches.has(geometry)) batches.set(geometry, { label, entries: [] });
    batches.get(geometry).entries.push({
      matrix: matrix.compose(position, direction, scale.setScalar(size)).clone(), score, neutral, recordId,
    });
  }

  for (const plot of plots) {
    const { bed } = plot;
    const slots = bed.slots;
    if (!slots.length) continue;
    const width = plot.width - .34;
    const depth = plot.depth - .34;
    const columns = Math.min(slots.length, Math.ceil(Math.sqrt(slots.length * width / depth)));
    const rows = Math.ceil(slots.length / columns);
    const strideX = width / columns;
    const strideZ = depth / rows;
    const baseSize = Math.min(strideX, strideZ) * .84;
    const named = namedGardenCrops[bed.id];
    const surfaceNormal = typeof plot.normalAt === "function";
    const rowLayout = Array.from({ length: rows }, (_, row) => ({
      z: (row + .5 - rows / 2) * strideZ,
      width: Math.min(columns, slots.length - row * columns) * strideX,
    }));
    layouts.push({ id: bed.id, columns, strideX, strideZ, rows: rowLayout });
    for (const [rank, slot] of slots.entries()) {
      const row = Math.floor(rank / columns);
      const rowCount = Math.min(columns, slots.length - row * columns);
      const key = String(slot.record?.opportunity_id ?? `${bed.id}:${rank}`);
      const x = (rank % columns + .5 - rowCount / 2 + (seededOffset(key + "x") - .5) * .10) * strideX;
      const z = (row + .5 - rows / 2 + (seededOffset(key + "z") - .5) * .10) * strideZ;
      const at = plot.point(x, z, .016);
      outward.copy(surfaceNormal ? plot.normalAt(x, z) : at).normalize();
      east.subVectors(plot.point(x + .032, z, .016), at);
      east.addScaledVector(outward, -east.dot(outward)).normalize();
      forward.crossVectors(east, outward).normalize();
      rotation.setFromRotationMatrix(basis.makeBasis(east, outward, forward));
      const heading = named || slot.elephant ? (seededOffset(key + "yaw") - .5) * .7 : seededOffset(key + "yaw") * fullTurn;
      rotation.multiply(yaw.setFromAxisAngle(localY, heading));

      const neutral = Boolean(slot.neutral);
      const score = Number.isFinite(slot.score) ? Math.max(0, Math.min(100, slot.score)) : 50;
      const kind = slot.elephant ? "elephant" : named?.id || slot.crop || "healthy";
      const fruitCount = slot.crop === "orchard" && slot.papers > 0
        ? Math.max(2, Math.min(6, Math.floor(Math.log2(slot.papers + 1)))) : 0;
      const companion = slot.elephant || named && slot.crop !== "healthy" ? slot.crop : undefined;
      const model = artwork.bake(kind, neutral, fruitCount, companion);
      const relativeHeight = slot.elephant ? 1.46 + (neutral ? 0 : .14 * score / 100)
        : (named?.scale ?? originalHeights[slot.crop] ?? 1) * (neutral ? .77 : .67 + .41 * score / 100);
      const size = baseSize * relativeHeight;
      batch(model, kind, at, rotation, size, score, neutral, key);
      picks.push({
        id: key, position: plot.point(x, z),
        height: model.boundingBox.max.y * size + .016,
        width: footprintWidth(model, heading) * size,
      });
      count++;
      if (slot.bloom) {
        const offset = new THREE.Vector3(size * .26, size * .72, size * .12).applyQuaternion(rotation);
        batch(artwork.bake("bloom", false, 0), "deadline-bloom", at.clone().add(offset), rotation, size * .37, score, neutral, key);
        bloomCount++;
      }
    }
  }
  artwork.releaseSources();

  const installed = [];
  const tint = new THREE.Color();
  for (const [geometry, { label, entries }] of batches) {
    const presence = new THREE.InstancedBufferAttribute(new Float32Array(entries.length).fill(1), 1);
    presence.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("cropPresence", presence);
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = `garden-crops-${label}`;
    mesh.userData.recordIds = entries.map(entry => entry.recordId);
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      mesh.setColorAt(i, tint.setScalar(entry.neutral || label === "deadline-bloom" ? 1 : .83 + entry.score * .0017));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    world.add(mesh);
    installed.push({ entries, presence });
  }
  world.userData.globePlantCount = count;
  world.userData.globeBloomCount = bloomCount;
  world.userData.globeCropBatchCount = installed.length;

  return {
    picks,
    layouts,
    setMinimumScore(value) {
      const minimum = Math.max(0, Number(value) || 0);
      for (const { entries, presence } of installed) {
        entries.forEach((entry, index) => {
          presence.setX(index, !minimum || !entry.neutral && entry.score >= minimum ? 1 : .31);
        });
        presence.needsUpdate = true;
      }
    },
  };
}
