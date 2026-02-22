// scripts/update-standings.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.jolpi.ca/ergast/f1";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const tries = [{ delay: 0 }, { delay: 400 }, { delay: 1200 }];
  let lastStatus = 0;

  for (const t of tries) {
    if (t.delay) await sleep(t.delay);

    const res = await fetch(url, { headers: { accept: "application/json" } });
    lastStatus = res.status;

    if (res.status === 404) return { ok: true, status: 404, json: null };

    if (res.ok) {
      const json = await res.json();
      return { ok: true, status: res.status, json };
    }

    // Retry only on 429 or 5xx
    if (!(res.status === 429 || res.status >= 500)) break;
  }

  return { ok: false, status: lastStatus || 0, json: null };
}

async function fetchCount(url) {
  const out = await fetchJson(url);
  if (out.status === 404) return { ok: true, status: 404, total: 0 };
  if (!out.ok) return { ok: false, status: out.status, total: 0 };

  const total = Number(out.json?.MRData?.total ?? "0");
  return {
    ok: true,
    status: out.status,
    total: Number.isFinite(total) ? total : 0,
  };
}

/**
 * Counts GRAND PRIX poles only:
 * - Uses /qualifying.json list (not /qualifying/1.json)
 * - Excludes Sprint Shootout entries by detecting SQ1/SQ2/SQ3 fields
 */
function isSprintShootoutQualifyingResult(q) {
  return (
    q &&
    (Object.prototype.hasOwnProperty.call(q, "SQ1") ||
      Object.prototype.hasOwnProperty.call(q, "SQ2") ||
      Object.prototype.hasOwnProperty.call(q, "SQ3"))
  );
}

async function fetchGpPolesForDriver(season, driverId) {
  const out = await fetchJson(
    `${BASE}/${season}/drivers/${driverId}/qualifying.json?limit=1000`,
  );

  if (out.status === 404) return { poles: 0, ok: true, status: 404 };
  if (!out.ok) return { poles: 0, ok: false, status: out.status };

  const races = out.json?.MRData?.RaceTable?.Races ?? [];
  let poles = 0;

  for (const race of races) {
    const q = race?.QualifyingResults?.[0];
    if (!q) continue;

    if (isSprintShootoutQualifyingResult(q)) continue; // exclude sprint shootout

    if (q.position === "1" || q.position === 1) poles += 1;
  }

  return { poles, ok: true, status: out.status };
}

async function fetchGpPolesForConstructor(season, constructorId) {
  const out = await fetchJson(
    `${BASE}/${season}/constructors/${constructorId}/qualifying.json?limit=1000`,
  );

  if (out.status === 404) return { poles: 0, ok: true, status: 404 };
  if (!out.ok) return { poles: 0, ok: false, status: out.status };

  const races = out.json?.MRData?.RaceTable?.Races ?? [];
  let poles = 0;

  for (const race of races) {
    // For constructors, QualifyingResults can include multiple cars;
    // If the constructor has pole, one of its entries will be position "1".
    const results = race?.QualifyingResults ?? [];
    const p1 = results.find((r) => r.position === "1" || r.position === 1);
    if (!p1) continue;

    if (isSprintShootoutQualifyingResult(p1)) continue; // exclude sprint shootout

    poles += 1;
  }

  return { poles, ok: true, status: out.status };
}

async function fetchPodiumsForDriver(season, driverId) {
  const [p1, p2, p3] = await Promise.all([
    fetchCount(`${BASE}/${season}/drivers/${driverId}/results/1.json`),
    fetchCount(`${BASE}/${season}/drivers/${driverId}/results/2.json`),
    fetchCount(`${BASE}/${season}/drivers/${driverId}/results/3.json`),
  ]);

  return {
    podiums: p1.total + p2.total + p3.total,
    ok: p1.ok && p2.ok && p3.ok,
  };
}

async function fetchPodiumsForConstructor(season, constructorId) {
  const [p1, p2, p3] = await Promise.all([
    fetchCount(
      `${BASE}/${season}/constructors/${constructorId}/results/1.json`,
    ),
    fetchCount(
      `${BASE}/${season}/constructors/${constructorId}/results/2.json`,
    ),
    fetchCount(
      `${BASE}/${season}/constructors/${constructorId}/results/3.json`,
    ),
  ]);

  return {
    podiums: p1.total + p2.total + p3.total,
    ok: p1.ok && p2.ok && p3.ok,
  };
}

async function fetchMiniStandings(season = "2026") {
  const [constructorsRes, driversRes] = await Promise.all([
    fetch(`${BASE}/${season}/constructorStandings.json?limit=1000`, {
      headers: { accept: "application/json" },
    }),
    fetch(`${BASE}/${season}/driverStandings.json?limit=1000`, {
      headers: { accept: "application/json" },
    }),
  ]);

  if (!constructorsRes.ok || !driversRes.ok) {
    return {
      error: "Upstream fetch failed",
      season: Number(season),
      constructorStatus: constructorsRes.status,
      driverStatus: driversRes.status,
      fetchedAt: new Date().toISOString(),
    };
  }

  const constructorsJson = await constructorsRes.json();
  const driversJson = await driversRes.json();

  const constructorStandings =
    constructorsJson?.MRData?.StandingsTable?.StandingsLists?.[0]
      ?.ConstructorStandings ?? [];
  const driverStandings =
    driversJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ??
    [];

  const ferrariStanding =
    constructorStandings.find(
      (x) => x?.Constructor?.constructorId === "ferrari",
    ) || null;

  const leclercStanding =
    driverStandings.find((x) => x?.Driver?.driverId === "leclerc") || null;

  const hamiltonStanding =
    driverStandings.find((x) => x?.Driver?.driverId === "hamilton") || null;

  const [
    ferrariPod,
    leclercPod,
    hamiltonPod,
    ferrariPoles,
    leclercPoles,
    hamiltonPoles,
  ] = await Promise.all([
    fetchPodiumsForConstructor(season, "ferrari"),
    fetchPodiumsForDriver(season, "leclerc"),
    fetchPodiumsForDriver(season, "hamilton"),
    fetchGpPolesForConstructor(season, "ferrari"),
    fetchGpPolesForDriver(season, "leclerc"),
    fetchGpPolesForDriver(season, "hamilton"),
  ]);

  const pickConstructor = (x, pod, poles) =>
    x
      ? {
          kind: "constructor",
          id: x.Constructor.constructorId,
          name: x.Constructor.name,
          position: Number(x.position),
          points: Number(x.points),
          wins: Number(x.wins),
          podiums: pod.podiums,
          poles: poles.poles,
        }
      : null;

  const pickDriver = (x, pod, poles) =>
    x
      ? {
          kind: "driver",
          id: x.Driver.driverId,
          name: `${x.Driver.givenName} ${x.Driver.familyName}`,
          position: Number(x.position),
          points: Number(x.points),
          wins: Number(x.wins),
          podiums: pod.podiums,
          poles: poles.poles,
          constructor: x.Constructors?.[0]?.name || null,
        }
      : null;

  return {
    season: Number(season),
    ferrari: pickConstructor(ferrariStanding, ferrariPod, ferrariPoles),
    leclerc: pickDriver(leclercStanding, leclercPod, leclercPoles),
    hamilton: pickDriver(hamiltonStanding, hamiltonPod, hamiltonPoles),
    fetchedAt: new Date().toISOString(),
    source: "jolpica-ergast",
    notes:
      "Podiums = race P1–P3. Poles = Grand Prix qualifying P1 (Sprint Shootout excluded).",
  };
}

const season = process.env.SEASON || "2026";
const payload = await fetchMiniStandings(season);

// write into docs so Pages can serve it
await mkdir("docs", { recursive: true });
await writeFile(
  path.join("docs", "standings.json"),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8",
);

console.log("Wrote docs/standings.json");
