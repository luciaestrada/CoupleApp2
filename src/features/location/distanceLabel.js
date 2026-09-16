export function formatSharedDistance(distanceKm, mine, partner) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  const accuracies = [mine?.accuracy, partner?.accuracy];
  const known = accuracies.every(value => Number.isFinite(value) && value >= 0);
  const uncertainty = known ? accuracies[0] + accuracies[1] : null;
  if (uncertainty !== null && uncertainty >= 500) {
    const lower = Math.floor(Math.max(0, distanceKm - uncertainty / 1000));
    const upper = Math.max(lower + 1, Math.ceil(distanceKm + uncertainty / 1000));
    return `Entre ${lower} y ${upper} km aprox.`;
  }
  if (distanceKm < 1) {
    const step = uncertainty === null ? 100 : Math.max(10, Math.ceil(uncertainty / 10) * 10);
    const meters = Math.round(distanceKm * 1000 / step) * step;
    return meters === 0 ? `Menos de ${step} m aprox.` : `${meters} m aprox.`;
  }
  return `${distanceKm.toFixed(1)} km aprox.`;
}
