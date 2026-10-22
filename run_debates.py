#!/usr/bin/env python3
"""Runs the counted debates of protocol.md and appends one row per debate to runs.jsonl.

  set -a; . ./keys.sh; set +a
  BINEX=/path/to/venv/bin/binex python3 run_debates.py --max 4        # next 4 debates of the schedule
  python3 run_debates.py --status                                     # what is done

The schedule is fixed by protocol.md: X Y X Y X Y X X X (main), then the check runs. A run counts only when all four
nodes completed and the judge text ends with WINNER: tabs|spaces; anything else is retried (logged as a retry).
"""
import argparse, json, os, re, subprocess, sys, time, datetime, pathlib

HERE = pathlib.Path(__file__).parent
LOG = HERE / "runs.jsonl"
# protocol.md addendum 3: model A may be served by NVIDIA's own API (same model id) when OpenRouter's free quota is spent
if os.environ.get("MODEL_A_PROVIDER") == "nvidia":
    MODEL_A_FOLDER, MODEL_A_ID = "workflows-nv", "nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b"
else:
    MODEL_A_FOLDER, MODEL_A_ID = "workflows", "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
MODEL_B = "gemini/gemini-3.5-flash-lite"           # protocol.md addendum 2: used when model A's daily quota ran out
SETS = {   # name -> (schedule of order labels, workflow folder, model)
    "main": (["X", "Y", "X", "Y", "X", "Y", "X", "X", "X"], MODEL_A_FOLDER, MODEL_A_ID),
    "lazy": (["P", "Q", "P", "Q", "P", "Q"], MODEL_A_FOLDER, MODEL_A_ID),   # spaces argued lazily, first (P) and last (Q)
    "check": (["C", "D"], MODEL_A_FOLDER, MODEL_A_ID),               # unseen topic: dark theme first (C), light theme first (D)
    "b-main": (["X", "Y", "X", "Y", "X", "Y"], "workflows-b", MODEL_B),
    "b-lazy": (["P", "Q", "P", "Q", "P", "Q"], "workflows-b", MODEL_B),
}
FIRST = {"X": "tabs", "Y": "spaces", "P": "spaces", "Q": "tabs", "C": "dark", "D": "light"}
OTHER = {"tabs": "spaces", "spaces": "tabs", "dark": "light", "light": "dark"}   # which side agent_1 argues, from workflows/*.yaml
FILES = {"X": "main-x.yaml", "Y": "main-y.yaml", "P": "lazy-spaces-first.yaml", "Q": "lazy-spaces-last.yaml",
         "C": "check-dark-first.yaml", "D": "check-light-first.yaml"}
BINEX = os.environ.get("BINEX", "binex")
STATE = HERE / "state"            # Binex keeps its run database in ./.binex of the working directory
STATE.mkdir(exist_ok=True)


def load_json(text):
    """binex run --json prints litellm warnings before the JSON object."""
    start = 0 if text.lstrip().startswith("{") else text.find("\n{") + 1
    return json.loads(text[start:])


def winner_of(judge_text):
    m = re.search(r"WINNER:\s*(tabs|spaces|dark|light)\s*\W*\s*$", judge_text.strip(), re.I)
    return m.group(1).lower() if m else None


def collector_first_agent(run_id):
    """The agent whose artifact the collector lists first (binex debug prints its inputs in the order they are read)."""
    out = subprocess.run([BINEX, "debug", run_id, "--no-rich"], capture_output=True, text=True, cwd=STATE).stdout
    block = out.split("-- d.collector", 1)[-1].split("-- d.judge", 1)[0]
    agents = re.findall(r"<- d\.(agent_\d)", block)
    return agents[0] if agents else None


def one_debate(order, folder):
    env = dict(os.environ, PYTHONHASHSEED="2")
    p = subprocess.run([BINEX, "run", str(HERE / folder / FILES[order]), "--json", "--no-stream"],
                       capture_output=True, text=True, env=env, cwd=STATE)
    try:
        d = load_json(p.stdout)
    except Exception:
        return None, "no json"
    if d.get("status") != "completed" or d.get("completed_nodes") != 4:
        return None, f"status {d.get('status')} {d.get('completed_nodes')}/4"
    judge = next(iter((d.get("output") or {}).values()), "")
    w = winner_of(judge)
    if not w:
        return None, "no WINNER line"
    first_agent = collector_first_agent(d["run_id"])
    listed_first = FIRST[order] if first_agent == "agent_1" else OTHER[FIRST[order]]
    return dict(run_id=d["run_id"], winner=w, listed_first=listed_first, cost=d.get("total_cost"), judge=judge), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=1)
    ap.add_argument("--set", default="main", choices=sorted(SETS))
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--pause", type=int, default=20)
    a = ap.parse_args()
    rows = [json.loads(l) for l in LOG.read_text().splitlines()] if LOG.exists() else []
    SCHEDULE, FOLDER, MODEL = SETS[a.set]
    done = [r for r in rows if r.get("counted") and r.get("set", "main") == a.set]
    if a.status:
        for r in done:
            print(r["n"], r["order"], "listed first:", r["listed_first"], "winner:", r["winner"], r["date"])
        print(f"{len(done)}/{len(SCHEDULE)} {a.set} debates done")
        return
    for _ in range(a.max):
        n = len(done) + 1
        if n > len(SCHEDULE):
            print(f"{a.set} schedule finished")
            return
        order = SCHEDULE[n - 1]
        for attempt in range(1, 5):
            res, why = one_debate(order, FOLDER)
            if res:
                break
            retry = dict(n=n, set=a.set, order=order, retry=attempt, reason=why, counted=False,
                         date=datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z")
            with LOG.open("a") as f:
                f.write(json.dumps(retry) + "\n")
            print(f"debate {n} ({order}) attempt {attempt} failed: {why}; waiting 90 s", file=sys.stderr)
            time.sleep(90)
        else:
            print("giving up for now (provider limits?); rerun later", file=sys.stderr)
            return
        row = dict(n=n, set=a.set, order=order, counted=True, model=MODEL,
                   date=datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z", **res)
        with LOG.open("a") as f:
            f.write(json.dumps(row) + "\n")
        done.append(row)
        print(f"debate {n} ({order}): listed first {row['listed_first']}, winner {row['winner']}")
        time.sleep(a.pause)


if __name__ == "__main__":
    main()
