# PaperTrail: feasibility assessment

Date: 14 November 2026. Scope: Phase 1 of the mission (critical feasibility assessment) and Phase 3 (pilot paper selection), with the parts of Phase 2 needed to decide what statistics the MVP needs.

## Verdict

Build it, with three changes to the plan:

1. **Make the claim the unit of the product, not the paper or the run.** A claim is one number in the paper together with how it was aggregated ("81.5% accuracy, mean of 100 runs with random weight initialisations"). Everything else hangs off it: the runs that test it, the deviations that qualify it, and its outcome.
2. **Capture runs by wrapping an unmodified command, before offering an in-code SDK.** Editing the authors' training script to add logging calls is itself a deviation from the original method. The pilot needed zero changes to the model code.
3. **Treat the product as the audit trail of a reproduction, whoever or whatever performs it.** Coding agents can already do part of the legwork. The durable part is a record that a second person can check.

The evidence for these comes from actually running the pilot paper's official code, described in [the pilot record](../pilot/gcn-kipf-welling-2017/README.md). The short version is below.

## What the pilot showed

The pilot paper is Kipf & Welling, *Semi-Supervised Classification with Graph Convolutional Networks* (ICLR 2017). The official repository is public, the three citation datasets ship inside it, and one training run takes seconds on a CPU. By the brief's own criteria it is close to the easiest possible case. Even so:

- **The pinned dependencies cannot be installed**, on a current Python or on the Python they were written for. It took three corrections to the environment before the first line of the authors' code ran.
- **The paper's protocol is not what the repository runs.** The paper reports the mean of 100 runs. The repository hard-codes one seed and has no script for the 100.
- **Two of the three testable claims match closely** when the paper's protocol is followed: Cora 81.47 against a published 81.5, Pubmed 79.05 against 79.0 (100 runs each).
- **The third is inconclusive, for a reason no one could have guessed from the paper.** The code's early-stopping rule is not the rule the paper describes, and on Citeseer it stops 2 runs in 100 at epoch 12 or 13 with chance-level accuracy. Depending on how those runs are treated the mean is 69.63 or about 70.75, against a published 70.3.
- **The fourth claim (NELL) cannot be attempted**: the data and configuration are not in the repository.
- **A single run would have misled.** The default seed gives 81.6 on Cora, an apparently perfect match. Only 62% of individual Cora runs land within half a point of the published mean.

None of this says the paper is wrong. It says that "the code is public" and "the result reproduces" are separated by a set of decisions somebody has to make and write down, which is the product.

## Corrections to the brief

I checked the brief's factual claims where I could. Four need updating, and one holds with caveats.

| Brief says | What I found | Consequence |
|---|---|---|
| Papers with Code "already connects research to implementations and benchmarks" | It was shut down in July 2025. `paperswithcode.com` now returns a 302 redirect to Hugging Face's trending papers page (checked today). The successor does not reproduce the paper–code–benchmark linkage. | The paper-to-code-to-result link PaperTrail wants is now less served, not more. It also means there is no Papers with Code API to integrate with; link to Hugging Face paper pages and to repositories directly. |
| OpenAlex is "free to start using" | Still true, but since February 2026 an API key is required for production use and usage is metered against a free daily allowance. A keyless single-work lookup worked today and was billed at $0. | Fine for import-by-DOI. Register a key, cache every lookup, and keep the arXiv API as the path for arXiv IDs. |
| DVC is an independent experiment and data versioning tool | lakeFS took over DVC in November 2025. It remains open source under the same licence. | No change to the integration plan; note the stewardship change. |
| Renku is a reference for collaborative reproducible projects | Renku Legacy was shut down in October 2025 and replaced by Renku 2.0. | A reminder that hosted research platforms get retired. Exportable, self-contained records matter. |
| 66% had difficulty reproducing; 79% / 63% / 63% / 50% obstacle rates | The figures are in Costa, Barbosa & Cunha, arXiv:2503.07080 (March 2025). It is a preprint. The survey had 102 responses, recruited largely from ICSE 2022 authors plus social media, 47% from Portugal, and the paper does not state the denominators for the obstacle percentages. | Usable as motivation, as the brief already says. Not usable as market sizing, and it describes software-engineering researchers more than ML students. |

I did not independently read the Elicit, Code Ocean or MLflow documentation the brief cites, and I did not read the 2026 PLOS Biology consensus paper beyond confirming it exists (Banzi et al., doi:10.1371/journal.pbio.3003726). Treat the brief's descriptions of those as unverified by me.

Two things the brief does not mention matter more than any of the above:

- **The ML Reproducibility Challenge is now an official NeurIPS track** (MLRC 2026, with papers routed through TMLR), and university courses are built around it. That is an existing population of students who must reproduce a paper and must write a report. They are the best first users and the best interview pool, and their required report is a concrete target format for PaperTrail's export.
- **Agent-driven reproduction is an active research area** (PaperBench, AutoReproduce, ReproBridge and others). Reported success rates are well under half, so this is not a solved problem, but it changes what a "workspace" should be. This pilot was itself carried out by an agent; what made it reviewable was the recorded evidence, not the interface.

## Assumptions I would challenge

**"Researchers will document a reproduction protocol in a web form."** This is the riskiest assumption in the plan. Recording is a cost paid now for a benefit later, and the incumbent is a README plus a spreadsheet. In the pilot, writing the claims down took minutes and paid off immediately, because the comparison could then be computed instead of eyeballed. So the first screen should ask for the two or three numbers you are trying to hit and how the paper aggregated them, and show the comparison as soon as the first run arrives. The fuller methodology brief (Module B) can grow from there. Test this in the interviews by asking people to show the artefact where their last reproduction's numbers ended up.

**"Module C is experiment tracking."** MLflow and Weights & Biases already do this well and people already use them. PaperTrail needs a much thinner thing: for each run, the command, git commit, environment, seed, exit status and final metrics. The first ingestion path should be a CLI wrapper (`papertrail run -- python train.py --dataset cora`) that records those and parses or is told the metrics. The second should be an importer from an MLflow run. The in-code context-manager SDK in the brief is the third, for people writing their own reimplementation.

**"Discrepancy investigation starts when results don't match."** In the pilot, three deviations were forced before the first run, all in the environment. Deviations need to be recordable from the first install command, each with a type (environment, code, data, protocol), a reason and the evidence.

**"Compare a run with the published number."** The comparison is between a *set* of runs and a claim. The data model needs a run set (runs that share a configuration and differ only by seed) and the comparison needs to check that the run set's size and aggregation match what the claim states. A single run compared with a mean of 100 is a mismatch the product should flag, as the brief says; the pilot quantifies how misleading it is.

**"A paper is reproduced or not."** Outcomes belong to claims. One of the pilot paper's four headline numbers cannot be attempted from the official repository at all. The record needs per-claim outcomes, and "blocked" and "inconclusive" have to be as respectable as "matched". A paper-level view is a roll-up of these and never a score, which agrees with the brief's stance against a reproducibility score.

**"Eight weeks."** With a week of interviews and two people, I would cut further than the brief does. See the next section.

## MVP scope

Keep:

- Import a paper by arXiv ID or DOI (metadata and links only).
- Claims table: value, metric, dataset, aggregation, dispersion if reported, and where in the paper it comes from. Each field is marked as reported by the authors, inferred by the user, or not stated.
- Link code (repository and commit) and data (identifier and hash).
- CLI wrapper that records runs and uploads them.
- Run sets and the claim comparison.
- Deviation log.
- Report export (Markdown first).

Cut from the first eight weeks:

- Paper search, library, tags and collections. Import by identifier is enough.
- Multi-user collaboration and permissions beyond "owner can edit, anyone with the link can read".
- S3-compatible artefact storage. Store hashes, sizes and small text logs; keep large artefacts on the researcher's machine until someone asks for upload.
- GitHub API integration. A repository URL and commit hash captured by the CLI is sufficient.
- Any automatic extraction from PDFs.

The stack in the brief (Next.js, FastAPI, PostgreSQL, a Python CLI) is appropriate. FastAPI is the right backend choice specifically because the statistics live in Python and should have one implementation.

## Statistics: what the MVP needs

Needed now, all of it implemented and tested in the pilot (`repro_stats.py`, cross-checked against `scipy.stats` and hand-computed values):

- Absolute and relative difference between the reproduced aggregate and the published value.
- Run-set summary: count, mean, sample standard deviation, standard error, Student-t confidence interval for the mean, minimum, median, maximum.
- A check that the run set matches the claim's stated aggregation (number of runs, what varies).
- The share of individual runs that fall within a stated tolerance of the published value. This is what shows a user why one run is not evidence.
- A tolerance per claim that the researcher sets before running, with the reason. "What counts as a match" is a decision the product records; it should not decide it.

Postpone:

- Significance and equivalence tests. They need the published dispersion, and papers often omit it, as this one does. The pilot reports an interval for the difference only under an explicitly labelled assumption that the authors' runs varied as much as ours.
- Bootstrap intervals, multiple-comparison handling, metric normalisation across papers.
- Leakage and split-integrity checks (Module C in the data-science list). Valuable, but each is paper-specific; collect cases from real reproductions first.
- Cross-project analytics and any machine learning.

## Security and legal notes from the pilot

- The pilot datasets are Python pickle files. Loading a pickle can execute arbitrary code, so "the dataset" is as untrusted as "the code". The pilot ran everything in a container with networking disabled. The brief's decision to execute only on the researcher's machine is right; in addition, the server must never unpickle, import or otherwise interpret an uploaded artefact.
- Store metadata, links and user-entered claim values. Do not host PDFs.

## Who does what next

Developer 1 (product and software):

1. Data model and API for paper, claim, run set, run, deviation and outcome. `paper_claims.json` and the run records in the pilot directory are working examples of the first four.
2. `papertrail run -- <command>`: capture command, working-tree commit and dirty state, Python version, installed packages, OS, hardware summary, start and end time, exit code; upload as one run record.
3. One page that shows a claim, its run set and the comparison. Use the pilot data as the fixture.

Developer 2 (data science):

1. Review `repro_stats.py` and its tests, then own it. Decide the tolerance policy and how aggregation mismatches are reported.
2. Extend the pilot: implement the early-stopping rule as the paper words it and measure the effect; attempt the paper's "random splits" row; decide whether the Citeseer result counts as matched and write down why.
3. Draft the claim-entry guidance: what to record when a paper gives no dispersion, no seed count, or no split.

Both: run the interviews, and include at least two people who have taken part in the ML Reproducibility Challenge or taught a course built on it. Ask to see where their numbers ended up.

## Sources

- Papers with Code shutdown: https://www.codesota.com/papers-with-code/shutdown and https://hyper.ai/en/news/42900 ; redirect observed directly.
- OpenAlex authentication and pricing: https://developers.openalex.org/api-reference/authentication.md and https://help.openalex.org/access/pricing/
- DVC and lakeFS: https://lakefs.io/blog/lakefs-acquires-dvc/ and https://dvc.org/blog/dvc-joins-lakefs-your-questions-answered/
- Renku Legacy: https://blog.renkulab.io/sunsetting-legacy/
- Survey figures: https://arxiv.org/abs/2503.07080 (and the earlier https://arxiv.org/abs/2308.00703)
- MLRC 2026: https://blog.neurips.cc/2026/05/04/mlrc-2026-reproducibility-as-an-official-track-at-neurips/ and https://neurips.cc/Conferences/2026/CallForReproducibility
- PaperBench: https://arxiv.org/abs/2504.01848 ; ReproBridge: https://papers.cool/arxiv/2611.08452 ; paper-replication skill: https://huggingface.co/papers/2607.02134
- PLOS Biology consensus paper: https://doi.org/10.1371/journal.pbio.3003726
- Pilot paper: https://arxiv.org/abs/1609.02907 ; official code: https://github.com/tkipf/gcn
