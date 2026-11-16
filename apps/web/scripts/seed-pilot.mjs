// Load the GCN pilot reproduction (pilot/gcn-kipf-welling-2017) into an existing
// account as a project marked "Demonstration data".
//   DATABASE_URL=... node scripts/seed-pilot.mjs --email you@example.org
// Every number comes from the files recorded during the pilot.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { poolConfig } from "./pg-config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PILOT = process.env.PILOT_DIR ?? [resolve(here, "../../../pilot/gcn-kipf-welling-2017"), resolve(here, "../pilot/gcn-kipf-welling-2017")].find(existsSync);
const email = process.argv[process.argv.indexOf("--email") + 1];
if (!process.argv.includes("--email") || !email) {
  console.error("usage: node scripts/seed-pilot.mjs --email <account email>");
  process.exit(2);
}
if (!PILOT) {
  console.error("pilot data not found; set PILOT_DIR");
  process.exit(2);
}
const json = (p) => JSON.parse(readFileSync(join(PILOT, p), "utf8"));
const jsonl = (p) => readFileSync(join(PILOT, "results", p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const claims = json("paper_claims.json");
const refs = json("paper_references.json");
const envLines = Object.fromEntries(readFileSync(join(PILOT, "env/environment.yaml"), "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 2)]));
const packages = Object.fromEntries(readFileSync(join(PILOT, "env/pip-freeze.txt"), "utf8").split("\n").filter((l) => l.includes("==")).map((l) => l.split("==")));

const client = new pg.Client(poolConfig(process.env.DATABASE_URL));
await client.connect();
const q = (sql, params = []) => client.query(sql, params);

const user = (await q('select id from "user" where email = $1', [email.toLowerCase()])).rows[0];
if (!user) {
  console.error(`no account with email ${email}; sign up first`);
  process.exit(1);
}
const TITLE = "GCN (Kipf & Welling, ICLR 2017): Table 2";
if ((await q("select 1 from projects where owner_id = $1 and title = $2 and is_demo", [user.id, TITLE])).rowCount) {
  console.log("The pilot project is already in this account.");
  process.exit(0);
}

await q("begin");
try {
  const paper = claims.paper;
  let paperId = (await q("select id from papers where created_by = $1 and arxiv_id = $2", [user.id, paper.arxiv_id])).rows[0]?.id;
  if (!paperId) {
    paperId = (await q(
      `insert into papers (created_by, title, authors, arxiv_id, doi, publication_year, venue, publisher, landing_url, pdf_url, metadata_source, reading_status, abstract)
       values ($1,$2,$3,$4,$5,2016,'ICLR 2017','arXiv',$6,$7,'manual','reproduced',$8) returning id`,
      [user.id, paper.title, JSON.stringify(paper.authors), paper.arxiv_id, "10.48550/arxiv.1609.02907", `https://arxiv.org/abs/${paper.arxiv_id}`, `https://arxiv.org/pdf/${paper.arxiv_id}`,
       "We present a scalable approach for semi-supervised learning on graph-structured data that is based on an efficient variant of convolutional neural networks which operate directly on graphs."],
    )).rows[0].id;
    for (const r of refs.references) {
      await q("insert into paper_references (paper_id, title, year, authors, doi, arxiv_id, openalex_id, cited_by_count, source) values ($1,$2,$3,$4,$5,$6,$7,$8,'openalex')",
        [paperId, r.title, r.year, JSON.stringify(r.authors ?? []), r.doi, r.arxiv_id, r.openalex_id, r.cited_by_count]);
    }
  }

  const projectId = (await q(
    `insert into projects (owner_id, title, description, kind, status, outcome, outcome_notes, limitations, code_url, code_commit, is_demo)
     values ($1,$2,$3,'computational_reproduction','completed','partial',$4,$5,$6,$7,true) returning id`,
    [user.id, TITLE,
     "The official code run 100 times per dataset with seeds 0-99, compared with the 'GCN (this paper)' row of Table 2. Demonstration data from the PaperTrail pilot.",
     "Cora and Pubmed match the published means closely. Citeseer is inconclusive: the code's early-stopping rule differs from the paper's description and ends 2 of 100 runs at chance accuracy. NELL could not be attempted.",
     "CPU instead of the paper's GPU; TensorFlow version not stated by the paper; seeds 0-99 chosen by us because the paper does not list its seeds.",
     paper.official_code, paper.official_code_commit_evaluated],
  )).rows[0].id;
  await q("insert into project_papers (project_id, paper_id, is_primary) values ($1,$2,true)", [projectId, paperId]);

  const ev = (source, note) => ({ source, note });
  await q(
    `insert into protocols (project_id, research_objective, hypothesis, methodology, model_information, dataset_information, preprocessing, training_procedure, evaluation_method, experimental_setup, assumptions, evidence, version, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,$13)`,
    [projectId,
     "Show that a two-layer graph convolutional network classifies nodes in citation graphs more accurately than earlier semi-supervised methods.",
     "Running the official code as published reproduces the Table 2 test accuracies (Cora 81.5%, Citeseer 70.3%, Pubmed 79.0%, NELL 66.0%) as means of 100 random initialisations.",
     "Two-layer GCN with the renormalised propagation rule D^-1/2 (A+I) D^-1/2, trained on the Planetoid splits with 20 labels per class.",
     "Two graph convolution layers, 16 hidden units, ReLU, dropout on both layers, softmax output.",
     "Cora, Citeseer and Pubmed as shipped in the official repository (Planetoid split). NELL is not in the repository.",
     "Row-normalised features; symmetric normalisation of the adjacency with self-loops.",
     "Adam, learning rate 0.01, up to 200 epochs, early stopping with window 10 on validation loss. The code's stopping rule compares the loss with the mean of the previous 10 epochs, which differs from the paper's wording.",
     "Accuracy on 1,000 test nodes; mean of 100 runs with random weight initialisations.",
     JSON.stringify({ hyperparameters: { learning_rate: 0.01, hidden_units: 16, dropout: 0.5, weight_decay: 5e-4, epochs: 200, early_stopping_window: 10 }, seeds: "0-99 (the paper does not list its seeds; the code hard-codes 123)", splits: "Planetoid: 20 per class train, 500 validation, 1,000 test", hardware: "Paper: Xeon E5-2640 v3 + GTX Titan X. Pilot: 4 CPU cores, no GPU.", frameworks: "Paper: TensorFlow (version not stated). Pilot: Python 3.7.17, TensorFlow 1.15.4, numpy 1.18.5, scipy 1.1.0." }),
     "The 100 seeds used by the authors are unknown; any 100 random seeds are treated as equivalent.",
     JSON.stringify({
       research_objective: ev("reported", "Abstract and Section 1"), hypothesis: ev("selected", "Our framing of the check"),
       methodology: ev("reported", "Section 2, eq. 8"), model_information: ev("reported", "Section 5.2"), dataset_information: ev("implementation", "gcn/data in tkipf/gcn"),
       preprocessing: ev("implementation", "utils.py preprocess_features, preprocess_adj"), training_procedure: ev("reported", "Section 5.2; stopping rule from train.py line 98"),
       evaluation_method: ev("reported", "Section 6.1"), "hp:learning_rate": ev("reported", "Section 5.2"), "hp:hidden_units": ev("reported", "Section 6.1"),
       "hp:dropout": ev("reported", "Section 6.1"), "hp:weight_decay": ev("reported", "Section 6.1"), "hp:epochs": ev("reported", "Section 5.2"),
       "hp:early_stopping_window": ev("reported", "Section 5.2"), seeds: ev("selected", "Paper silent"), frameworks: ev("implementation", "requirements.txt (unsatisfiable as pinned)"),
     }),
     user.id],
  );

  const PLANETOID = { relation: "split from", title: "Revisiting Semi-Supervised Learning with Graph Embeddings", arxiv_id: "1603.08861", year: 2016 };
  const shipped = (k) => `Shipped in the official repository as Planetoid pickle files (gcn/data/ind.${k}.*).`;
  for (const [key, name, status, note, sources] of [
    ["cora", "Cora", "partial", shipped("cora") + " Edge count differs from the paper's Table 1 (5,278 vs 5,429).", [PLANETOID]],
    ["citeseer", "Citeseer", "partial", shipped("citeseer") + " Edge count differs from Table 1 (4,676 incl. 124 self-loops vs 4,732).", [PLANETOID]],
    ["pubmed", "Pubmed", "partial", shipped("pubmed") + " Edge count differs from Table 1 (44,327 vs 44,338).", [PLANETOID]],
    ["nell", "NELL", "unavailable", "Not in the official repository.", [PLANETOID, { relation: "built from", title: "Toward an Architecture for Never-Ending Language Learning", doi: "10.1609/aaai.v24i1.7519", year: 2010 }]],
  ]) {
    await q("insert into datasets (project_id, key, name, status, url, version, note, sources) values ($1,$2,$3,$4,'https://github.com/kimiyoung/planetoid',$5,$6,$7)",
      [projectId, key, name, status, status === "unavailable" ? null : "tkipf/gcn@39a4089", note, JSON.stringify(sources)]);
  }

  const verdicts = {
    "table2-gcn-cora": ["matched", "The 100-run mean is 0.03 points from the published value.", ["cora"]],
    "table2-gcn-citeseer": ["inconclusive", "As published the code gives 69.63, pulled down by two runs that stop at epoch 12-13 at chance accuracy. With early stopping off it gives 70.75. The paper does not say enough to choose between the readings.", ["citeseer", "citeseer-no-early-stopping"]],
    "table2-gcn-pubmed": ["matched", "The 100-run mean (79.055) is 0.055 points above the published value.", ["pubmed"]],
    "table2-gcn-nell": ["blocked", "Dataset and configuration are not in the official repository.", []],
  };
  const metricIds = {};
  for (const c of claims.claims) {
    const [verdict, note, groups] = verdicts[c.id];
    metricIds[c.id] = (await q(
      `insert into reported_metrics (project_id, key, label, metric_name, metric_value, metric_unit, run_value_scale, direction, aggregation, reported_runs,
         dataset_key, source_reference, provenance, run_groups, tolerance, tolerance_reason, blocked_reason, verdict, verdict_note)
       values ($1,$2,$3,'test_accuracy',$4,'%',100,'higher',$5,100,$6,$7,'reported',$8,0.5,'Half a point: below the run-to-run SD of single runs on Cora and Pubmed',$9,$10,$11) returning id`,
      [projectId, c.id, `Table 2: GCN on ${c.dataset === "nell" ? "NELL" : c.dataset[0].toUpperCase() + c.dataset.slice(1)}`, c.reported_value, c.reported_aggregation, c.dataset, c.source, groups,
       c.in_scope ? null : c.out_of_scope_reason.replace("BLOCKED: the", "The"), verdict, note],
    )).rows[0].id;
  }

  for (const [key, kind, what, why, effect, applies] of [
    ["D1", "environment", "numpy 1.18.5 and setuptools 57.5.0 in place of the pinned 1.15.4 and 40.6.3", "requirements.txt is unsatisfiable: both pins conflict with the pinned tensorflow 1.15.4", "None expected; unverifiable, since the pinned set cannot be installed", "all runs"],
    ["D2", "environment", "Added protobuf==3.20.3", "tensorflow 1.15.4 does not cap protobuf and fails to import with 4.x", "None expected", "all runs"],
    ["D3", "code", "The line `seed = 123` in train.py is replaced, in memory, by the run's seed", "The script hard-codes one seed; the paper reports the mean of 100 random initialisations", "Required to follow the paper's protocol. The seed also drives dropout", "all runs"],
    ["D4", "protocol", "--early_stopping 1000, so training always runs the full 200 epochs", "To measure the effect of the code's early-stopping rule", "Removes early stopping altogether, which is also not what the paper describes", "run group citeseer-no-early-stopping"],
  ]) {
    await q("insert into deviations (project_id, key, kind, what, why, expected_effect, applies_to) values ($1,$2,$3,$4,$5,$6,$7)", [projectId, key, kind, what, why, effect, applies]);
  }

  const environment = { platform: `${envLines.container_os} (container ${envLines.base_image?.split("@")[0]})`, packages };
  const hardware = { cpu_model: envLines.cpu_model, cpu_count: Number(envLines.cpu_cores_visible), gpus: [] };
  const groups = [["cora", "cora_seeds0-99.jsonl"], ["citeseer", "citeseer_seeds0-99.jsonl"], ["pubmed", "pubmed_seeds0-99.jsonl"], ["citeseer-no-early-stopping", "citeseer_seeds0-99_no-early-stopping.jsonl"]];
  let total = 0;
  for (const [group, file] of groups) {
    for (const rec of jsonl(file)) {
      const args = ["--dataset", rec.dataset, ...(rec.train_args ?? [])];
      const ok = rec.exit_code === 0 && rec.test_accuracy !== null;
      const runId = (await q(
        `insert into experiment_runs (project_id, name, run_group, status, git_repository, git_commit, git_dirty, dataset_version, python_version, operating_system,
           hardware_information, seed, parameters, environment_metadata, command, started_at, completed_at, duration_seconds)
         values ($1,$2,$3,$4,$5,$6,false,'tkipf/gcn@39a4089 (Planetoid)',$7,$8,$9,$10,$11,$12,$13,'2026-11-14T07:40:00Z','2026-11-14T07:40:00Z',$14) returning id`,
        [projectId, `${rec.dataset} seed ${rec.seed}`, group, ok ? "completed" : "failed", envLines.upstream_repo, envLines.upstream_commit, envLines.container_python.replace("Python ", ""),
         envLines.container_os, JSON.stringify(hardware), rec.seed, JSON.stringify({ dataset: rec.dataset, train_args: rec.train_args ?? [] }), JSON.stringify(environment),
         `python train.py ${args.join(" ")}`, rec.process_wall_seconds],
      )).rows[0].id;
      if (ok) {
        await q(
          `insert into run_metrics (run_id, metric_name, metric_value) values ($1,'test_accuracy',$2), ($1,'test_cost',$3), ($1,'epochs_run',$4), ($1,'early_stopped',$5)`,
          [runId, rec.test_accuracy, rec.test_cost, rec.epochs_run, rec.early_stopped ? 1 : 0],
        );
      }
      total++;
    }
  }

  for (const [category, title, severity, cause, explanation, evidence, status, metric] of [
    ["implementation_difference", "Citeseer mean 0.67 points below the paper, with 2 runs at chance accuracy", "high", "confirmed",
     "The code stops when validation loss exceeds the mean of the previous 10 epochs; on Citeseer this fires on the initial plateau for seeds 21 and 23. With early stopping disabled all 100 runs land between 69.1% and 72.1%.",
     "Seed 23 log: epochs 10-13 val_loss 1.79019, 1.79023, 1.79050, 1.79090 then 'Early stopping...', test accuracy 0.098.", "investigating", "table2-gcn-citeseer"],
    ["dependency_conflict", "requirements.txt cannot be installed", "medium", "confirmed",
     "numpy==1.15.4 and setuptools==40.6.3 conflict with tensorflow==1.15.4; protobuf is uncapped and 4.x breaks the import.", "pip ResolutionImpossible on Python 3.7; 'Descriptors cannot be created directly' on import.", "resolved", null],
    ["missing_information", "NELL data and configuration are not published", "medium", "confirmed",
     "The repository has no NELL data, loader or configuration, so the 66.0% claim cannot be attempted.", null, "wont_fix", "table2-gcn-nell"],
  ]) {
    await q("insert into discrepancies (project_id, reported_metric_id, category, title, severity, cause_status, explanation, evidence, resolution_status, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [projectId, metric ? metricIds[metric] : null, category, title, severity, cause, explanation, evidence, status, user.id]);
  }
  await q("insert into activity_events (project_id, actor_id, kind, summary) values ($1,$2,'demo.loaded',$3)", [projectId, user.id, `Loaded the GCN pilot as demonstration data (${total} runs)`]);
  await q("commit");
  console.log(`Loaded the pilot into ${email}: project ${projectId}, ${total} runs. It is marked "Demonstration data".`);
} catch (err) {
  await q("rollback");
  console.error("seed failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
