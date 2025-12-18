// scripts/update-next-race.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.jolpi.ca/ergast/f1";

/**
 * Map Jolpica/Ergast circuitId -> MEGA object URL
 * (circuit-specific, not year-specific)
 */
const TRACK_IMAGE_BY_CIRCUIT = {
  albert_park:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL1%20-%20Australia.png",
  shanghai:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL2%20-%20Shanghai.png",
  suzuka:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL3%20-%20Suzuka.png",
  bahrain:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL4%20-%20Bahrain.png",
  jeddah:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL5%20-%20Jeddah.png",
  miami:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL6%20-%20Miami.png",
  imola:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL7%20-%20Imola.png",
  monaco:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL8%20-%20Monaco.png",
  catalunya:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL9%20-%20Barcelona.png",
  villeneuve:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL10%20-%20Canada.png",
  red_bull_ring:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL11%20-%20Red%20Bull%20Ring.png",
  silverstone:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL12%20-%20Silverstone.png",
  spa: "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL13%20-%20Spa-Francorchamps.png",
  hungaroring:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL14%20-%20Hungaroring.png",
  zandvoort:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL15%20-%20Zandvoort.png",
  monza:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL16%20-%20Monza.png",
  baku: "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL17%20-%20Baku.png",
  marina_bay:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL18%20-%20Singapore.png",
  americas:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL19%20-%20COTA.png",
  rodriguez:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL20%20-%20Mexico%20City.png",
  interlagos:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL21%20-%20Interlagos.png",
  vegas:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL22%20-%20Las%20Vegas.png",
  losail:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL23%20-%20Qatar.png",
  yas_marina:
    "https://s3.g.s4.mega.io/icjikbdkdf4it7npqli2ixjyuz4niq2nv4uhg/cl16.loa/%5BWEB%5D%20charlesleclerc.com%20Circuit%20Maps/CL24%20-%20Abu%20Dhabi.png",
};

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

const circuitId = race?.Circuit?.circuitId || null;
const track_image = circuitId
  ? TRACK_IMAGE_BY_CIRCUIT[circuitId] || null
  : null;

if (circuitId && !track_image) {
  console.warn(`No track image mapped for circuitId: ${circuitId}`);
}

const payload = {
  updated_at: new Date().toISOString(),
  season: Number(race.season),
  round: Number(race.round),
  race_name: race.raceName,
  circuit_id: circuitId,
  location: {
    locality: race?.Circuit?.Location?.locality || null,
    country: race?.Circuit?.Location?.country || null,
  },
  fp1_utc: toIsoUtc(fp1.date, fp1.time),
  track_image, // MEGA object URL (or null if not mapped)
};

await mkdir("docs", { recursive: true });
await writeFile(
  path.join("docs", "next_race.json"),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8"
);

console.log("Wrote docs/next_race.json");
