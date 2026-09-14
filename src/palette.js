// The page's two accents travel through the day the way the water does, but they
// have to stay legible as type on a near-black ground and they have to stay told
// apart: at every hour the warm one reads orange-to-rose and the cool one reads
// teal-to-indigo, so the two authorial voices never collapse into each other.
const ACCENTS = [
  { hour: 0, warm: [214, 110, 138], cool: [104, 124, 196] },
  { hour: 6, warm: [230, 138, 116], cool: [116, 168, 196] },
  { hour: 9, warm: [222, 120, 88], cool: [130, 190, 186] },
  { hour: 12, warm: [217, 104, 79], cool: [130, 168, 164] },
  { hour: 16, warm: [226, 140, 72], cool: [150, 176, 132] },
  { hour: 19, warm: [230, 112, 62], cool: [156, 142, 190] },
  { hour: 21, warm: [214, 96, 112], cool: [118, 124, 190] },
  { hour: 24, warm: [214, 110, 138], cool: [104, 124, 196] }
];

const channel = value => Math.max(0, Math.min(255, Math.round(value)));
const css = rgb => `rgb(${channel(rgb[0])} ${channel(rgb[1])} ${channel(rgb[2])})`;

export function accentsAt(hour) {
  const value = ((hour % 24) + 24) % 24;
  let index = 1;
  while (index < ACCENTS.length - 1 && ACCENTS[index].hour < value) index += 1;
  const before = ACCENTS[index - 1];
  const after = ACCENTS[index];
  const span = after.hour - before.hour;
  const amount = span ? (value - before.hour) / span : 0;
  const mix = key => before[key].map((start, position) => start + (after[key][position] - start) * amount);
  return { warm: css(mix('warm')), cool: css(mix('cool')) };
}
