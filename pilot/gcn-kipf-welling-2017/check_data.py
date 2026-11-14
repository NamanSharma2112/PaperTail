"""Compare the datasets shipped in the official repository with the paper's Table 1 and
Section 5.2. Uses the repository's own load_data(); run from <upstream repo>/gcn.

    python check_data.py > results/data_check.json
"""
import json

import numpy as np

from gcn.utils import load_data

# Table 1 of the paper ("Dataset statistics, as reported in Yang et al. 2016") and the
# split sizes stated in Sections 5.1-5.2.
PAPER = {
    "cora": {"nodes": 2708, "edges": 5429, "classes": 7, "features": 1433, "label_rate": 0.052},
    "citeseer": {"nodes": 3327, "edges": 4732, "classes": 6, "features": 3703, "label_rate": 0.036},
    "pubmed": {"nodes": 19717, "edges": 44338, "classes": 3, "features": 500, "label_rate": 0.003},
}
PAPER_SPLIT = {"train_labels_per_class": 20, "validation": 500, "test": 1000}

out = {}
for name, paper in PAPER.items():
    adj, features, y_train, y_val, y_test, train_mask, val_mask, test_mask = load_data(name)
    adj = adj.tocsr()
    n = adj.shape[0]
    self_loops = int(adj.diagonal().astype(bool).sum())
    undirected_edges = int((adj.count_nonzero() - self_loops) // 2 + self_loops)
    labels = y_train + y_val + y_test  # only the labels the three splits use
    idx = lambda m: set(np.flatnonzero(m).tolist())
    found = {
        "nodes": int(n),
        "edges": undirected_edges,
        "self_loops": self_loops,
        "classes": int(y_train.shape[1]),
        "features": int(features.shape[1]),
        "label_rate": round(float(train_mask.sum()) / n, 3),  # the paper gives 3 decimals
        "nodes_with_all_zero_features": int((np.asarray(features.sum(1)).ravel() == 0).sum()),
        "isolated_nodes": int((np.asarray(adj.sum(1)).ravel() == 0).sum()),
        "train": int(train_mask.sum()),
        "train_labels_per_class": sorted(int(v) for v in y_train[train_mask].sum(0)),
        "validation": int(val_mask.sum()),
        "test": int(test_mask.sum()),
        "test_nodes_without_label": int((y_test[test_mask].sum(1) == 0).sum()),
        "split_overlap": len(idx(train_mask) & idx(val_mask)) + len(idx(train_mask) & idx(test_mask))
                         + len(idx(val_mask) & idx(test_mask)),
        "adjacency_symmetric": bool(abs(adj - adj.T).nnz == 0),
    }
    out[name] = {
        "paper": dict(paper, **PAPER_SPLIT),
        "repository": found,
        "matches": {k: found[k] == v for k, v in paper.items()},
    }
print(json.dumps(out, indent=2))
