"""Render a project as a Markdown reproduction report."""
from .comparison import compare_claim
from .models import Project

KIND_LABEL = {
    "computational_reproduction": "Computational reproduction (the authors' code and data, re-executed)",
    "reimplementation": "Reimplementation (new code, the authors' data and method)",
    "replication": "Independent replication (new data or setting)",
}
VERDICT_LABEL = {"matched": "Matched", "not_matched": "Did not match", "inconclusive": "Inconclusive",
                 "blocked": "Blocked"}


def _num(x, digits=2):
    return "–" if x is None else ("%." + str(digits) + "f") % x


def _signed(x, digits=2):
    return "–" if x is None else ("%+." + str(digits) + "f") % x


def render(project: Project) -> str:
    paper = project.paper
    out = ["# Reproduction report: %s" % project.title, ""]
    out += ["## Paper", "",
            "%s. *%s.*%s" % (", ".join(paper.authors) or "Unknown authors", paper.title.rstrip("."),
                             (" " + paper.venue.rstrip(".") + ".") if paper.venue else ""),
            ""]
    if paper.url:
        out += [paper.url, ""]
    out += ["## What was attempted", "", KIND_LABEL.get(project.kind, project.kind), ""]
    if project.summary:
        out += [project.summary, ""]
    out += ["## Code and data", "",
            "- Code: %s%s" % (project.code_url or "not recorded",
                              (" at commit `%s`" % project.code_commit) if project.code_commit else ""),
            "- Data: %s" % (project.data_note or "not recorded"), ""]

    if project.datasets:
        out += ["## Datasets", "", "| Dataset | Status | Where from | Note |", "|---|---|---|---|"]
        cell = lambda t: (t or "–").replace("|", "\\|").replace("\n", " ")
        for ds in project.datasets:
            sources = "; ".join("%s %s%s" % (s.get("relation", "from"), s.get("title", ""),
                                             " (%s)" % s["year"] if s.get("year") else "")
                                for s in ds.sources or [])
            out.append("| %s | %s | %s | %s |" % (cell(ds.name), ds.status, cell(sources), cell(ds.note)))
        out.append("")

    out += ["## Claims and results", ""]
    for claim in project.claims:
        cmp_ = compare_claim(claim)
        unit = claim.unit or ""
        out += ["### %s" % claim.label, "",
                "- Reported: **%s%s** (%s)" % (_num(claim.reported_value, 1), unit, claim.metric),
                "- Aggregation as stated: %s" % (claim.aggregation or "not stated"),
                "- Dispersion reported: %s" % (
                    "%s (%s)" % (_num(claim.reported_dispersion), claim.dispersion_kind or "kind not stated")
                    if claim.reported_dispersion is not None else "none"),
                "- Source: %s" % (claim.source or "not recorded")]
        if claim.dataset_key:
            ds = next((d for d in project.datasets if d.key == claim.dataset_key), None)
            out.append("- Measured on: %s" % (ds.name if ds else claim.dataset_key))
        if claim.provenance != "reported":
            out.append("- Note: this value is %s, not stated by the authors." % claim.provenance)
        if claim.tolerance is not None:
            out.append("- Tolerance set by the researcher: ±%s%s%s" % (
                _num(claim.tolerance), unit,
                (" (" + claim.tolerance_reason + ")") if claim.tolerance_reason else ""))
        out.append("")
        if claim.blocked_reason:
            out += ["**Blocked.** %s" % claim.blocked_reason, ""]
        elif not cmp_["run_sets"]:
            out += ["No runs recorded.", ""]
        else:
            out += ["| Run set | Runs | Mean | SD | 95% CI of mean | Difference | 95% CI of difference |",
                    "|---|---|---|---|---|---|---|"]
            for rs in cmp_["run_sets"]:
                s, d = rs["summary"], rs["diff_interval"]
                name = rs["run_set"] + (" (exploratory)" if rs["exploratory"] else "")
                if not s:
                    out.append("| %s | 0 | – | – | – | – | – |" % name)
                    continue
                ci = "–" if s["ci_low"] is None else "[%s, %s]" % (_num(s["ci_low"]), _num(s["ci_high"]))
                dci = "–" if not d else "[%s, %s]" % (_signed(d["ci_low"]), _signed(d["ci_high"]))
                out.append("| %s | %d | %s | %s | %s | %s | %s |" % (
                    name, s["n"], _num(s["mean"]), _num(s["sd"]), ci, _signed(rs["diff"]), dci))
            out.append("")
            seen = set()
            for rs in cmp_["run_sets"]:
                if rs["diff_interval"] and rs["diff_interval"]["assumption"] not in seen:
                    seen.add(rs["diff_interval"]["assumption"])
                    out += ["Interval for the difference: " + rs["diff_interval"]["assumption"], ""]
                for note in rs["notes"]:
                    out += ["- %s: %s" % (rs["run_set"], note["text"])]
                if rs["share_within_tolerance"] is not None:
                    out += ["- %s: %.0f%% of individual runs fall within the tolerance." % (
                        rs["run_set"], 100 * rs["share_within_tolerance"])]
            out.append("")
        if claim.verdict:
            out += ["**Researcher's conclusion: %s.** %s" % (
                VERDICT_LABEL.get(claim.verdict, claim.verdict), claim.verdict_note or ""), ""]
        else:
            out += ["Researcher's conclusion: not yet recorded.", ""]

    out += ["## Deviations from the original", ""]
    if project.deviations:
        out += ["| ID | Type | What changed | Why | Expected effect |", "|---|---|---|---|---|"]
        cell = lambda t: (t or "–").replace("|", "\\|").replace("\n", " ")
        for d in project.deviations:
            out.append("| %s | %s | %s | %s | %s |" % (d.key, d.kind, cell(d.what), cell(d.why),
                                                       cell(d.expected_effect)))
    else:
        out.append("None recorded.")
    out.append("")

    out += ["## Execution environments", ""]
    envs = {}
    for rs in project.run_sets:
        for run in rs.runs:
            env = run.environment or {}
            key = (env.get("python"), env.get("platform"), (run.git or {}).get("commit"))
            envs.setdefault(key, 0)
            envs[key] += 1
    if envs:
        out += ["| Python | Platform | Code commit | Runs |", "|---|---|---|---|"]
        for (py, plat, commit), count in envs.items():
            out.append("| %s | %s | %s | %d |" % (py or "not recorded", plat or "not recorded",
                                                  ("`%s`" % commit[:12]) if commit else "not recorded",
                                                  count))
    else:
        out.append("No runs recorded.")
    out.append("")
    return "\n".join(out)
