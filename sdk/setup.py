# Kept so that `pip install .` works with the old pip and setuptools found in
# environments built for older research code. Configuration lives in pyproject.toml.
from setuptools import setup

setup(
    name="papertrail",
    version="0.1.0",
    packages=["papertrail"],
    python_requires=">=3.7",
    entry_points={"console_scripts": ["papertrail = papertrail.cli:main"]},
)
