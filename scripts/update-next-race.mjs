// scripts/update-next-race.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.jolpi.ca/ergast/f1";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.json();
}

function toIsoUtc(dateStr, timeStr) {
  // Ergast-style times are UTC. Ensure we end with Z.
  const t = (timeStr || "00:00:00Z").endsWith("Z") ? timeStr : `${timeStr}Z`;
  return `${dateStr}T${t}`;
}

const season = process.env.SEASON || "current";

// Ergast-compatible: /current/next.json returns the next race
const json = await fetchJson(`${BASE}/${season}/next.json`);

const race = json?.MRData?.RaceTable?.Races?.[0];
if (!race) throw new Error("No next race found");

const fp1 = race?.FirstPractice;
if (!fp1?.date || !fp1?.time) {
  throw new Error("Next race does not include FirstPractice date/time");
}

const payload = {
  updated_at: new Date().toISOString(),
  season: Number(race.season),
  round: Number(race.round),
  race_name: race.raceName,
  circuit_id: race?.Circuit?.circuitId || null,
  location: {
    locality: race?.Circuit?.Location?.locality || null,
    country: race?.Circuit?.Location?.country || null,
  },
  fp1_utc: toIsoUtc(fp1.date, fp1.time),

  // keep your placeholder for now:
  // later you can map circuit_id -> image path
  track_image: "/assets/images/CL1 - Australia.png",
};

await mkdir("docs", { recursive: true });
await writeFile(
  path.join("docs", "next_race.json"),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8"
);

console.log("Wrote docs/next_race.json");
