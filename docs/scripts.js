async function main() {
  const meta = await fetch("./meta.json", { cache: "no-store" }).then((r) =>
    r.json()
  );
  const v = encodeURIComponent(meta.updated_at || Date.now());
  document.getElementById("img").src = "./current.jpg?v=" + v;
}
main();
