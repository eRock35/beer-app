const R_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export const kmToMiles = (km) => (km == null ? null : km * 0.621371);

/**
 * Orders stops into a crawl using nearest-neighbour from the start, then runs
 * 2-opt until it stops improving. For the 3–8 stops a person can actually walk
 * in an evening this lands on the optimal route essentially every time, and it
 * costs microseconds.
 */
export function planRoute(stops, start) {
  const points = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (points.length <= 2) return points;

  const origin = start && Number.isFinite(start.lat) ? start : points[0];
  const remaining = [...points];
  const order = [];
  let cursor = origin;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i]) ?? Infinity;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    cursor = remaining[bestIdx];
    order.push(cursor);
    remaining.splice(bestIdx, 1);
  }

  const legLength = (route) => {
    let total = haversineKm(origin, route[0]) ?? 0;
    for (let i = 1; i < route.length; i++) total += haversineKm(route[i - 1], route[i]) ?? 0;
    return total;
  };

  let improved = true;
  let best = order;
  let bestLen = legLength(best);
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const len = legLength(candidate);
        if (len < bestLen - 1e-9) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Legs with distance and a walking estimate at a realistic 4.5 km/h. */
export function describeRoute(route, start) {
  const legs = [];
  let prev = start && Number.isFinite(start.lat) ? start : null;
  let totalKm = 0;
  for (const stop of route) {
    const km = prev ? haversineKm(prev, stop) : 0;
    totalKm += km ?? 0;
    legs.push({
      to: stop,
      km: km == null ? null : Number(km.toFixed(2)),
      miles: km == null ? null : Number(kmToMiles(km).toFixed(2)),
      walkMinutes: km == null ? null : Math.round((km / 4.5) * 60),
    });
    prev = stop;
  }
  return {
    legs,
    totalKm: Number(totalKm.toFixed(2)),
    totalMiles: Number(kmToMiles(totalKm).toFixed(2)),
    totalWalkMinutes: Math.round((totalKm / 4.5) * 60),
    walkable: totalKm <= 5,
  };
}
