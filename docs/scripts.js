async function getJSON(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

function setImg(selector, src) {
  const el = document.querySelector(selector);
  if (el && src) el.src = src;
}

async function loadDaily() {
  const meta = await getJSON("./meta.json");
  const v = encodeURIComponent(meta.updated_at || Date.now());
  setImg('img[data-img="daily"]', `./current.jpg?v=${v}`);
}

async function loadUpNext() {
  // when you have it:
  // next_race.json could contain something like:
  // { "track_image": "./assets/tracks/melbourne.png", "updated_at": "..." }
  try {
    const next = await getJSON("./next_race.json");
    const v = encodeURIComponent(
      next.updated_at || next.fetchedAt || Date.now()
    );
    if (next.track_image) {
      setImg('img[data-img="track"]', `${next.track_image}?v=${v}`);
    }
  } catch {
    // ok if next_race.json doesn't exist yet
  }
}

async function main() {
  await Promise.allSettled([loadDaily(), loadUpNext()]);
}

document.addEventListener("DOMContentLoaded", main);

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
      // desktop: show all
      panels.forEach((p) => p.classList.add("is-active"));
    }
  }

  // Event delegation so it works even with 3 duplicated pagers
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pager]");
    if (!btn) return;

    // only page on mobile
    if (!isMobile()) return;

    const dir = btn.getAttribute("data-pager");
    showPanel(dir === "next" ? idx + 1 : idx - 1);
  });

  window.addEventListener("resize", applyMode);
  document.addEventListener("DOMContentLoaded", applyMode);
  applyMode();
})();
