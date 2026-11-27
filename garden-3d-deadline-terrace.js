import * as THREE from "./vendor/three-0.180.0/three.module.min.js";
import { addGlobeCrops } from "./garden-globe-crops.js";

const up = new THREE.Vector3(0, 1, 0);
const { lerp, smoothstep } = THREE.MathUtils;

const originalDepth = 2.72;
const shelfGap = .54;
const originalExtent = originalDepth * 1.5 + shelfGap;

function shelfDepth(count) {
  if (count < 9) return 1.65 + count * .08;
  if (count <= 18) return originalDepth;
  return Math.min(5.3, .35 + Math.sqrt(count) * .58);
}

function block(surface, x, y, z, width, height, depth, turn, color) {
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  const outline = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const point = ([u, v], level) => {
    const side = u * width / 2;
    const along = v * depth / 2;
    return new THREE.Vector3(x + side * cosine + along * sine, level, z - side * sine + along * cosine);
  };
  const foot = outline.map(corner => point(corner, y));
  const top = outline.map(corner => point(corner, y + height));
  surface.wall(foot, top, index => color.clone().multiplyScalar(index % 2 ? .87 : 1));
  const cap = color.clone().multiplyScalar(1.14);
  surface.triangle(top[0], top[2], top[1], cap);
  surface.triangle(top[0], top[3], top[2], cap);
}

export function createDeadlineTerrace(bed, plotGroup, paint, { createSurface, loop, addTrail, groundShadow }) {
  const bands = bed.deadlinePath.terraces;
  const width = 9.20;
  const depths = bands.map(band => shelfDepth(band.slots.length));
  const extent = (depths.reduce((sum, depth) => sum + depth, 0) + shelfGap * Math.max(0, bands.length - 1)) / 2;
  const originalLayout = depths.length === 3 && depths.every(depth => depth === originalDepth);
  let front = extent;
  const centers = originalLayout ? [3.26, 0, -3.26] : depths.map(depth => {
    const center = front - depth / 2;
    front -= depth + shelfGap;
    return center;
  });
  const extraDepth = originalLayout ? 0 : extent - originalExtent;
  const stretch = 1 + extraDepth / originalExtent;
  const tierRise = Math.min(.475, 1.34 / Math.max(1, bands.length - 1));
  const approachSteps = originalLayout ? [[-2.6, -.9], [.66, 2.6]]
    : centers.slice(0, -1).map((center, index) => [
      -center + Math.min(.66, depths[index] / 3),
      -centers[index + 1] - Math.min(.86, depths[index + 1] / 3),
    ]);
  const approachRise = originalLayout ? .30 : tierRise * .63;
  const resizeZ = z => Math.abs(z) > originalExtent ? z + Math.sign(z) * extraDepth : z * stretch;
  const color = (token, fallback) => new THREE.Color(paint[token] || fallback);
  const cream = color("cream", "#F7F1E3");
  const ink = color("ink", "#2E3A45");
  const earth = color("soil", "#6B4A2F").lerp(ink, .25);
  const dry = color("dry", "#8A6B45");
  const green = color("leaf", "#5B8C4A");
  const deep = color("evergreen", "#3E6B34");
  const grass = color("hillGreen", "#69A84F");
  const straw = color("sunshineGround", "#F5E98A");
  const creek = color("water", "#5A8FA8").lerp(cream, .12);
  const walk = dry.clone().lerp(straw, .54).lerp(cream, .15);
  const track = dry.clone().lerp(earth, .25);
  const moss = grass.clone().lerp(green, .50).lerp(straw, .09);

  const lawn = (x, z) => .05
    + approachSteps.reduce((height, [low, high]) => height + approachRise * smoothstep(-z, low, high), 0)
    + .043 * Math.sin(x * .67 + z * .51);
  const floor = createSurface();
  const apron = loop(13.12, 11.46 + extraDepth * 2, .56, lawn, .27, 1.7);
  const ledge = loop(12.92, 11.25 + extraDepth * 2, .58, (x, z) => lawn(x, z) - .15, .25, 1.7);
  const underside = loop(12.03, 10.41 + extraDepth * 2, .59, (x, z) => -.49 + .06 * Math.sin(x + z * .2), .24, 1.66);
  floor.wall(underside, ledge, index => earth.clone().multiplyScalar(.89 + .12 * Math.cos(index * .96)));
  floor.wall(ledge, apron, index => deep.clone().lerp(earth, .52 + .10 * Math.sin(index)));
  const meadow = moss.clone().lerp(straw, .13);
  floor.cover(apron, lawn, ({ x, z }) => moss.clone().lerp(meadow,
    .47 + .22 * Math.sin(x * .83 - z * .57) + .18 * Math.cos(z * .76)));

  const markers = [];
  const terraces = bands.map((band, index) => {
    const depth = depths[index];
    const center = centers[index];
    const elevation = .29 + index * tierRise;
    const top = (x, z) => elevation + .032 * Math.cos(x * .59 + z * .71) + .022 * Math.sin(x * 1.21 + index);
    const pad = dry.clone().lerp(earth, .53).lerp(green, .17);
    const verge = pad.clone().lerp(straw, .09);
    const shift = points => points.map(point => point.add(new THREE.Vector3(0, 0, center)));
    const turfEdge = shift(loop(width + .31, depth + .23, .36, (x, z) => top(x, z + center), .063, index + .4));
    const footing = shift(loop(width + .80, depth + .57, .42, (x, z) => lawn(x, z + center) + .02, .079, index + .4));
    const rise = shift(loop(width + .54, depth + .38, .39,
      (x, z) => lerp(lawn(x, z + center), top(x, z + center), .64), .068, index + .45));
    floor.wall(footing, rise, segment => earth.clone().multiplyScalar(1 + .12 * Math.sin(segment * 1.13 + index)));
    floor.wall(rise, turfEdge, segment => pad.clone().lerp(earth, .23 + .085 * Math.cos(segment)));
    floor.cover(turfEdge, top, ({ x, z }) => pad.clone().lerp(verge,
      .53 + .16 * Math.cos(x * .84 + z * 1.68) + .17 * Math.sin(z * 3.48)), [0, center]);
    return {
      band, center, top,
      plot: {
        bed: { id: bed.id, slots: band.slots },
        width, depth, normalAt: () => up,
        point(x, z, lift = 0) {
          // The shared planter advances toward positive local z. Mirror it so earlier rows face the entrance.
          const distance = center - z;
          return new THREE.Vector3(x, top(x, distance) + lift, distance);
        },
      },
    };
  });

  const trail = [[-1.85, 5.21], [-.77, 4.98], [.78, 4.95], [2.71, 4.92],
    [4.54, 4.70], [5.38, 3.61], [5.55, 2.18], [5.49, .71], [5.58, -.86],
    [5.40, -2.27], [5.43, -3.67], [4.96, -4.70], [3.92, -5.06]];
  addTrail(floor, trail.map(([x, z]) => [x, resizeZ(z)]), lawn, walk, track, 1.42);
  const wood = earth.clone().lerp(dry, .43);
  const plaque = wood.clone().lerp(straw, .25);
  for (const { band, center, top } of terraces) {
    const z = center + .06;
    const x = 5.7;
    const riseToPlot = (x, z) => lerp(top(x, z), lawn(x, z), smoothstep(x, 4.35, 5.45));
    addTrail(floor, [[5.43, z + .25], [5.04, z + .10], [4.67, z], [4.23, z - .08]],
      riseToPlot, walk, track, 1.14);
    const y = lawn(x, z);
    block(floor, x, y, z, .11, .59, .11, .12, wood);
    block(floor, x, y + .43, z + .04, .57, .24, .09, .12, plaque);
    markers.push({ id: band.id, point: new THREE.Vector3(5.55, y + .63, z + .07) });
  }

  const doorway = { x: -1.64, z: resizeZ(5.17) };
  for (const side of [-1, 1]) {
    const x = doorway.x + side * .51;
    const y = lawn(x, doorway.z);
    block(floor, x, y, doorway.z, .15, .85, .14, .03, wood);
    block(floor, x, y + .82, doorway.z, .22, .08, .20, .03, plaque);
  }
  const entryY = lawn(doorway.x, doorway.z);
  block(floor, doorway.x, entryY + .73, doorway.z, 1.11, .17, .12, .03, plaque);
  markers.unshift({
    id: "entrance",
    point: new THREE.Vector3(doorway.x - .18, entryY + .72, doorway.z + .31),
  });

  const groundMesh = floor.mesh();
  groundMesh.name = "Garden entrance and deadline terrace soil";
  const cropGroup = new THREE.Group();
  plotGroup.add(groundShadow(underside, ink.clone().lerp(earth, .37)), groundMesh, cropGroup);
  const crops = addGlobeCrops(THREE, cropGroup, terraces.map(terrace => terrace.plot), paint, { detailedBed: true });

  const detail = createSurface();
  const irrigated = createSurface();
  const furrow = earth.clone().lerp(deep, .18);
  const furrowShoulder = furrow.clone().lerp(dry, .44);
  const dryDitch = earth.clone().lerp(deep, .28);
  let nextLayout = 0;
  for (const { band, center, top, plot } of terraces) {
    const layout = band.slots.length ? crops.layouts[nextLayout++] : null;
    for (const row of layout?.rows ?? []) {
      const z = center - row.z - layout.strideZ * .31;
      const half = Math.min(width / 2 - .34, row.width / 2 + .25);
      const rowPoint = (x, across) => {
        const along = z - across + .043 * Math.sin(x * 1.36 + z * .59);
        return new THREE.Vector3(x, top(x, along) + .023, along);
      };
      detail.ribbon(-half, half, 28, rowPoint,
        x => .030 + .059 * (1 - (x / half) ** 2),
        index => furrow.clone().lerp(furrowShoulder, .24 + .18 * Math.sin(index * .52)));
    }
    const funded = band.slots.some(slot => {
      const amount = slot.record?.award_amount_parsed;
      return slot.awards > 0 || Boolean(amount && (amount.floor > 0 || amount.ceiling > 0));
    });
    // The two irrigation edges follow the actual cropped shelf, leaving the walk unobstructed.
    for (const side of [-1, 1]) {
      const x = side * (width / 2 - .11);
      const span = plot.depth / 2 - .23;
      const cut = (z, across, lift) => plot.point(x + across + .025 * Math.sin(z * 2.3), -z, lift);
      detail.ribbon(-span, span, 18, (z, across) => cut(z, across, .027), () => .088, () => dryDitch);
      if (funded) {
        irrigated.ribbon(-span, span, 18, (z, across) => cut(z, across, .032), () => .060, () => creek);
        irrigated.ribbon(-span + .11, span - .10, 17,
          (z, across) => cut(z, across - .023, .038), () => .010, () => cream);
      }
    }
  }

  const tufts = [[-5.51, 4.40], [-5.55, 1.84], [-5.72, -.95], [-5.5, -3.51],
    [2.86, 5.17], [6.0, 2.20], [5.89, -1.77], [-2.54, -5.17], [2.32, -5.12]];
  for (const [index, [x, originalZ]] of tufts.entries()) {
    const z = resizeZ(originalZ);
    for (let blade = 0; blade < 5; blade++) {
      const phase = blade * 2.17 + index;
      const vx = x + .19 * Math.cos(phase);
      const vz = z + .12 * Math.sin(phase);
      const root = new THREE.Vector3(vx, lawn(vx, vz) + .01, vz);
      const foot = root.clone().add(new THREE.Vector3(.071, .012, .011));
      const tip = root.clone().add(new THREE.Vector3(.11 * Math.cos(phase), .20 + .10 * Math.sin(phase) ** 2, .08));
      const tint = blade % 2 ? moss.clone().lerp(deep, .37) : meadow;
      detail.triangle(root, foot, tip, tint);
      detail.triangle(foot, root, tip, tint);
    }
  }
  const wet = irrigated.mesh();
  plotGroup.add(detail.mesh(), wet);

  return {
    crop: crops, cropGroup, groundMesh, wet, markers, shadowColor: earth,
    fit: [...underside, ...apron, ...markers.map(marker => marker.point)],
  };
}
