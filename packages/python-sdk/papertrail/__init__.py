"""PaperTrail client: record what a research run was and what it produced.

Standard library only and compatible with Python 3.7+, so it installs into whatever
environment the original research code needs without changing it.

    from papertrail import Experiment

    with Experiment(name="baseline", group="cora", seed=42) as exp:
        exp.log_params({"learning_rate": 0.01})
        exp.log_metrics({"test_accuracy": 0.815})
"""
from .client import Client, Config, PaperTrailError
from .experiment import Experiment

__all__ = ["Experiment", "Client", "Config", "PaperTrailError"]
__version__ = "0.2.0"
