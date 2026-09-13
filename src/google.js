import { GOOGLE_MAPS_API_KEY } from './config.js';

let googleReady;
function loadGoogleMaps() {
  if (googleReady) return googleReady;
  googleReady = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) return resolve(null);
    window.__rideGoogleReady = () => resolve(window.google);
    const script = document.createElement('script'); script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=__rideGoogleReady`; script.async = true; script.defer = true; script.onerror = reject; document.head.append(script);
    window.setTimeout(() => resolve(null), 4500);
  });
  return googleReady;
}

export async function createGroundView(container, initialPoint) {
  const google = await loadGoogleMaps().catch(() => null);
  if (!google) {
    container.innerHTML = `<iframe title="Google ground view" src="https://www.google.com/maps?layer=c&amp;cbll=${initialPoint.lat},${initialPoint.lon}&amp;cbp=12,0,0,0,0&amp;output=embed" loading="lazy"></iframe>`;
    let lastPoint = initialPoint;
    return { setPosition: point => { if (!point || (Math.abs(point.lat - lastPoint.lat) < 0.002 && Math.abs(point.lon - lastPoint.lon) < 0.002)) return; lastPoint = point; const frame = container.querySelector('iframe'); if (frame) frame.src = `https://www.google.com/maps?layer=c&cbll=${point.lat},${point.lon}&cbp=12,0,0,0,0&output=embed`; } };
  }
  try {
    const panorama = new google.maps.StreetViewPanorama(container, { position: initialPoint, pov: { heading: 0, pitch: 0 }, zoom: 1, addressControl: false, fullscreenControl: true, linksControl: true, motionTrackingControl: false, panControl: false });
    const service = new google.maps.StreetViewService();
    const showFallback = point => { container.innerHTML = `<iframe title="Google ground view" src="https://www.google.com/maps?layer=c&amp;cbll=${point.lat},${point.lon}&amp;cbp=12,0,0,0,0&amp;output=embed" loading="lazy"></iframe>`; };
    let lastPoint = initialPoint;
    let requestId = 0;
    const findNearest = (point, done) => service.getPanorama({ location: point, radius: 140, source: 'outdoor' }, (data, status) => done(status === 'OK' ? data?.location?.pano : null));
    const moveToNearest = point => {
      if (!point || (Math.abs(point.lat - lastPoint.lat) < 0.0015 && Math.abs(point.lon - lastPoint.lon) < 0.0015)) return;
      lastPoint = point;
      const currentRequest = ++requestId;
      findNearest(point, pano => { if (currentRequest === requestId && pano) panorama.setPano(pano); });
    };
    findNearest(initialPoint, pano => { if (pano) panorama.setPano(pano); else showFallback(initialPoint); });
    return { setPosition: moveToNearest };
  } catch {
    container.innerHTML = `<iframe title="Google ground view" src="https://www.google.com/maps?layer=c&amp;cbll=${initialPoint.lat},${initialPoint.lon}&amp;cbp=12,0,0,0,0&amp;output=embed" loading="lazy"></iframe>`;
    return { setPosition: () => {} };
  }
}
