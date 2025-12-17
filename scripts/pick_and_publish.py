import os, json, csv, random, subprocess, shlex, pathlib, datetime

FOLDER = os.environ.get("MEGA_FOLDER", "/MEGA/charles leclerc library of alexandria")
REMOTE_WL_DIR = os.environ.get("MEGA_WHITELIST_DIR", "/MEGA/cl16loa_whitelists")

OUT_IMG = pathlib.Path("widget/current.jpg")
OUT_META = pathlib.Path("widget/meta.json")

def sh(cmd: str) -> str:
    return subprocess.check_output(["bash","-lc", cmd], text=True).strip()

def run(cmd: str):
    subprocess.check_call(["bash","-lc", cmd])

def mega_login():
    run("mega-logout >/dev/null 2>&1 || true")
    email = os.environ["MEGA_EMAIL"]
    pw = os.environ["MEGA_PASS"]
    run(f"mega-login {shlex.quote(email)} {shlex.quote(pw)}")

def load_whitelist(tmp_path="whitelist.csv") -> set[str]:
    run(f"mega-get {shlex.quote(REMOTE_WL_DIR)}/whitelist.csv {shlex.quote(tmp_path)}")
    wl=set()
    with open(tmp_path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if row and row[0].strip():
                wl.add(row[0].strip())
    if not wl:
        raise SystemExit("Whitelist is empty.")
    return wl

def pick_random(whitelist: set[str]) -> str:
    all_files = sh(f"{{ mega-find {shlex.quote(FOLDER)} --type=f || true; }}")
    candidates = [p for p in all_files.splitlines()
                  if p.lower().endswith((".jpg",".jpeg",".png",".webp",".gif"))]
    allowed = [p for p in candidates if p in whitelist]
    if not allowed:
        raise SystemExit("No whitelisted images found under folder.")
    return random.choice(allowed)

def download_to(path_in_mega: str, out_path: pathlib.Path):
    dl_dir = pathlib.Path("_dl_tmp")
    if dl_dir.exists():
        run("rm -rf _dl_tmp")
    dl_dir.mkdir(parents=True, exist_ok=True)

    run(f"mega-get {shlex.quote(path_in_mega)} {shlex.quote(str(dl_dir))}")
    local = sh("find _dl_tmp -type f | head -n 1")
    if not local:
        raise SystemExit("Download failed.")
    # normalize output name (we’ll standardize as jpg for the widget)
    # simplest: just copy bytes and rely on browser; better: convert to jpg (Pillow) if you want consistency
    run(f"cp {shlex.quote(local)} {shlex.quote(str(out_path))}")

def main():
    mega_login()
    wl = load_whitelist()
    chosen = pick_random(wl)
    OUT_IMG.parent.mkdir(parents=True, exist_ok=True)
    download_to(chosen, OUT_IMG)

    OUT_META.write_text(json.dumps({
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "chosen_path": chosen
    }, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
