export function haversineDistanceKm(latA, lngA, latB, lngB) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latB - latA);
  const longitudeDelta = toRadians(lngB - lngA);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  // El redondeo de coma flotante puede producir valores apenas fuera de [0, 1]
  // cerca de puntos antipodales y convertir la raíz siguiente en NaN.
  const normalizedHaversine = Math.min(1, Math.max(0, haversine));

  return earthRadiusKm * 2 * Math.atan2(
    Math.sqrt(normalizedHaversine),
    Math.sqrt(1 - normalizedHaversine)
  );
}
