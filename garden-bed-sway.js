import { seededOffset } from "./garden-globe-crops.js";

const sway = {
  amplitude: [1.7, 2.35],
  period: [3.2, 4.8],
  rut: { amplitude: .3, period: 6 },
  attention: 1.06,
};
const turn = Math.PI * 2;
const radians = Math.PI / 180;

export function createBedSway(THREE, picks, meshes, slots) {
  const up = new THREE.Vector3(0, 1, 0);
  const corn = new Set(slots.filter(slot => slot.crop === "corn").map(slot => slot.record.opportunity_id));
  const states = new Map(picks.map(pick => {
    const dry = corn.has(pick.id);
    const seed = name => seededOffset(pick.id + ":bed-" + name);
    const amplitude = (dry ? sway.rut.amplitude : THREE.MathUtils.lerp(...sway.amplitude, seed("bend"))) * radians;
    const period = dry ? sway.rut.period : THREE.MathUtils.lerp(...sway.period, seed("meter"));
    const heading = seed("wind") * turn;
    return [pick.id, {
      pick, amplitude, period, dry, phase: seed("phase") * turn,
      axis: new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)),
      direction: (pick.axis || up).clone(),
      transform: new THREE.Matrix4(),
    }];
  }));
  const matrix = new THREE.Matrix4();
  const offset = new THREE.Vector3();
  const batches = meshes.map(mesh => {
    const entries = mesh.userData.recordIds.map((id, index) => {
      const rest = new THREE.Matrix4();
      mesh.getMatrixAt(index, rest);
      return { rest, state: states.get(id) };
    });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Three's instance sphere is cached, so give raycasting room for the live crown.
    mesh.boundingSphere.radius += Math.max(0, ...entries.map(({ state }) =>
      Math.sin(state.amplitude * sway.attention) * (state.pick.height + state.pick.width / 2)));
    return { mesh, entries };
  });
  let lastElapsed;
  let lastSelected;

  return {
    update(elapsed, selected) {
      if (elapsed === lastElapsed && selected === lastSelected) return;
      lastElapsed = elapsed;
      lastSelected = selected;
      const strength = Math.min(1, elapsed / .5);
      for (const state of states.values()) {
        const { pick, amplitude, period, phase, axis, transform } = state;
        const attention = !state.dry && pick.id === selected ? sway.attention : 1;
        const angle = Math.sin(elapsed * turn / period + phase) * amplitude * strength * attention;
        transform.makeRotationAxis(axis, angle);
        offset.copy(pick.position).applyMatrix4(transform);
        transform.setPosition(offset.sub(pick.position).negate());
        state.direction.copy(pick.axis || up).transformDirection(transform);
      }
      for (const { mesh, entries } of batches) {
        entries.forEach(({ rest, state }, index) => {
          mesh.setMatrixAt(index, matrix.multiplyMatrices(state.transform, rest));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    point(pick, fraction, target) {
      return target.copy(pick.position).addScaledVector(states.get(pick.id).direction, pick.height * fraction);
    },
    reach(pick) {
      return Math.sin(states.get(pick.id).amplitude * sway.attention) * pick.height;
    },
  };
}
