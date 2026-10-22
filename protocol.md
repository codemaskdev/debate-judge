# Episode 05 protocol (frozen before the first counted run)

An entertainment show with a real test inside it, not a study. We run a handful of debates, show every one of them,
and say "nine runs", never "proves". Anything not written here is decided before it is run, or not decided at all.

## Question
When an AI judge picks a winner, does it pick the better argument, the side it likes, or the one it read first?

## Setup (fixed)
- Binex 0.8.1, commit 6a9b8e8, pattern `debate`: `agent_1` and `agent_2` argue in parallel, a collector summarises, a judge
  reads only the collector's summary (ep05-facts.md).
- One model for all four steps: `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` (chosen 2026-10-22: the one free model
  that answered when tried; others returned 429, 403, 404). Provider settings untouched (default temperature).
- Topic: "should code be indented with tabs or with spaces?" Sides: one agent argues tabs, the other spaces, under 120 words each.
- Files: `workflows/main-x.yaml` (tabs = agent_1) and `workflows/main-y.yaml` (spaces = agent_1). The only difference between
  them is which side the first agent gets. Run with `PYTHONHASHSEED=2`, which lists agent_1's argument first in the
  collector's input (checked on the stub and on two smoke runs). The judge prompt is identical in both files.
- Smoke runs before the freeze (two debates, not counted) were used only to find a model that answers and to fix the judge
  prompt, which first returned a bare "WINNER:" line with no reasoning.

## Runs (9 debates)
Order: X, Y, X, Y, X, Y, X, X, X. Runs 1-6 compare the two orders; runs 7-9 repeat order X, so that order X has six runs
that share identical conditions. That is the noise check: if identical runs disagree with each other, that is a finding.
- A run counts when all four nodes complete and the judge text ends with `WINNER: tabs` or `WINNER: spaces`.
- A run that fails on a provider limit, a 4xx/5xx, or a missing WINNER line is repeated with the same condition and logged
  as a retry. A completed run is never dropped or redone because the result is boring or unexpected.
- The runner reads the collector's stored input and records which side was listed first, so the label is what happened.
- Per run we store: date, model, order label, observed first side, winner, run id, cost shown by Binex, judge text.

## What we call what (fixed now)
Let T_X be the number of tabs wins in the six X runs, T_Y the number of tabs wins in the three Y runs.
- **Noise:** the six X runs split, between 2 and 4 tabs wins. The judge disagrees with itself on identical input.
  The order question cannot be answered with nine runs and we say so.
- **Follows the slot (order bias):** the X runs are mostly tabs (T_X >= 5) and the Y runs are mostly spaces (T_Y <= 1), or the
  reverse pairing in the other direction: whoever is listed first, or last, wins both ways.
- **Follows the side (taste or argument):** the same side wins in at least five of six X runs and in at least two of three Y
  runs. Nine runs cannot tell a taste for the side from better arguments, and we say that.
- Anything else is reported as "mixed" with the raw table.
The criterion "the verdict must match after swapping the order" means: the same side wins in X and in Y.

## Second step, chosen by the result (written now, run once)
- Result "follows the slot": one fix, a judge prompt with one added sentence, "The order of the arguments is arbitrary;
  ignore it", three runs per order, same rules. Report whether it helped.
- Result "follows the side" or "mixed": the harder test. One side's agent is told "Give a lazy, vague argument in two
  sentences", the other keeps the normal prompt; run the lazy side first and last, three runs each. If the judge still picks
  the vague side, say so.
- Result "noise": no second step; the episode says that the judge could not agree with itself and what that means for
  trusting one verdict.

## Check run on a topic nobody tuned (two debates, one per order)
"Should an editor use a dark theme or a light theme?" Same setup. Reported next to the main table, not mixed into it.

## Budget
Nine main debates, two check debates, three to six for the second step: 14 to 17 debates, 56 to 68 calls. OpenRouter free
models allow 50 requests a day, so the work spans two days; every row carries its date.

## Not claimed
No significance, no "always", no ranking of models. The positional effect called position bias is not named in the script
until a source is found in the fact check.

## Addendum, 2026-10-22, written after the nine main debates and before any second-step run
The protocol said "one side's agent is told to give a lazy, vague argument" without saying which side. Result of the main
runs: spaces won 5 of 6 X runs and 2 of 3 Y runs, so the result is "follows the side". Only making the favoured side (spaces)
the lazy one tests anything: if the judge still picks a two-sentence vague spaces argument against a full tabs argument, the
judge has a taste for spaces; if tabs now win in both positions, the earlier wins were about the arguments. So: spaces is
lazy, tabs is normal, six debates (lazy spaces listed first x3, listed last x3), files `workflows/lazy-spaces-first.yaml`
and `lazy-spaces-last.yaml`, same model and judge prompt. This choice was made after seeing the main result and says so.

## Addendum 2, 2026-10-22 (after 17:50 UTC), written before any run on model B
Model A (nemotron-3-ultra via OpenRouter) hit the account-wide free-model daily limit (50 requests, resets 2026-10-23
00:00 UTC) after the nine main debates and one of six lazy debates. Switching to another OpenRouter free model does not help
(tested: the limit message is "free-models-per-day", account-wide). The second step on a different model would not be
comparable to the main nine, so a second model runs its own baseline too:
- **Model B:** `gemini/gemini-3.5-flash-lite` (Google free tier), same prompts, same seed, same judge prompt.
- **b-main:** six debates, order X Y X Y X Y. **b-lazy:** six debates, lazy spaces listed first x3 and last x3.
  Files in `workflows-b/`. Retry rules as above; Google free-tier limits are unknown and will be recorded when met.
- Model A's remaining five lazy debates still run after the quota reset; model A's results stay the main result,
  model B's are reported as "another judge". If the two models disagree, both are shown and nothing is merged.

## Addendum 3, 2026-10-22 (about 18:30 UTC), written before any run through NVIDIA
The author pointed out that NVIDIA's own API catalogue lists the same model (`nvidia/nemotron-3-ultra-550b-a55b`, checked in
the public model list of integrate.api.nvidia.com) and gives free keys. So the remaining model A debates (lazy set, 5 of 6)
and the dark-vs-light check can run now, without waiting for OpenRouter's reset, through litellm's `nvidia_nim` provider.
- Same model id, same prompts, same seed, same judge prompt; only the provider differs (`workflows-nv/`, runner flag
  `MODEL_A_PROVIDER=nvidia`). The provider is stored in every row of `runs.jsonl` (the model string differs).
- Honest limit, to be said on air if it matters: the same weights through a different provider may differ in serving
  details (precision, default sampling). We do not know whether OpenRouter's free variant is served by NVIDIA itself.
- If the NVIDIA run disagrees in kind with the one OpenRouter debate of the lazy set, both are shown.
- Needs a key from the author in the environment as `NVIDIA_NIM_API_KEY`. Limits of the free tier are unknown and will
  be recorded when met.
