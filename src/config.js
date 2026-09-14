// Non-endpoint labels are snapped to the nearest point on the GPX track, so a dot
// never floats off the line it is meant to be naming — Montara's town centre sat
// more than a kilometre inland of the road the ride actually took. Half Moon Bay
// Half Moon Bay is the exception: a hand-picked point in the town itself
// (37°28'07.0"N 122°25'58.6"W), just inland of the highway the ride took.
export const CITY_LABELS = [
  { name: 'stanford', lat: 37.406132, lon: -122.126204, major: true, anchor: 'left' },
  { name: 'woodside', lat: 37.429352, lon: -122.253792, anchor: 'right' },
  { name: 'kings mountain road', lat: 37.427306, lon: -122.305141, anchor: 'right', stack: true },
  { name: 'tunitas creek', lat: 37.395722, lon: -122.365583, anchor: 'right' },
  { name: 'half moon bay', lat: 37.468611, lon: -122.432944, anchor: 'right' },
  { name: 'montara', lat: 37.549803, lon: -122.508032, anchor: 'right' },
  { name: 'devils slide', lat: 37.569161, lon: -122.514987, anchor: 'right' },
  { name: 'pacifica', lat: 37.613971, lon: -122.487232, anchor: 'right' },
  { name: 'daly city', lat: 37.687885, lon: -122.470050, anchor: 'right' },
  { name: 'san francisco', lat: 37.782112, lon: -122.393594, major: true, anchor: 'right' }
];


// When true the drifting column only shows frames whose capture time is known, so
// the clock rail beside it actually lines up with what you are looking at.
export const HIDE_UNDATED_MEDIA = true;
