# Pilot reproduction: Graph Convolutional Networks (Kipf & Welling, ICLR 2017)

| | |
|---|---|
| Paper | Thomas N. Kipf, Max Welling. *Semi-Supervised Classification with Graph Convolutional Networks.* ICLR 2017. [arXiv:1609.02907](https://arxiv.org/abs/1609.02907), v4 |
| Official code | [tkipf/gcn](https://github.com/tkipf/gcn) at commit `39a4089` (26 Sep 2020), run unmodified |
| Kind of work | Computational reproduction: the authors' code and data, re-executed. Not an independent replication. |
| Claims tested | The "GCN (this paper)" row of Table 2: test accuracy on Cora, Citeseer, Pubmed and NELL |
| Performed | 14 November 2026, by an AI coding agent in a cloud sandbox (4 CPU cores, no GPU). Every number below comes from a run recorded in `results/`. |

## Result

The paper states that each Table 2 number is the "mean accuracy of 100 runs with random weight initializations". It gives no standard deviation. I ran the official `train.py` 100 times per dataset with seeds 0 to 99.

| Dataset | Published | Reproduced mean | SD | 95% CI of the mean | Difference | 95% CI of the difference | Range of single runs |
|---|---|---|---|---|---|---|---|
| Cora | 81.5 | 81.47 | 0.65 | 81.34 to 81.60 | −0.03 | −0.22 to +0.15 | 79.9 to 83.0 |
| Citeseer | 70.3 | 69.63 | 8.11 | 68.02 to 71.24 | −0.67 | −2.95 to +1.60 | 9.8 to 72.1 |
| Pubmed | 79.0 | 79.05 | 0.34 | 78.99 to 79.12 | +0.05 | −0.04 to +0.15 | 78.2 to 79.8 |
| NELL | 66.0 | blocked | | | | | |
| *Citeseer, early stopping off (exploratory, D4)* | 70.3 | 70.75 | 0.73 | 70.60 to 70.89 | +0.45 | +0.24 to +0.65 | 69.1 to 72.1 |

All values are test accuracy in percent; differences are in percentage points. Each row is 100 runs, none failed. `results/summary.json` holds the full output of `analyze.py`.

The interval for the difference assumes the authors' 100 runs varied from run to run as much as mine did. The paper gives no way to check that.

Outcome per claim:

- **Cora: matched.** The 100-run mean is 0.03 points from the published value.
- **Pubmed: matched.** The 100-run mean is 0.05 points from the published value.
- **Citeseer: inconclusive.** With the code as published the mean is 0.67 points low, because 2 of the 100 runs stopped at epoch 12 or 13 with accuracy at chance level (see below). Without those two runs the mean is 70.77; with early stopping switched off it is 70.75. The published 70.3 sits between the two readings, and the paper does not say enough to choose.
- **NELL: blocked.** The dataset and its configuration are not in the repository.

These outcomes are my reading of the numbers. Whether 0.45 points on Citeseer counts as a match is a judgement the team should make and record with a tolerance.

One run is weak evidence either way. The repository's default seed (123) gives 81.6% on Cora, which looks like a perfect reproduction. Across the 100 seeds, only 62% of individual Cora runs land within half a point of the published mean, and 46% of Citeseer runs do.

## What it took to get the official code to run

The repository pins its dependencies in `requirements.txt`. That file cannot be installed, on any Python version:

1. On the current Python (3.13), `pip install -r requirements.txt` fails while building `scipy==1.1.0`. TensorFlow 1.15 has no wheels for Python newer than 3.7 in any case.
2. On Python 3.7, pip reports the pins as mutually unsatisfiable: `numpy==1.15.4` conflicts with `tensorflow==1.15.4`, which needs numpy 1.16 or newer.
3. With the numpy pin relaxed, `setuptools==40.6.3` conflicts with TensorFlow's TensorBoard dependency, which needs setuptools 41 or newer.
4. With both relaxed, installation succeeds and `import tensorflow` crashes, because TensorFlow 1.15.4 does not cap `protobuf` and pip now selects a 4.x release it is incompatible with.

`setup.py` in the same repository lists looser, satisfiable requirements, and the README says only "tensorflow (>0.12)". The paper does not state a TensorFlow version. The environment that works is in `env/Dockerfile`, and the exact package set it resolved to is in `env/pip-freeze.txt`.

Once the environment existed, `python train.py` ran first time and is bit-for-bit repeatable for a fixed seed on this machine (three runs with the default seed 123 gave identical loss and accuracy: `results/determinism_cora_seed123.jsonl`).

## Deviations from the original

| ID | Type | What changed | Why | Expected effect |
|---|---|---|---|---|
| D1 | Environment | numpy 1.18.5 and setuptools 57.5.0 (the base image's) in place of the pinned 1.15.4 and 40.6.3 | The pins conflict with the pinned TensorFlow | None expected; unverifiable, since the pinned set cannot be installed |
| D2 | Environment | Added `protobuf==3.20.3` | TensorFlow 1.15.4 fails to import with the protobuf pip now selects | None expected |
| D3 | Code (one line, in memory) | `seed = 123` replaced by the run's seed | The script hard-codes one seed; the paper's protocol is 100 random initialisations | Required to follow the paper. The seed also drives dropout, not only weight initialisation |
| D4 | Protocol (exploratory run set only) | `--early_stopping 1000`, so training always runs the full 200 epochs | To measure the effect of the early-stopping rule discussed below | Removes early stopping entirely, which is also not what the paper describes |

Also different from the paper and not controllable here: CPU instead of the paper's GPU, and an unknown original TensorFlow version. Training times were not compared for that reason.

## Where the paper and the code disagree, or the paper is silent

**Early stopping.** The paper says training stops "if the validation loss does not decrease for 10 consecutive epochs". The code stops as soon as, after epoch 11, the validation loss exceeds the mean of the previous 10 epochs' validation losses (`train.py`, line 98). These are different rules. On Citeseer the code's rule can fire while the loss is still on its initial plateau:

```
Epoch: 0010 ... val_loss= 1.79019 val_acc= 0.06800
Epoch: 0011 ... val_loss= 1.79023 val_acc= 0.06800
Epoch: 0012 ... val_loss= 1.79050 val_acc= 0.07000
Epoch: 0013 ... val_loss= 1.79090 val_acc= 0.07000
Early stopping...
Test set results: cost= 1.78730 accuracy= 0.09800
```

(Citeseer, seed 23.) The same seed with early stopping disabled reaches 69.2%. Across the 100 Citeseer seeds, two runs stopped this way (seeds 21 and 23, at 17.2% and 9.8% accuracy). Those two runs move the mean from 70.77 to 69.63 and the standard deviation from 0.70 to 8.11. With early stopping disabled (D4), all 100 runs finish between 69.1% and 72.1%. The rule also ended 93 of the 100 Pubmed runs and 9 of the Cora runs before epoch 200, all after epoch 100 and without visible harm.

Whether the authors' 100 runs contained stops like this, whether they used this exact rule, and whether such runs were kept in the mean are not stated in the paper and cannot be determined from the repository.

**Which seeds.** The paper says 100 random weight initialisations. The repository fixes one seed and has no multi-run script, so the 100 seeds the authors used are unknown. Seeds 0 to 99 are my choice.

**NELL.** The paper reports 66.0% on NELL with different hyperparameters (dropout 0.1, L2 1e-5, 64 hidden units). The repository contains no NELL data, loader or configuration, and `train.py` exposes only one hidden-size flag. This claim is blocked, which is different from failed.

**Model selection.** The code evaluates the test set once, with the weights from the last epoch trained. The paper does not say otherwise, so this is consistent, but it is worth recording because many reimplementations report the best-validation epoch instead.

## Data check

`check_data.py` loads each dataset with the repository's own loader and compares it with the paper's Table 1 and stated split sizes (`results/data_check.json`).

| | Nodes | Features | Classes | Train / val / test | Edges (paper) | Edges (loaded graph) |
|---|---|---|---|---|---|---|
| Cora | 2,708 ✓ | 1,433 ✓ | 7 ✓ | 140 / 500 / 1,000 ✓ | 5,429 | 5,278 |
| Citeseer | 3,327 ✓ | 3,703 ✓ | 6 ✓ | 120 / 500 / 1,000 ✓ | 4,732 | 4,676, of which 124 self-loops |
| Pubmed | 19,717 ✓ | 500 ✓ | 3 ✓ | 60 / 500 / 1,000 ✓ | 44,338 | 44,327, of which 3 self-loops |

Training sets have exactly 20 labels per class, the three splits do not overlap, and the adjacency matrices are symmetric. The edge counts in the paper's table are quoted from Yang et al. (2016) and are higher than the number of distinct undirected edges in the files the code loads. I did not trace the cause. Citeseer contains 15 nodes whose feature vectors are all zero; the loader adds them deliberately (see the comment in `utils.py`).

The dataset files are Python pickles. Loading them executes whatever they contain, so every run here was made in a container with networking disabled. SHA-256 hashes of the files used are in `env/dataset-sha256.txt`.

## Reproduction checklist

| Item | Status | Note |
|---|---|---|
| Full text accessible | Yes | arXiv, v4 |
| Official implementation public | Yes | MIT licence |
| Code commit recorded | Yes | `39a4089` |
| Datasets accessible | Partly | Cora, Citeseer, Pubmed are in the repository. NELL is not |
| Dataset matches paper's description | Partly | Everything except edge counts |
| Split defined | Yes | Fixed Planetoid split, shipped with the data |
| Environment specified by authors | No | Pinned requirements are unsatisfiable; paper states no versions |
| Environment recorded for this attempt | Yes | `env/` |
| Hyperparameters stated in paper | Yes | Learning rate 0.01, dropout 0.5, L2 5e-4, 16 hidden units, 200 epochs, window 10 |
| Hyperparameters match code defaults | Yes | Checked against the flag defaults in `train.py` |
| Training procedure matches paper | Partly | Early-stopping rule differs from the paper's wording |
| Evaluation metric defined | Yes | Accuracy on 1,000 test nodes |
| Aggregation stated | Yes | Mean of 100 runs |
| Dispersion reported | No | Table 2 gives no spread for this row |
| Seeds stated | No | |
| Script to regenerate the reported numbers | No | Single-run demo only |
| Hardware stated | Yes | Xeon E5-2640 v3, GTX Titan X |
| Hardware matched | No | CPU only here |
| Code executed as published | Yes | One line changed in memory (D3) |
| Aggregation protocol followed | Yes | 100 runs per dataset |

## Not attempted

- The "GCN (rand. splits)" row of Table 2 (10 random splits, mean and standard error). The repository has no code to draw splits.
- Table 3 (propagation model comparison) and the depth experiment in the appendix.
- Training-time claims.
- Implementing the early-stopping rule as the paper words it. That would be new code, and so a reimplementation choice to make deliberately.

## Reproducing this record

```bash
git clone https://github.com/tkipf/gcn && git -C gcn checkout 39a4089fe72ad9f055ed6fdb9746abdcfebc4d81
```

```bash
docker build -t gcn-pilot pilot/gcn-kipf-welling-2017/env
```

```bash
docker run --rm --network none -v "$PWD/gcn:/src:ro" -v "$PWD/pilot/gcn-kipf-welling-2017:/pilot" -w /src/gcn -e PYTHONPATH=/src gcn-pilot python /pilot/run_seeds.py --dataset cora --seeds 0-99 --out /pilot/results/cora_seeds0-99.jsonl
```

Repeat the last command for `citeseer` and `pubmed`. One run takes roughly 4 seconds for Cora, 5 for Citeseer and 25 for Pubmed on a CPU. Then, with numpy, scipy and pytest installed:

```bash
cd pilot/gcn-kipf-welling-2017 && python -m pytest -q && python analyze.py
```

In the sandbox where this was run, the image build needed two extra lines to trust the sandbox's outbound proxy certificate. They are not in `env/Dockerfile` because they are specific to that sandbox and do not affect what is installed.

## Files

| File | Contents |
|---|---|
| `paper_claims.json` | The four claims, as reported, with where in the paper each comes from |
| `run_seeds.py` | Runs the official `train.py` once per seed and records the outcome |
| `repro_stats.py`, `test_repro_stats.py` | The comparison statistics and their tests |
| `analyze.py` | Builds `results/summary.json` and the table above |
| `check_data.py` | The data check |
| `results/*.jsonl` | One line per run |
| `env/` | Dockerfile, resolved package list, machine description, dataset hashes |
