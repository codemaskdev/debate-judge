// numbers.json and texts.json: the only source of numbers and quoted texts on screen in episode 05.
//
//   node numbers.mjs            writes numbers.json (from runs.jsonl) and texts.json (from the saved Binex artifacts)
//   node numbers.mjs --check    fails if a number the script says aloud no longer matches the runs
//
// Nothing here is typed in by hand: counts come from runs.jsonl, texts from the artifacts of the runs named in it.
// The Binex artifacts live in state/ (git-ignored); set BINEX to the binex executable (the venv of the pilot) to read them.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EP = path.dirname(fileURLToPath(import.meta.url));
const rows = fs.readFileSync(path.join(EP, "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const counted = rows.filter((r) => r.counted);
const setOf = (name) => counted.filter((r) => (r.set ?? "main") === name).sort((a, b) => a.n - b.n);
const slim = (r) => ({ n: r.n, order: r.order, first: r.listed_first, winner: r.winner, run: r.run_id, model: r.model, date: r.date });
const wins = (rs, side) => rs.filter((r) => r.winner === side).length;
const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

export function numbers() {
  const main = setOf("main"), lazy = setOf("lazy"), bMain = setOf("b-main"), bLazy = setOf("b-lazy"), check = setOf("check");
  const X = main.filter((r) => r.order === "X"), Y = main.filter((r) => r.order === "Y");
  const lazyFirst = lazy.filter((r) => r.order === "P"), lazyLast = lazy.filter((r) => r.order === "Q");
  return {
    main: { rows: main.map(slim), runs: main.length, spaces: wins(main, "spaces"), tabs: wins(main, "tabs"), xRuns: X.length, xTabs: wins(X, "tabs"), yRuns: Y.length, yTabs: wins(Y, "tabs") },
    lazy: { rows: lazy.map(slim), runs: lazy.length, lazySpacesWins: wins(lazy, "spaces"), tabsWins: wins(lazy, "tabs"),
      firstRuns: lazyFirst.length, firstLazyWins: wins(lazyFirst, "spaces"), lastRuns: lazyLast.length, lastLazyWins: wins(lazyLast, "spaces") },
    bMain: { rows: bMain.map(slim), runs: bMain.length, tabs: wins(bMain, "tabs"), spaces: wins(bMain, "spaces") },
    bLazy: { rows: bLazy.map(slim), runs: bLazy.length, tabs: wins(bLazy, "tabs"), lazySpacesWins: wins(bLazy, "spaces") },
    check: { rows: check.map(slim), runs: check.length, light: wins(check, "light"), dark: wins(check, "dark") },
    verdict: { judge1: { side: wins(main, "spaces") > wins(main, "tabs") ? "spaces" : "tabs", wins: Math.max(wins(main, "spaces"), wins(main, "tabs")), of: main.length },
      judge2: { side: wins(bMain, "tabs") > wins(bMain, "spaces") ? "tabs" : "spaces", wins: Math.max(wins(bMain, "tabs"), wins(bMain, "spaces")), of: bMain.length } },
    // the hook's two panes: the first run with each order, as in the script ("run five" with tabs first, "run four" with spaces first)
    hook: { left: slim(main.find((r) => r.n === 5)), right: slim(main.find((r) => r.n === 4)) },
  };
}

// ---- texts, read from the saved artifacts of the runs ----
function artifact(binex, rid, node) {
  const run = (...a) => execFileSync(binex, a, { cwd: path.join(EP, "state"), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const dbg = run("debug", rid, "--no-rich");
  const m = dbg.match(new RegExp(`^-- d\\.${node} .*?Output: (art_\\w+)`, "ms"));
  if (!m) throw new Error(`нет узла ${node} в ${rid}`);
  const c = run("artifacts", "show", m[1]).match(/^Content: (.*)$/m);
  return JSON.parse(c[1]);
}
// the moderator's section about one side: from its heading to the next heading, markdown marks removed
export function sectionFor(collector, side) {
  const lines = collector.split("\n");
  const head = lines.findIndex((l) => new RegExp(`^[#*\\s]*arguments (for|of)[^\\n]*${side}`, "i").test(l));
  if (head < 0) throw new Error(`в пересказе нет раздела про ${side}`);
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i++) if (/^(#{1,4}\s|---)/.test(lines[i]) || /^[#*\s]*(arguments (for|of)|points of|core |summary|key |conclusion)/i.test(lines[i])) { end = i; break; }
  return lines.slice(head + 1, end).join("\n").replace(/\*+/g, "").replace(/\s*\n\s*/g, " ").trim();
}

export function texts(binex) {
  const N = numbers();
  const lazy2 = counted.find((r) => (r.set ?? "main") === "lazy" && r.n === 2);   // lazy spaces listed last, and spaces won
  const lazyText = artifact(binex, lazy2.run_id, "agent_2"), moderator = sectionFor(artifact(binex, lazy2.run_id, "collector"), "spaces");
  const first = counted.find((r) => (r.set ?? "main") === "main" && r.n === 1);
  const sixRuns = setOf("lazy").map((r) => {
    const lz = artifact(binex, r.run_id, r.order === "P" ? "agent_1" : "agent_2");
    return { n: r.n, order: r.order, lazyWords: wordCount(lz), moderatorWords: wordCount(sectionFor(artifact(binex, r.run_id, "collector"), "spaces")) };
  });
  return {
    lazyPair: { run: lazy2.run_id, lazy: lazyText, tabs: artifact(binex, lazy2.run_id, "agent_1"), moderator, lazyWords: wordCount(lazyText), moderatorWords: wordCount(moderator) },
    lazySix: sixRuns,
    debate1: { run: first.run_id, judge: artifact(binex, first.run_id, "judge"), tabsArgument: artifact(binex, first.run_id, "agent_1") },
    hookVerdicts: { left: artifact(binex, N.hook.left.run, "judge").trim().split("\n").pop(), right: artifact(binex, N.hook.right.run, "judge").trim().split("\n").pop() },
  };
}

// numbers the script says aloud (script.en.md / script.ru.md); a mismatch means the script or the data moved
export function check(N, T) {
  assert.equal(N.main.runs, 9, "nine runs");
  assert.equal(N.main.spaces, 7, "spaces won seven");
  assert.equal(N.main.tabs, 2, "tabs won two");
  assert.equal(N.main.xRuns, 6, "six identical runs");
  assert.equal(N.main.xTabs, 1, "tabs took one of the six");
  assert.equal(N.lazy.runs, 6, "six lazy debates");
  assert.equal(N.lazy.firstLazyWins, 0, "lazy first: tabs won three of three");
  assert.equal(N.lazy.firstRuns, 3);
  assert.equal(N.lazy.lastLazyWins, 2, "lazy last: spaces won two of three");
  assert.equal(N.bMain.tabs, 5, "the second judge: tabs five");
  assert.equal(N.bMain.spaces, 1, "the second judge: spaces one");
  assert.equal(N.bLazy.lazySpacesWins, 0, "lazy spaces lost all six to the second judge");
  assert.equal(N.check.light, 2, "light won both");
  assert.equal(N.verdict.judge1.side + N.verdict.judge1.wins + "/" + N.verdict.judge1.of, "spaces7/9");
  assert.equal(N.verdict.judge2.side + N.verdict.judge2.wins + "/" + N.verdict.judge2.of, "tabs5/6");
  assert.equal(N.hook.left.first, "tabs"); assert.equal(N.hook.right.first, "spaces");
  assert.equal(N.hook.left.winner, "spaces"); assert.equal(N.hook.right.winner, "spaces");
  if (T) {
    assert.ok(T.lazyPair.lazyWords >= 20 && T.lazyPair.lazyWords <= 36, "the lazy argument is about thirty words");
    assert.equal(T.lazyPair.lazyWords, 30, "the on-screen pair: thirty words"); assert.equal(T.lazyPair.moderatorWords, 109, "the on-screen pair: a hundred and nine");
    for (const s of T.lazySix) assert.ok(s.lazyWords >= 20 && s.lazyWords <= 36 && s.moderatorWords / s.lazyWords >= 1.5 && s.moderatorWords / s.lazyWords <= 3.7, `lazy run ${s.n}: the retelling is 1.5 to 3.7 times as long`);
    assert.equal(Math.min(...T.lazySix.map((s) => s.lazyWords)) >= 20 && Math.max(...T.lazySix.map((s) => s.lazyWords)) <= 36, true, "twenty to thirty-six words");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const N = numbers();
  const binex = process.env.BINEX;
  let T = null;
  if (process.argv.includes("--check") && !binex) { check(N, null); console.log("числа в порядке (тексты не проверялись: нужен BINEX)"); process.exit(0); }
  if (binex) T = texts(binex);
  check(N, T);
  fs.writeFileSync(path.join(EP, "numbers.json"), JSON.stringify(N, null, 1) + "\n");
  if (T) fs.writeFileSync(path.join(EP, "texts.json"), JSON.stringify(T, null, 1) + "\n");
  console.log(`numbers.json${T ? " и texts.json" : ""}: все числа сценария сходятся с запусками`);
  if (T) console.log(`ленивый → пересказ: ${T.lazyPair.lazyWords} → ${T.lazyPair.moderatorWords} слов; шесть споров: ${T.lazySix.map((s) => `${s.lazyWords}→${s.moderatorWords}`).join(", ")}`);
}
