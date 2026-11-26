const radius = 9;
const bedRise = .24;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

function roundedOutline(width, depth, corner) {
  const x = width / 2 - corner;
  const z = depth / 2 - corner;
  return [[x, z], [-x, z], [-x, -z], [x, -z]].flatMap(([cx, cz], quadrant) =>
    Array.from({ length: 6 }, (_, step) => {
      const angle = (quadrant + step / 5) * Math.PI / 2;
      return [cx + Math.cos(angle) * corner, cz + Math.sin(angle) * corner];
    })
  );
}

function terrainRadius({ x, y, z }) {
  const hills = Math.sin(4.7 * x + 2.1 * z) * Math.cos(5.8 * y - 1.5 * z);
  const ridges = Math.sin(7.5 * (x + y) - 5.8 * z) * Math.sin(7.7 * z + 1.1 * x);
  const slope = Math.sin(3.8 * y + 2.2 * x - 3 * z);
  return radius + .42 * hills + .22 * ridges + .18 * slope;
}

function createPlots(THREE, beds) {
  const north = new THREE.Vector3(0, 1, 0);
  return beds.map((bed, index) => {
    const y = 1 - 2 * (index + .5) / beds.length;
    const around = Math.sqrt(1 - y * y);
    const turn = goldenAngle * index + .33;
    const normal = new THREE.Vector3(around * Math.sin(turn), y, around * Math.cos(turn));
    const east = north.clone().cross(normal).normalize();
    const south = east.clone().cross(normal);
    const spread = Math.min(1, Math.sqrt((bed.slots?.length ?? 0) / 70));
    const width = 4.18 + 1.12 * spread;
    const depth = 2.66 + .76 * spread;
    const elevation = terrainRadius(normal);

    function point(x, z, rise = 0) {
      return normal.clone().multiplyScalar(radius).addScaledVector(east, x).addScaledVector(south, z)
        .normalize().multiplyScalar(elevation + bedRise + rise);
    }

    function distanceFromEdge(direction) {
      const cosine = normal.dot(direction);
      if (cosine < .88) return Infinity;
      const round = .47;
      const x = Math.abs(radius * direction.dot(east) / cosine) - width / 2 - .18 + round;
      const z = Math.abs(radius * direction.dot(south) / cosine) - depth / 2 - .18 + round;
      return Math.hypot(Math.max(x, 0), Math.max(z, 0)) + Math.min(Math.max(x, z), 0) - round;
    }

    return { bed, width, depth, normal, elevation, point, distanceFromEdge };
  });
}

function createBatch(THREE) {
  const positions = [];
  const colors = [];
  const faces = [];
  const sideA = new THREE.Vector3();
  const sideB = new THREE.Vector3();

  function triangle(a, b, c, color, id) {
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
    faces.push(id);
  }

  function quad(a, b, c, d, color, id) {
    triangle(a, b, c, color, id);
    triangle(a, c, d, color, id);
  }

  function surfaceQuad(a, b, c, d, color) {
    const facingOutward = sideA.subVectors(b, a).cross(sideB.subVectors(c, a)).dot(a) > 0;
    if (facingOutward) quad(a, b, c, d, color);
    else quad(a, d, c, b, color);
  }

  function mesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  return { triangle, quad, surfaceQuad, mesh, faces };
}

function addPlotSurface(batch, plot, outline, rise, colorAt) {
  const center = plot.point(0, 0, rise);
  const rings = [.33, .67, 1].map(scale => outline.map(([x, z]) => plot.point(x * scale, z * scale, rise)));
  for (let index = 0; index < outline.length; index++) {
    const next = (index + 1) % outline.length;
    batch.triangle(center, rings[0][next], rings[0][index], colorAt(0, index), plot.bed.id);
    for (let ring = 1; ring < rings.length; ring++) {
      const inner = rings[ring - 1];
      const outer = rings[ring];
      batch.quad(inner[index], inner[next], outer[next], outer[index], colorAt(ring, index), plot.bed.id);
    }
  }
}

function strip(batch, from, to, halfWidth, steps, pointAt, color) {
  let left = pointAt(from, -halfWidth);
  let right = pointAt(from, halfWidth);
  for (let step = 1; step <= steps; step++) {
    const along = from + (to - from) * step / steps;
    const nextLeft = pointAt(along, -halfWidth);
    const nextRight = pointAt(along, halfWidth);
    batch.surfaceQuad(left, right, nextRight, nextLeft, color);
    left = nextLeft;
    right = nextRight;
  }
}

function pathConnections(plots) {
  const pairs = [];
  for (let first = 0; first < plots.length; first++) {
    for (let second = first + 1; second < plots.length; second++) {
      const closeness = plots[first].normal.dot(plots[second].normal);
      pairs.push({ first, second, closeness });
    }
  }
  pairs.sort((a, b) => b.closeness - a.closeness);

  const parent = plots.map((_, index) => index);
  const count = plots.map(() => 0);
  const connections = new Set();
  function root(i) {
    while (parent[i] !== i) i = parent[i];
    return i;
  }
  function connect(pair) {
    connections.add(pair);
    count[pair.first]++;
    count[pair.second]++;
  }
  for (const pair of pairs) {
    const a = root(pair.first);
    const b = root(pair.second);
    if (a === b) continue;
    parent[a] = b;
    connect(pair);
  }
  for (const pair of pairs) {
    if (pair.closeness < .66) break;
    if (!connections.has(pair) && count[pair.first] < 3 && count[pair.second] < 3) connect(pair);
  }
  return [...connections].map(({ first, second }) => [plots[first], plots[second]]);
}

export function createGlobeTerrain(THREE, beds, paint) {
  const plots = createPlots(THREE, beds);
  const smooth = THREE.MathUtils.smoothstep;
  const color = (key, fallback) => new THREE.Color(paint[key] || fallback);
  const grass = color("hillGreen", "#739256");
  const green = color("leaf", "#5B8C4A");
  const deep = color("evergreen", "#3E6B34");
  const wheat = color("sunshineGround", "#D9AE58");
  const cream = color("cream", "#F7F1E3");
  const soil = color("soil", "#6B4A2F");
  const dry = color("dry", "#8A6B45");
  const water = color("water", "#5A8FA8");

  function groundAt(direction) {
    const raw = terrainRadius(direction);
    for (const plot of plots) {
      const blend = 1 - smooth(plot.distanceFromEdge(direction), .015, .71);
      if (blend > 0) return THREE.MathUtils.lerp(raw, plot.elevation, blend);
    }
    return raw;
  }

  const landGeometry = new THREE.SphereGeometry(radius, 120, 84);
  const vertices = landGeometry.attributes.position;
  const fieldColors = [];
  const point = new THREE.Vector3();
  for (let index = 0; index < vertices.count; index++) {
    point.fromBufferAttribute(vertices, index).normalize();
    const { x, y, z } = point;
    const elevation = groundAt(point);
    const broad = .7 * Math.sin(3.55 * x - 1.6 * z + .6) + .64 * Math.cos(4.7 * y + 2.6 * z);
    const greenVariation = .18 + .65 * smooth(Math.sin(9.3 * x + 2.5 * y - 3 * z), -1, 1);
    const tone = grass.clone().lerp(green, greenVariation);
    tone.lerp(wheat, .81 * smooth(broad, -.12, .78));
    tone.lerp(deep, .40 * smooth(radius - elevation, -.12, .46));
    const pencil = .014 * Math.sin(59 * x + 23 * y) * Math.sin(36 * z - 14 * x);
    tone.multiplyScalar(1 + pencil);
    fieldColors.push(tone.r, tone.g, tone.b);
    point.multiplyScalar(elevation);
    vertices.setXYZ(index, point.x, point.y, point.z);
  }
  landGeometry.setAttribute("color", new THREE.Float32BufferAttribute(fieldColors, 3));
  landGeometry.computeVertexNormals();
  const land = new THREE.Mesh(landGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));

  const trails = createBatch(THREE);
  const trailEdge = wheat.clone().lerp(dry, .36);
  const trailCenter = wheat.clone().lerp(cream, .32);
  for (const [a, b] of pathConnections(plots)) {
    const side = a.normal.clone().cross(b.normal).normalize();
    const offset = .042 * Math.sin(a.normal.x * 38 + b.normal.z * 28);
    function trailPoint(t, across) {
      const direction = a.normal.clone().lerp(b.normal, t)
        .addScaledVector(side, offset * Math.sin(Math.PI * t) + across / radius).normalize();
      return direction.multiplyScalar(groundAt(direction) + .026);
    }
    strip(trails, 0, 1, .25, 25, trailPoint, trailEdge);
    strip(trails, 0, 1, .167, 25, (t, side) => trailPoint(t, side).multiplyScalar(1.0008), trailCenter);
  }

  const banks = createBatch(THREE);
  const bedsTop = createBatch(THREE);
  const lines = createBatch(THREE);
  const irrigation = createBatch(THREE);
  const bankTop = grass.clone().lerp(wheat, .21);
  const border = dry.clone().lerp(wheat, .39);
  const field = dry.clone().lerp(green, .60).lerp(grass, .16);
  const furrow = soil.clone().lerp(deep, .34);
  const dryChannel = soil.clone().lerp(deep, .22);
  const flowing = water.clone().lerp(cream, .16);

  for (const plot of plots) {
    const { width, depth, bed } = plot;
    const foot = roundedOutline(width + .44, depth + .44, .51);
    const wall = roundedOutline(width + .16, depth + .16, .39);
    const soilEdge = roundedOutline(width, depth, .34);
    addPlotSurface(banks, plot, foot, -.158, () => bankTop);
    for (let index = 0; index < wall.length; index++) {
      const next = (index + 1) % wall.length;
      banks.quad(plot.point(...foot[index], -.16), plot.point(...wall[index], -.022),
        plot.point(...wall[next], -.022), plot.point(...foot[next], -.16), soil);
      banks.quad(plot.point(...soilEdge[index], 0), plot.point(...soilEdge[next], 0),
        plot.point(...wall[next], -.022), plot.point(...wall[index], -.022), border);
    }
    addPlotSurface(bedsTop, plot, soilEdge, 0, (ring, index) =>
      field.clone().multiplyScalar(1 - .04 * ring + .022 * Math.sin(index * .8 + plot.normal.y * 8)));

    const rowCount = Math.min(12, Math.max(3, Math.ceil(Math.sqrt((bed.slots?.length ?? 0) * depth / width))));
    for (let row = 1; row <= rowCount; row++) {
      const z = depth * (row / (rowCount + 1) - .5);
      strip(lines, -width / 2 + .31, width / 2 - .31, .024, 12,
        (x, across) => plot.point(x, z + across + .019 * Math.sin(x * 2 + row), .016), furrow);
    }

    const funded = bed.slots?.some(slot => {
      const amount = slot.record?.award_amount_parsed;
      return slot.awards > 0 || Boolean(amount && (amount.floor > 0 || amount.ceiling > 0));
    });
    for (const side of [-1, 1]) {
      const lane = side * (width / 2 - .12);
      const start = -depth / 2 + .26;
      const end = depth / 2 - .26;
      strip(lines, start, end, .086, 18, (z, across) => plot.point(lane + across, z, .022), dryChannel);
      if (funded) {
        strip(irrigation, start, end, .057, 18, (z, across) => plot.point(lane + across, z, .041), flowing);
        strip(irrigation, start + .23, end - .21, .013, 12,
          (z, across) => plot.point(lane + across - .025, z, .044), cream);
      }
    }
  }

  return {
    plots,
    land,
    trails: trails.mesh(),
    banks: banks.mesh(),
    pads: bedsTop.mesh(),
    padFaces: bedsTop.faces,
    lines: lines.mesh(),
    wet: irrigation.mesh(),
  };
}
