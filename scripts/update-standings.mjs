// scripts/update-standings.mjs

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/* =========================
   Config
   ========================= */

const BASE = "https://api.jolpi.ca/ergast/f1";
const USER_AGENT = "DailyLECWidget/1.0";

/* =========================
   Shared fetch helpers
   ========================= */

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const tries = [
    { delay: 0 },
    { delay: 400 },
    { delay: 1200 },
  ];

  let lastStatus = 0;

  for (const attempt of tries) {
    if (attempt.delay) {
      await sleep(attempt.delay);
    }

    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
    });

    lastStatus = res.status;

    // Treat "not found" as an empty result rather than a hard failure.
    if (res.status === 404) {
      return {
        ok: true,
        status: 404,
        json: null,
      };
    }

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        json: await res.json(),
      };
    }

    // Retry rate limits and temporary server errors only.
    if (!(res.status === 429 || res.status >= 500)) {
      break;
    }
  }

  return {
    ok: false,
    status: lastStatus || 0,
    json: null,
  };
}

/* =========================
   Podiums
   ========================= */

/**
 * Count Grand Prix podium finishes for one driver.
 *
 * We fetch the driver's actual race results for the season and count
 * results where finishing position is P1, P2 or P3.
 *
 * Sprint results are not included because this uses /results/,
 * not /sprint/.
 */
async function fetchPodiumsForDriver(season, driverId) {
  const out = await fetchJson(
    `${BASE}/${season}/drivers/${driverId}/results.json?limit=100`,
  );

  if (out.status === 404) {
    return {
      podiums: 0,
      ok: true,
      status: 404,
    };
  }

  if (!out.ok) {
    return {
      podiums: 0,
      ok: false,
      status: out.status,
    };
  }

  const races = out.json?.MRData?.RaceTable?.Races ?? [];

  let podiums = 0;

  for (const race of races) {
    const results = race?.Results ?? [];

    for (const result of results) {
      const position = Number(result?.position);

      if (position >= 1 && position <= 3) {
        podiums += 1;
      }
    }
  }

  return {
    podiums,
    ok: true,
    status: out.status,
  };
}

/**
 * Count Grand Prix podium finishes for a constructor.
 *
 * Each car finishing P1–P3 counts as one constructor podium.
 * So if both Ferrari drivers finish on the podium in the same GP,
 * that contributes two podium finishes.
 */
async function fetchPodiumsForConstructor(season, constructorId) {
  const out = await fetchJson(
    `${BASE}/${season}/constructors/${constructorId}/results.json?limit=100`,
  );

  if (out.status === 404) {
    return {
      podiums: 0,
      ok: true,
      status: 404,
    };
  }

  if (!out.ok) {
    return {
      podiums: 0,
      ok: false,
      status: out.status,
    };
  }

  const races = out.json?.MRData?.RaceTable?.Races ?? [];

  let podiums = 0;

  for (const race of races) {
    const results = race?.Results ?? [];

    for (const result of results) {
      const position = Number(result?.position);

      if (position >= 1 && position <= 3) {
        podiums += 1;
      }
    }
  }

  return {
    podiums,
    ok: true,
    status: out.status,
  };
}

/* =========================
   Pole Positions
   ========================= */

/**
 * Defensive check in case Sprint Shootout-shaped qualifying
 * records ever appear in the qualifying response.
 */
function isSprintShootoutQualifyingResult(result) {
  return (
    result &&
    (
      Object.prototype.hasOwnProperty.call(result, "SQ1") ||
      Object.prototype.hasOwnProperty.call(result, "SQ2") ||
      Object.prototype.hasOwnProperty.call(result, "SQ3")
    )
  );
}

/**
 * Count Grand Prix pole positions for one driver.
 */
async function fetchGpPolesForDriver(season, driverId) {
  const out = await fetchJson(
    `${BASE}/${season}/drivers/${driverId}/qualifying.json?limit=100`,
  );

  if (out.status === 404) {
    return {
      poles: 0,
      ok: true,
      status: 404,
    };
  }

  if (!out.ok) {
    return {
      poles: 0,
      ok: false,
      status: out.status,
    };
  }

  const races = out.json?.MRData?.RaceTable?.Races ?? [];

  let poles = 0;

  for (const race of races) {
    const results = race?.QualifyingResults ?? [];

    for (const result of results) {
      if (isSprintShootoutQualifyingResult(result)) {
        continue;
      }

      if (Number(result?.position) === 1) {
        poles += 1;
      }
    }
  }

  return {
    poles,
    ok: true,
    status: out.status,
  };
}

/**
 * Count Grand Prix pole positions for a constructor.
 */
async function fetchGpPolesForConstructor(season, constructorId) {
  const out = await fetchJson(
    `${BASE}/${season}/constructors/${constructorId}/qualifying.json?limit=100`,
  );

  if (out.status === 404) {
    return {
      poles: 0,
      ok: true,
      status: 404,
    };
  }

  if (!out.ok) {
    return {
      poles: 0,
      ok: false,
      status: out.status,
    };
  }

  const races = out.json?.MRData?.RaceTable?.Races ?? [];

  let poles = 0;

  for (const race of races) {
    const results = race?.QualifyingResults ?? [];

    const poleResult = results.find(
      (result) =>
        !isSprintShootoutQualifyingResult(result) &&
        Number(result?.position) === 1,
    );

    if (poleResult) {
      poles += 1;
    }
  }

  return {
    poles,
    ok: true,
    status: out.status,
  };
}

/* =========================
   Standings
   ========================= */

async function fetchMiniStandings(season = "2026") {
  const [constructorsOut, driversOut] = await Promise.all([
    fetchJson(
      `${BASE}/${season}/constructorStandings.json?limit=100`,
    ),
    fetchJson(
      `${BASE}/${season}/driverStandings.json?limit=100`,
    ),
  ]);

  if (!constructorsOut.ok || !driversOut.ok) {
    return {
      error: "Upstream fetch failed",
      season: Number(season),
      constructorStatus: constructorsOut.status,
      driverStatus: driversOut.status,
      fetchedAt: new Date().toISOString(),
    };
  }

  const constructorsJson = constructorsOut.json;
  const driversJson = driversOut.json;

  const constructorLists =
    constructorsJson?.MRData?.StandingsTable?.StandingsLists ?? [];

  const driverLists =
    driversJson?.MRData?.StandingsTable?.StandingsLists ?? [];

  /* -------------------------
     No season data yet
     ------------------------- */

  if (constructorLists.length === 0 || driverLists.length === 0) {
    return {
      season: Number(season),

      ferrari: {
        kind: "constructor",
        id: "ferrari",
        name: "Ferrari",
        position: 0,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
      },

      leclerc: {
        kind: "driver",
        id: "leclerc",
        name: "Charles Leclerc",
        position: 0,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        constructor: "Ferrari",
      },

      hamilton: {
        kind: "driver",
        id: "hamilton",
        name: "Lewis Hamilton",
        position: 0,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        constructor: "Ferrari",
      },

      fetchedAt: new Date().toISOString(),
      source: "jolpica-ergast",
      notes:
        "No standings published for this season yet — showing zeros until data is available.",
    };
  }

  /* -------------------------
     Extract standings
     ------------------------- */

  const constructorStandings =
    constructorLists[0]?.ConstructorStandings ?? [];

  const driverStandings =
    driverLists[0]?.DriverStandings ?? [];

  const ferrariStanding =
    constructorStandings.find(
      (entry) =>
        entry?.Constructor?.constructorId === "ferrari",
    ) ?? null;

  const leclercStanding =
    driverStandings.find(
      (entry) =>
        entry?.Driver?.driverId === "leclerc",
    ) ?? null;

  const hamiltonStanding =
    driverStandings.find(
      (entry) =>
        entry?.Driver?.driverId === "hamilton",
    ) ?? null;

  /* -------------------------
     Derived stats
     ------------------------- */

  const [
    ferrariPodiums,
    leclercPodiums,
    hamiltonPodiums,
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

  /* -------------------------
     Format response
     ------------------------- */

  const pickConstructor = (standing, podiums, poles) =>
    standing
      ? {
          kind: "constructor",
          id: standing.Constructor.constructorId,
          name: standing.Constructor.name,
          position: Number(standing.position),
          points: Number(standing.points),
          wins: Number(standing.wins),
          podiums: podiums.podiums,
          poles: poles.poles,
        }
      : null;

  const pickDriver = (standing, podiums, poles) =>
    standing
      ? {
          kind: "driver",
          id: standing.Driver.driverId,
          name: `${standing.Driver.givenName} ${standing.Driver.familyName}`,
          position: Number(standing.position),
          points: Number(standing.points),
          wins: Number(standing.wins),
          podiums: podiums.podiums,
          poles: poles.poles,
          constructor:
            standing.Constructors?.[0]?.name ?? null,
        }
      : null;

  return {
    season: Number(season),

    ferrari: pickConstructor(
      ferrariStanding,
      ferrariPodiums,
      ferrariPoles,
    ),

    leclerc: pickDriver(
      leclercStanding,
      leclercPodiums,
      leclercPoles,
    ),

    hamilton: pickDriver(
      hamiltonStanding,
      hamiltonPodiums,
      hamiltonPoles,
    ),

    fetchedAt: new Date().toISOString(),
    source: "jolpica-ergast",

    notes:
      "Podiums = Grand Prix race finishes P1–P3. Poles = Grand Prix qualifying P1. Sprint results are excluded.",

    // Useful if anything looks wrong again.
    debug: {
      podiums: {
        ferrari: ferrariPodiums,
        leclerc: leclercPodiums,
        hamilton: hamiltonPodiums,
      },
      poles: {
        ferrari: ferrariPoles,
        leclerc: leclercPoles,
        hamilton: hamiltonPoles,
      },
    },
  };
}

/* =========================
   Run + write JSON
   ========================= */

const season =
  process.env.SEASON ||
  String(new Date().getFullYear());

const payload = await fetchMiniStandings(season);

await mkdir("docs", {
  recursive: true,
});

await writeFile(
  path.join("docs", "standings.json"),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8",
);

console.log(`Wrote docs/standings.json for ${season}`);
console.log(
  JSON.stringify(
    {
      ferrari: payload.ferrari,
      leclerc: payload.leclerc,
      hamilton: payload.hamilton,
    },
    null,
    2,
  ),
);
