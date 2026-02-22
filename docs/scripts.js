/* -------------------------
   Shared helpers
-------------------------- */

async function getJSON(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

function setImg(selector, src) {
  const el = document.querySelector(selector);
  if (el && src) el.src = src;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ordinal(n) {
  if (n == null) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* -------------------------
   Daily image
-------------------------- */

async function loadDaily() {
  const meta = await getJSON("./meta.json");
  const v = encodeURIComponent(meta.updated_at || Date.now());
  setImg('img[data-img="daily"]', `./current.jpg?v=${v}`);
}

/* -------------------------
   Up Next (race info + countdown)
-------------------------- */

let countdownTimer = null;

function renderCountdown(el, ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  el.innerHTML = `
    <div class="cd"><div class="cd__num">${pad2(
      d,
    )}</div><div class="cd__label">DAYS</div></div>
    <div class="cd"><div class="cd__num">${pad2(
      h,
    )}</div><div class="cd__label">HRS</div></div>
    <div class="cd"><div class="cd__num">${pad2(
      m,
    )}</div><div class="cd__label">MINS</div></div>
    <div class="cd"><div class="cd__num">${pad2(
      s,
    )}</div><div class="cd__label">SECS</div></div>
  `;
}

async function loadUpNext() {
  try {
    const next = await getJSON("./next_race.json");

    // Round number
    const roundEl = document.getElementById("round-num");
    if (roundEl && next.round != null) {
      roundEl.textContent = `ROUND ${pad2(Number(next.round))}`;
    }

    // Location (eg. Melbourne //)
    const locEl = document.getElementById("round-location");
    if (locEl) {
      const city = next?.location?.locality || "";
      locEl.textContent = city ? `${city.toUpperCase()} //` : "";
    }

    // Track image (MEGA URL — already encoded correctly)
    if (next.track_image) {
      const u = new URL(next.track_image);

      // IMPORTANT: pass raw value, let URLSearchParams encode once
      u.searchParams.set("v", next.updated_at || Date.now());

      setImg('img[data-img="track"]', u.toString());
    }

    // Countdown to FP1 (UTC)
    const cdEl = document.querySelector(".race-countdown");
    if (!cdEl || !next.fp1_utc) return;

    const target = new Date(next.fp1_utc).getTime();
    if (!Number.isFinite(target)) return;

    if (countdownTimer) clearInterval(countdownTimer);

    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        cdEl.textContent = "FP1 IS ON 🏁";
        clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }
      renderCountdown(cdEl, diff);
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  } catch (e) {
    console.error("loadUpNext failed:", e);
  }
}

/* -------------------------
   Standings
-------------------------- */

async function loadStandings() {
  try {
    const data = await getJSON("./standings.json");

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null)
        el.textContent = String(value);
    };

    // Header
    if (data?.season) setText("stand-year", `${data.season} season`);

    // Driver
    const dPoints = Number(data?.leclerc?.points ?? 0);
    const dPosition = Number(data?.leclerc?.position ?? 0);

    setText("drivers_points", dPoints > 0 ? `${dPoints}pts` : "-");

    setText("drivers_place", dPosition > 0 ? ordinal(dPosition) : "-");

    // Constructor
    const cPoints = Number(data?.ferrari?.points ?? 0);
    const cPosition = Number(data?.ferrari?.position ?? 0);

    setText("constructors_points", cPoints > 0 ? `${cPoints}pts` : "-");

    setText("constructors_place", cPosition > 0 ? ordinal(cPosition) : "-");

    // Stats
    setText("stand_wins", data?.leclerc?.wins);
    setText("stand_podiums", data?.leclerc?.podiums);
    setText("stand_poles", data?.leclerc?.poles);
  } catch (e) {
    console.error("loadStandings failed:", e);
  }
}

/* -------------------------
   Init
-------------------------- */

async function main() {
  await Promise.allSettled([loadDaily(), loadUpNext(), loadStandings()]);
}

document.addEventListener("DOMContentLoaded", main);

/* -------------------------
   Mobile panel pager
-------------------------- */

(function () {
  const panels = Array.from(document.querySelectorAll(".panel"));
  if (!panels.length) return;

  let idx = 0;

  function isMobile() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  function showPanel(i) {
    idx = (i + panels.length) % panels.length;
    panels.forEach((p, k) => p.classList.toggle("is-active", k === idx));
  }

  function applyMode() {
    if (isMobile()) {
      showPanel(idx);
    } else {
      panels.forEach((p) => p.classList.add("is-active"));
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pager]");
    if (!btn || !isMobile()) return;

    const dir = btn.getAttribute("data-pager");
    showPanel(dir === "next" ? idx + 1 : idx - 1);
  });

  window.addEventListener("resize", applyMode);
  document.addEventListener("DOMContentLoaded", applyMode);
  applyMode();
})();
