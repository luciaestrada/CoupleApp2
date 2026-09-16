// Rendering only: never stored as a GPS fix or used for geofences/history.
export function estimatePosition(point, now = Date.now()) {
  if (!point) return point;
  const seconds = (now - Date.parse(point.updatedAt)) / 1000;
  const { lat, lng, speed, heading, accuracy } = point;
  if (![lat, lng, speed, heading, accuracy, seconds].every(Number.isFinite) ||
    Math.abs(lat) > 85 || Math.abs(lng) > 180 || speed < 0.5 || speed > 55 ||
    heading < 0 || heading >= 360 || accuracy < 0 || accuracy > 50 ||
    seconds <= 1 || seconds > 20) return point;
  const uncertainty = accuracy + seconds * Math.max(2, speed * 0.4);
  if (uncertainty > 100) return point;
  const distance = speed * seconds / 6371000;
  const bearing = heading * Math.PI / 180;
  const phi = lat * Math.PI / 180, lambda = lng * Math.PI / 180;
  const nextPhi = Math.asin(Math.sin(phi) * Math.cos(distance) +
    Math.cos(phi) * Math.sin(distance) * Math.cos(bearing));
  const nextLambda = lambda + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(phi),
    Math.cos(distance) - Math.sin(phi) * Math.sin(nextPhi));
  return { ...point, lat: nextPhi * 180 / Math.PI,
    lng: ((nextLambda * 180 / Math.PI + 540) % 360) - 180,
    accuracy: uncertainty, estimated: true };
}
