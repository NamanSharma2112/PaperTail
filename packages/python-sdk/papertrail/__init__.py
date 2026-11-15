"""PaperTrail client: record what a research run was and what it produced.

Standard library only, and compatible with Python 3.7, so it installs into whatever
environment the original code needs.
"""
from .experiment import Experiment

__all__ = ["Experiment"]
__version__ = "0.1.0"
