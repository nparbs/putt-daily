// GET /api/weather: current local weather for the course's looks. Cosmetic only.
//
// Location, in order: ?lat=&lon= (the player opted in to phone location, already
// rounded on the device), then Cloudflare's visitor location headers
// (cf-iplatitude / cf-iplongitude, "Add visitor location headers" managed transform).
// Coordinates are rounded to 0.1 deg before lookup and nothing is logged or stored
// beyond a short in-memory cache keyed by the rounded cell.
const TTL = 15 * 60 * 1000;
const MAX_CACHE = 5000;
const cache = new Map();          // "lat,lon" -> { at, data } | { at, pending }
const buckets = new Map();        // ip -> { n, reset }

function rateOk(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) { b = { n: 0, reset: now + 60_000 }; buckets.set(ip, b); }
  if (buckets.size > 20000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return ++b.n <= 20;
}

function kindOf(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 65 || code === 67 || code === 82) return 'heavy';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'clear';
}

const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r1 = (v) => Math.round(v * 10) / 10;

async function lookup(lat, lon) {
  const key = lat + ',' + lon;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.pending || hit.data;
  const pending = (async () => {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=weather_code,is_day,temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh';
    const r = await fetch(u, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'putt-daily-weather' } });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const j = await r.json();
    const c = j && j.current;
    if (!c) throw new Error('no current');
    return {
      kind: kindOf(num(c.weather_code)),
      night: num(c.is_day) === 0,
      tempC: num(c.temperature_2m),
      windKmh: num(c.wind_speed_10m) ?? 0,
      windDir: num(c.wind_direction_10m) ?? 0,
      code: num(c.weather_code),
    };
  })();
  cache.set(key, { at: Date.now(), pending });
  try {
    const data = await pending;
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}

export async function handleWeather(req, url) {
  const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?';
  let lat = num(url.searchParams.get('lat')), lon = num(url.searchParams.get('lon')), src = 'gps';
  if (lat == null || lon == null) {
    lat = num(req.headers['cf-iplatitude']); lon = num(req.headers['cf-iplongitude']); src = 'ip';
  }
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { status: 200, body: { kind: 'clear', src: 'none' } };
  if (!rateOk(String(ip))) return { status: 429, body: { error: 'slow down' } };
  try {
    const data = await lookup(r1(lat), r1(lon));
    return { status: 200, body: { ...data, src } };
  } catch (e) {
    // Short reason only (no coordinates), so a failing upstream can be diagnosed from outside.
    const why = String((e && e.cause && (e.cause.code || e.cause.message)) || (e && (e.name === 'TimeoutError' ? 'timeout' : e.message)) || 'error').slice(0, 60);
    return { status: 200, body: { kind: 'clear', src: 'none', err: why } };
  }
}
