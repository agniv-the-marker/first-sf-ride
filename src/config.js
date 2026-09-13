// Capture metadata does not include reliable GPS positions, so this is deliberately easy to edit.
export const MEDIA_MANIFEST = [
  { id: 'img-01', src: 'peak-bikeride/peak-bikeride/IMG_6453.JPG', at: 0.04, order: 0, span: 2 },
  { id: 'img-02', src: 'peak-bikeride/peak-bikeride/IMG_6460.JPG', at: 0.16, order: 1, span: 1 },
  { id: 'img-03', src: 'peak-bikeride/peak-bikeride/IMG_6477.JPG', at: 0.30, order: 2, span: 1 },
  { id: 'img-04', src: 'peak-bikeride/peak-bikeride/IMG_6484.JPG', at: 0.45, order: 3, span: 2 },
  { id: 'img-05', src: 'peak-bikeride/peak-bikeride/IMG_6485.JPG', at: 0.60, order: 4, span: 1 },
  { id: 'video-01', src: 'peak-bikeride/peak-bikeride/MVI_6467.mp4', poster: 'peak-bikeride/peak-bikeride/IMG_6468.JPG', at: 0.75, order: 5, span: 1, video: true },
  { id: 'img-07', src: 'peak-bikeride/peak-bikeride/IMG_6482.JPG', at: 0.91, order: 6, span: 2 }
];

export const CITY_LABELS = [
  { name: 'stanford', lat: 37.406132, lon: -122.126204, major: true, anchor: 'left' },
  { name: 'woodside', lat: 37.4292, lon: -122.2539, anchor: 'right' },
  { name: 'half moon bay', lat: 37.4636, lon: -122.4286, anchor: 'left' },
  { name: 'montara', lat: 37.5429, lon: -122.5161, anchor: 'left' },
  { name: 'pacifica', lat: 37.6138, lon: -122.4869, anchor: 'right' },
  { name: 'san francisco', lat: 37.782112, lon: -122.393594, major: true, anchor: 'right' }
];
