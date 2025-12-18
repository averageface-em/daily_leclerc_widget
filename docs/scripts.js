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
