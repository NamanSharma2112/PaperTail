import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The 14-step workflow from the product specification, end to end: real accounts,
 * real paper import from arXiv, a real Python experiment recorded with the SDK, and a
 * second account that must not see the first one's data.
 */
const SDK = resolve(__dirname, "../../../../packages/python-sdk");
const PYTHON = process.env.E2E_PYTHON ?? "python3";
const stamp = Date.now();
const alice = { name: "Alice Researcher", email: `alice.${stamp}@example.org`, password: "e2e-password-alice" };
const bob = { name: "Bob Other", email: `bob.${stamp}@example.org`, password: "e2e-password-bob" };

async function signUp(page: Page, u: typeof alice) {
  await page.goto("/signup");
  await page.fill("#name", u.name);
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.fill("#confirm", u.password);
  await page.click('button:has-text("Create account")');
  await page.waitForURL("**/dashboard");
}

test("complete reproduction workflow with data isolation", async ({ page, browser, baseURL }) => {
  // 1. Register
  await signUp(page, alice);
  await expect(page.locator("h1")).toContainText("Hello, Alice");

  // 2. Log out and log in again
  await page.click('button[aria-label="Account menu"]');
  await page.click("text=Sign out");
  await page.waitForURL("**/login");
  await page.fill("#email", alice.email);
  await page.fill("#password", alice.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/dashboard");

  // 3. Import a research paper (arXiv)
  await page.goto("/library");
  await page.fill("#paper-identifier", "https://arxiv.org/abs/1609.02907");
  await page.click('button:has-text("Import paper")');
  await page.waitForURL(/\/library\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.locator("h1")).toContainText("Graph Convolutional Networks");

  // 4. Create a reproduction project
  await page.click("text=Create reproduction project");
  await page.waitForURL("**/projects/new**");
  await page.fill("#code_url", "https://github.com/tkipf/gcn");
  await page.fill("#code_commit", "39a4089fe72ad9f055ed6fdb9746abdcfebc4d81");
  await page.click('button:has-text("Create project")');
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  const projectId = projectUrl.split("/").pop()!;

  // 5. Document the methodology, with provenance
  await page.goto(`${projectUrl}/paper`);
  await page.fill("#f-research_objective", "Check the GCN test accuracy reported in Table 2.");
  await page.selectOption("#prov-research_objective", "reported");
  await page.fill("#f-methodology", "Two-layer GCN, 200 epochs, Adam, early stopping window 10.");
  await page.selectOption("#prov-methodology", "reported");
  await page.fill("#f-evaluation_method", "Accuracy on 1,000 test nodes, mean of 100 runs.");
  await page.click('button:has-text("Save protocol")');
  await expect(page.getByText("Protocol saved (version 2)")).toBeVisible();

  // 6. Create an ingestion token
  await page.goto(`${projectUrl}/settings`);
  await page.fill("#tk-name", "e2e laptop");
  await page.click('button:has-text("Create token")');
  const snippet = await page.locator("pre", { hasText: "PAPERTRAIL_TOKEN=pt_" }).textContent();
  const token = snippet!.match(/PAPERTRAIL_TOKEN=(pt_[A-Za-z0-9_-]{43})/)![1];

  // 7–8. Run a small Python experiment locally and submit it with the SDK
  const dir = mkdtempSync(join(tmpdir(), "pt-e2e-"));
  writeFileSync(
    join(dir, "experiment.py"),
    `import random
from papertrail import Experiment
for seed in range(3):
    rng = random.Random(seed)
    with Experiment(name=f"seed-{seed}", group="cora", seed=seed) as exp:
        exp.log_params({"learning_rate": 0.01, "hidden": 16})
        for epoch in range(0, 100, 25):
            exp.log_metric("val_loss", 1.9 - epoch * 0.01 + rng.random() * 0.01, step=epoch)
        exp.log_metric("test_accuracy", 0.81 + seed * 0.003)
        open("predictions.csv", "w").write("node,label\\n1,3\\n")
        exp.log_artifact("predictions.csv")
`,
  );
  const env = { ...process.env, PYTHONPATH: SDK, PAPERTRAIL_URL: baseURL!, PAPERTRAIL_PROJECT: projectId, PAPERTRAIL_TOKEN: token, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1" };
  const out = execFileSync(PYTHON, ["experiment.py"], { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  void out;

  // 9. See the completed runs in the website
  await page.goto(`${projectUrl}/experiments`);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody").getByText("completed")).toHaveCount(3);
  await page.click("text=seed-1");
  await expect(page.getByText("learning_rate")).toBeVisible();
  await expect(page.getByText("predictions.csv")).toBeVisible();

  // 10. Enter the originally reported metric
  await page.goto(`${projectUrl}/results`);
  await page.getByRole("button", { name: "Add published result" }).first().click();
  await page.fill("#m-label", "Table 2: GCN on Cora");
  await page.fill("#m-key", "t2-cora");
  await page.fill("#m-name", "test_accuracy");
  await page.fill("#m-value", "81.5");
  await page.fill("#m-unit", "%");
  await page.fill("#m-agg", "mean of 100 runs with random weight initialisations");
  await page.fill("#m-n", "100");
  await page.fill("#m-src", "Table 2");
  await page.fill("#m-scale", "100");
  await page.click('button:has-text("Save")');
  await expect(page.getByText("Published result saved")).toBeVisible();

  // 11. Compare: mean of 81.0, 81.3, 81.6 = 81.30; difference −0.20; too few runs flagged
  const card = page.locator("section", { hasText: "Table 2: GCN on Cora" }).last();
  await expect(card.locator("td").filter({ hasText: /^81\.30$/ })).toBeVisible();
  await expect(card.getByText("−0.20", { exact: true })).toBeVisible();
  await expect(card.getByText("3 run(s) recorded; the paper aggregates 100.")).toBeVisible();

  // 12. Record a discrepancy
  await page.goto(`${projectUrl}/discrepancies`);
  await page.getByRole("button", { name: "Record a discrepancy" }).click();
  await page.fill("#dc-title", "Mean 0.2 points below the paper with 3 of 100 runs");
  await page.selectOption("#dc-cat", "statistical_variation");
  await page.fill("#dc-exp", "Too few runs to tell; 97 more seeds needed.");
  await page.click('button:has-text("Save")');
  await expect(page.getByText("Discrepancy recorded")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mean 0.2 points below the paper with 3 of 100 runs" })).toBeVisible();

  // 13. Export the reproduction report
  await page.goto(`${projectUrl}/report`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Export Markdown")]);
  const md = readFileSync((await download.path())!, "utf8");
  expect(md).toContain("# Reproduction report:");
  expect(md).toContain("Semi-Supervised Classification with Graph Convolutional Networks");
  expect(md).toContain("| cora | 3 | 81.30 |");
  expect(md).toContain("Mean 0.2 points below the paper");
  expect(md).toContain("_Source: Reported by the authors_");

  // 14. Another user cannot see any of it
  const other = await browser.newContext();
  const bp = await other.newPage();
  await signUp(bp, bob);
  await bp.goto(projectUrl);
  await expect(bp.getByText("Nothing here, or not yours to see")).toBeVisible();
  for (const path of [`/api/v1/projects/${projectId}`, `/api/v1/projects/${projectId}/runs`, `/api/v1/projects/${projectId}/report`]) {
    expect((await bp.request.get(path)).status()).toBe(404);
  }
  expect((await (await bp.request.get("/api/v1/projects")).json()).projects).toHaveLength(0);
  expect((await (await bp.request.get("/api/v1/papers")).json()).papers).toHaveLength(0);
  // …and Alice's token cannot be used to read or write elsewhere.
  const wrong = await bp.request.post("/api/v1/sdk/runs", { headers: { Authorization: `Bearer ${token}` }, data: { project_id: "11111111-1111-4111-8111-111111111111", name: "x" } });
  expect(wrong.status()).toBe(403);
  await other.close();
});
