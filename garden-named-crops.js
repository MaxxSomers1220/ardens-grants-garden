const mind = Object.freeze({
  id: "mind",
  name: "Mind Plant",
  description: "A pink cloud for a bloom — soft, round and thinky — on a straight stem with one tiny bud. The brain bed and the feelings bed share it.",
  scale: 1,
  bloomX: 14.4,
  bloomY: 3.5,
});

export const namedGardenCrops = Object.freeze({
  rare: Object.freeze({
    id: "rare",
    name: "Rare Plant",
    description: "A purple flower on a golden-yellow stem, shedding petals as it grows. Only six plants in its bed — rare means rare.",
    scale: .98,
    bloomX: 14.3,
    bloomY: 4.2,
  }),
  neuro: mind,
  ai: Object.freeze({
    id: "data",
    name: "Data Plant",
    description: "Not a flower at all: a dark block stacked with rows and rows of data, and one bright blue blob escaping out the side.",
    scale: .99,
    bloomX: 15.4,
    bloomY: 3.3,
  }),
  infectious: Object.freeze({
    id: "germ",
    name: "Germ Plant",
    description: "A green spiky germ creature with knobs all round and a great big grin. Friendly here — in its bed it stays where the garden can watch it.",
    scale: 1.04,
    bloomX: 15.5,
    bloomY: 3.9,
  }),
  engineering: Object.freeze({
    id: "science",
    name: "Science Plant",
    description: "The biggest of the eight: a wide teal fan covered in letters and numbers — E, 2, A, 4, R — like it is reciting the whole lab at once.",
    scale: 1.16,
    bloomX: 17.7,
    bloomY: 4.4,
  }),
  medicine: Object.freeze({
    id: "medicine",
    name: "Medicine Plant",
    description: "A little red-and-blue flower on a thick red stem, one purple bulb swelling at its side and a blue tip at the root — a dose, growing.",
    scale: 1,
    bloomX: 14.9,
    bloomY: 3.8,
  }),
  publichealth: Object.freeze({
    id: "health",
    name: "Health Plant",
    description: "A white mug with a red cross for a bloom and a thermometer for a stem — pink at the top, blue at the tip. Take your temperature, then your tea.",
    scale: .96,
    bloomX: 15.3,
    bloomY: 4.1,
  }),
  behavioral: mind,
  heritage: Object.freeze({
    id: "art",
    name: "Art Plant",
    description: "An artist's palette for a flower head — yellow, green, purple, pink and blue paint dots — held up by its own paintbrush.",
    scale: 1.02,
    bloomX: 15.9,
    bloomY: 4,
  }),
});

// The shared local frame is 20 by 20 units, with the stem anchored at (10, 20).
export function namedCropDefinitions(paint = {}) {
  const cream = paint.cream || "#F7F1E3";
  const tone = color => `color-mix(in srgb, ${color}, ${cream} var(--named-crop-wash, 0%))`;
  const line = "var(--named-crop-line, .55)";
  const ink = tone(paint.ink || "#2E3A45");
  const paper = tone("#FBF3DE");
  const pink = tone("#CF83A5");
  const rose = tone("#A14C72");
  const blue = tone("#5EA8CA");
  const blueShade = tone("#3D7599");
  const violet = tone(paint.podPurple || "#9B79AF");
  const violetShade = tone("#6F538D");
  const scarlet = tone("#BA4E4C");
  const redShade = tone("#8F4545");
  const gold = tone("#D9AD50");
  const leaf = tone(paint.leaf || "#5B8C4A");
  const lime = tone("#8FA967");
  const teal = tone("#69A899");
  const tealShade = tone("#41786E");
  const soil = tone(paint.soil || "#6B4A2F");

  return `<g id="garden-named-crop-mind" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.3 19.35V8.7h1.38v10.65Q10.05 20.16 9.3 19.35Z"
      fill="${rose}" stroke="${rose}" stroke-width="${line}"/>
    <path d="M10.45 14.28c.18-1.97 1.35-3.15 2.93-3.33.22 1.69-.96 3.23-2.93 3.33Z"
      fill="${pink}" stroke="${rose}" stroke-width="${line}"/>
    <path d="M6.28 10.17C3.1 10.13 3.1 5.4 6.11 4.52c.26-1.82 2.14-2.92 4-2.81
      1.45.05 2.21.63 2.8 1.42 2.19-.21 3.59 1.58 3.43 3.16-.15 2.2-1.38 3.72-3.3 3.81Z"
      fill="${pink}" stroke="${rose}" stroke-width="${line}"/>
    <path d="M6.27 6.2q3.5-2.04 7.22.02M7.25 8.23q2.85-1.49 5.92-.08"
      fill="none" stroke="${rose}" stroke-width="${line}"/>
  </g>
  <g id="garden-named-crop-data" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.3 19.7V8.88h1.2v10.93Z" fill="${ink}"/>
    <path d="M10.18 13.02q1.14-1.32 2.23-1.2" fill="none" stroke="${ink}" stroke-width="${line}"/>
    <path d="M5.64 2.24 14.21 2.15 14.2 10.16 5.69 10.28Z"
      fill="${ink}" stroke="${ink}" stroke-width="${line}"/>
    <path d="M7.24 4.13h5.35m-5.35 1.99h5.35m-5.35 1.99h5.35"
      fill="none" stroke="${tone("#AABCCC")}" stroke-width=".75"/>
    <path d="M10.93 13.35c.12-1.67 2.01-2.32 3.24-2.15 1.34.17 2.31 1.14 2.12 2.32
      -.17 1.25-1.58 2.19-3.03 2.17-1.58-.02-2.46-.95-2.33-2.34Z"
      fill="${blue}" stroke="${blueShade}" stroke-width="${line}"/>
  </g>
  <g id="garden-named-crop-science" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 20 9.3 9.7h1.44L12 20q-2.01-.98-4 0Z" fill="${teal}"/>
    <path d="M3.1 3.16c2.14 1.18 3.64.17 4.57-1.46q2.44 2.62 4.76-.13
      c1.2 1.83 2.71 2.64 4.51 1.54.12 4.77-2.12 7.82-6.93 8.57-4.88-.67-6.95-3.67-6.91-8.52Z"
      fill="${teal}" stroke="${tealShade}" stroke-width="${line}"/>
    <path d="M7.6 5.37H6.22v1.94H7.6M6.22 6.31h1.03
      M9.61 4.49c.29-.59 1.3-.49 1.29.17-.01.53-.69.86-1.26 1.37h1.43
      M12.6 7.28l.78-1.92.82 1.92m-1.3-.71h.98
      M9.12 7.78l-.88 1.14h1.47m-.38-.88v1.77
      M11.67 10V7.9h.66c1.03 0 1.03 1.09 0 1.09h-.66m.7.04.94.95"
      fill="none" stroke="${ink}" stroke-width=".37"/>
  </g>
  <g id="garden-named-crop-medicine" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.15 18.2V5.14h1.69V18.2Z" fill="${scarlet}" stroke="${redShade}" stroke-width="${line}"/>
    <path d="M10.45 13.82q1.48-1.39 2.52-1.31" fill="none" stroke="${redShade}" stroke-width="${line}"/>
    <path d="M12.1 11.52c.33-1.24 1.39-1.94 2.51-1.68 1.1.26 1.67 1.72 1.53 2.96
      -.17 1.57-1.07 2.67-2.4 2.41-1.39-.27-1.98-2.32-1.64-3.69Z"
      fill="${violet}" stroke="${violetShade}" stroke-width="${line}"/>
    <circle cx="9.97" cy="3" r="1.55" fill="${pink}"/>
    <circle cx="7.96" cy="4.54" r="1.46" fill="${blue}"/>
    <circle cx="12.02" cy="4.43" r="1.44" fill="${tone("#BC6393")}"/>
    <circle cx="8.72" cy="6.53" r="1.47" fill="${scarlet}"/>
    <circle cx="11.54" cy="6.53" r="1.4" fill="${blue}"/>
    <circle cx="10.06" cy="4.95" r=".94" fill="${gold}"/>
    <path d="M9.19 17.47q.82-.71 1.65 0v1.52q-.09.97-.84 1.01-.76-.04-.81-1.01Z"
      fill="${blueShade}"/>
  </g>
  <g id="garden-named-crop-art" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 19.75.15-10.94 1.44.07.67 10.87q-1.16.38-2.26 0Z"
      fill="${soil}" stroke="${ink}" stroke-width="${line}"/>
    <path d="m8.84 9.86.11-1.71 1.99.06.14 1.64Z" fill="${ink}"/>
    <path d="M4.2 5.55c.05-2.25 3.26-3.85 6.23-3.83 3.05.02 5.64 1.62 5.65 3.67
      .01 2.32-3.08 3.86-6.19 3.83-2.91-.03-5.75-1.48-5.69-3.67Z"
      fill="${paper}" stroke="${soil}" stroke-width="${line}"/>
    <circle cx="7.07" cy="4.46" r=".94" fill="${gold}"/>
    <circle cx="9.75" cy="3.67" r=".94" fill="${leaf}"/>
    <circle cx="12.55" cy="4.31" r=".95" fill="${violetShade}"/>
    <circle cx="8.15" cy="6.89" r=".96" fill="${rose}"/>
    <circle cx="11.1" cy="6.94" r=".94" fill="${blue}"/>
    <circle cx="13.82" cy="6.45" r=".76" fill="${tone("#C77A57")}"/>
  </g>
  <g id="garden-named-crop-rare" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.42 19.38c-.48-3.35-.44-7.61.1-11.47h1.59c-.67 3.9-.67 7.72-.23 11.43
      -.3.62-1.08.63-1.46.04Z" fill="${gold}" stroke="${gold}" stroke-width="${line}"/>
    <path d="M10.23 14.81q.92-2.82 3.6-2.75-.15 2.39-3.6 2.75Z" fill="${lime}"/>
    <path d="M6.38 3.03q1.26 1.68 2.19 1.79L10.05 2l1.48 2.78q1.14-.41 2.08-1.69
      c.62 3.3-.78 5.84-3.55 6.36-2.61-.52-4.25-3.12-3.68-6.42Z"
      fill="${violetShade}" stroke="${violetShade}" stroke-width="${line}"/>
    <path d="M6.83 4.35c1.16 1.13 2.31 1.5 3.22 1.45 1.04.03 2.04-.42 3.11-1.45
      -.17 2.41-1.24 3.94-3.13 4.25-1.94-.39-2.97-1.83-3.2-4.25Z" fill="${violet}"/>
    <path d="m10.03 1.66.58 1.27 1.38.13-1.07.89.27 1.36-1.16-.73-1.15.73.26-1.36-1.04-.89 1.36-.13Z"
      fill="${tone("#B89DCB")}"/>
    <ellipse cx="15.3" cy="7.75" rx=".99" ry=".62" transform="rotate(-13 15.3 7.75)" fill="${pink}"/>
    <ellipse cx="5.02" cy="11.8" rx="1.1" ry=".66" transform="rotate(-24 5.02 11.8)" fill="${violet}"/>
    <ellipse cx="15.46" cy="14.72" rx="1.12" ry=".65" transform="rotate(22 15.46 14.72)" fill="${violet}"/>
    <ellipse cx="5.65" cy="17.12" rx=".93" ry=".59" transform="rotate(18 5.65 17.12)" fill="${violetShade}"/>
  </g>
  <g id="garden-named-crop-germ" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.4 19.6v-7.8h1.17v7.8q-.58.73-1.17 0Z" fill="${leaf}"/>
    <path d="M8.61 3.12a1.39 1.39 0 1 1 2.78 0l-.12.7q.99.11 1.8.65l.38-.48
      a1.27 1.27 0 1 1 1.99 1.58l-.57.49q.47.69.64 1.38l.72-.07a1.28 1.28 0 1 1 .21 2.55l-.85.1
      q-.12.82-.56 1.46l.52.56a1.29 1.29 0 1 1-1.89 1.76l-.48-.55q-.75.41-1.66.55l.02.61
      a1.29 1.29 0 1 1-2.58.01v-.65q-.84-.04-1.6-.53l-.61.52a1.25 1.25 0 1 1-1.61-1.91l.55-.46
      q-.45-.67-.56-1.39l-.77.06a1.28 1.28 0 1 1-.14-2.55l.8.02q.16-.86.64-1.53l-.6-.5
      a1.24 1.24 0 1 1 1.6-1.89l.59.5q.76-.5 1.53-.62Z"
      fill="${leaf}" stroke="${leaf}" stroke-width="${line}"/>
    <path d="M14.88 9.08c-.02 2.73-2.17 4.44-4.85 4.46-2.67.02-4.8-1.9-4.86-4.51
      -.07-2.67 2.18-4.63 4.9-4.65 2.72-.02 4.83 1.99 4.81 4.7Z"
      fill="${lime}" stroke="${leaf}" stroke-width="${line}"/>
    <path d="m7.35 7.04 1.75.45m1.85.01 1.72-.51M7.98 10.06q2.05 2.4 4.2-.02"
      fill="none" stroke="${ink}" stroke-width=".68"/>
    <circle cx="8.56" cy="8.41" r=".52" fill="${ink}"/>
    <circle cx="11.57" cy="8.39" r=".52" fill="${ink}"/>
  </g>
  <g id="garden-named-crop-health" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.3 15.16v-4.41a.71.71 0 0 1 1.42 0v4.41a.71.71 0 0 1-1.42 0Z"
      fill="${pink}" stroke="${rose}" stroke-width="${line}"/>
    <path d="M10.01 15.76v1.86" fill="none" stroke="${blueShade}" stroke-width="${line}"/>
    <circle cx="10.01" cy="18.6" r="1.22" fill="${blueShade}"/>
    <path d="M14.72 5.08c1.91-.07 2.31.93 2.03 2.13-.13.94-.89 1.53-2.03 1.51"
      fill="none" stroke="${ink}" stroke-width="1.02"/>
    <path d="M7.35 3.48h5.36c1.52 0 2.21.74 2.27 2.02l-.08 2.7c-.04 1.25-.85 2.03-2.16 2.03H7.28
      c-1.39 0-2.19-.66-2.17-1.95l-.02-2.66c-.01-1.42.8-2.15 2.26-2.14Z"
      fill="${paper}" stroke="${ink}" stroke-width="${line}"/>
    <path d="M9.25 4.77h1.56v1.36h1.38v1.56h-1.38v1.38H9.25V7.69H7.86V6.13h1.39Z"
      fill="${scarlet}"/>
  </g>`;
}
