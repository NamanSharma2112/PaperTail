# Environment used for the PaperTrail pilot reproduction of Kipf & Welling (ICLR 2017).
# Base: the newest Python that tensorflow 1.15.x publishes wheels for.
FROM python:3.7-slim

# The upstream requirements.txt (tkipf/gcn @ 39a4089) cannot be installed as written:
#   D1  numpy==1.15.4 and setuptools==40.6.3 conflict with tensorflow==1.15.4
#       (needs numpy>=1.16,<1.19 and, via tensorboard, setuptools>=41).
#       -> keep the networkx / scipy / tensorflow pins, let pip resolve numpy and setuptools.
#   D2  tensorflow 1.15.4 does not cap protobuf; protobuf 4.x breaks `import tensorflow`.
#       -> pin protobuf to the last 3.x release.
RUN pip install --no-cache-dir networkx==2.2 scipy==1.1.0 tensorflow==1.15.4 protobuf==3.20.3
RUN pip freeze > /pip-freeze.txt
