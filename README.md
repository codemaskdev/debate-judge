# debate-judge

Does an AI judge look at the argument, the side it likes, or the order it reads them in? Two agents argue tabs against spaces, a
moderator retells both, a judge picks the winner, and we swap the order and watch. The companion repository of the CodeMask
episode "LLM as a Judge: Can You Trust an AI Judge? (Tabs vs Spaces)" (the title may differ on YouTube).

Small experiment, honest sample sizes: **17 debates on one judge and 12 on a second**. Nothing here is a statistic.

## How the pipeline works

Binex's `debate` pattern expands one node into four: `agent_1` and `agent_2` run in parallel and never see each other, a
`collector` (the moderator) retells both in one text, and a `judge` reads **only that retelling**. Two things are easy to miss:
- **The order of the two arguments in the retelling is not chosen by anyone.** The collector's inputs come from a Python `set`,
  so the order follows the process's hash seed. `PYTHONHASHSEED=2` lists `agent_1`'s argument first. `stub-order.json` and
  `pilot/` show it with a stubbed model (no seed: the order flipped between runs).
- **The topic reaches only `agent_1` through `inputs`**, so the configs also put it into the shared `system_prompt`. Step prompts live
  under `config.steps.<name>.prompt`.

## Results (judge 1: `nvidia/nemotron-3-ultra-550b-a55b`, free tier)

| Test | Runs | Result |
|---|---|---|
| Swap the order (tabs first / spaces first) | 9 | spaces won 7, tabs won 2; in the 6 runs with the same order tabs won 1 |
| The favourite (spaces) argues lazily, in two sentences | 6 | lazy spaces lost 3 of 3 when listed first and won 2 of 3 when listed last |
| An unseen topic: dark or light theme | 2 | light won in both orders |

The lazy test did not test what it was meant to: in all six debates the moderator's retelling of the lazy argument was 1.6 to
3.6 times as long as the argument itself (for example 30 words became 109), so the judge never saw a lazy argument.

## A second judge (`gemini/gemini-3.5-flash-lite`, free tier)

| Test | Runs | Result |
|---|---|---|
| Swap the order | 6 | tabs won 5, spaces won 1 |
| Lazy spaces | 6 | lazy spaces lost all 6 (not a taste test: tabs are this judge's favourite) |

## Run it yourself

```
pip install binex
export NVIDIA_NIM_API_KEY=...        # or OPENROUTER_API_KEY / GEMINI_API_KEY for the other config folders
binex validate workflows-nv/main-x.yaml
PYTHONHASHSEED=2 binex run workflows-nv/main-x.yaml
```

`workflows-nv/main-x.yaml` puts tabs in `agent_1`, `main-y.yaml` puts spaces there; `lazy-*` and `check-*` are the other tests.
`workflows/` is the same set for OpenRouter's free model, `workflows-b/` for Gemini. `run_debates.py` runs the counted schedule of
`protocol.md` (set `BINEX` to the binex executable and the keys in the environment). `runs.jsonl` has one row per counted
debate (date, model, order, which side was listed first, the winner, the judge's text); `numbers.mjs --check` recounts
the numbers the episode says aloud.

## What this is not

- Not a ranking of models and not a claim about "position bias": nine runs cannot separate a taste from a better argument.
- Free-tier models change and disappear; every row of `runs.jsonl` names the model and the provider it ran through (judge 1's
  last runs went through NVIDIA's own API because OpenRouter's daily free quota ended, see `protocol.md`).
- The protocol (`protocol.md`) was committed before the first counted run; two later decisions are written in its addenda,
  with the reasons and the time.

## License

MIT, see `LICENSE`.

## Disclosure

Written with Claude Code. Model outputs in `runs.jsonl` and `texts.json` are saved as returned.
