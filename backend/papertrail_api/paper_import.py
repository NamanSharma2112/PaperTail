"""Look up paper metadata from an arXiv identifier or a DOI.

arXiv identifiers use the arXiv API. DOIs use OpenAlex, which meters usage: set
OPENALEX_API_KEY for anything beyond occasional lookups.
"""
import os
import re
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

ARXIV_NEW = re.compile(r"^(\d{4}\.\d{4,5})(v\d+)?$")
ARXIV_OLD = re.compile(r"^([a-z\-]+(\.[A-Z]{2})?/\d{7})(v\d+)?$")
DOI = re.compile(r"^10\.\d{4,9}/\S+$")
ATOM = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


class LookupError_(Exception):
    """The identifier was understood but no metadata could be retrieved."""


def classify(identifier: str) -> tuple[str, str]:
    """Return ("arxiv" | "doi", normalised identifier) or raise ValueError."""
    s = identifier.strip()
    s = re.sub(r"^https?://(www\.)?(export\.)?arxiv\.org/(abs|pdf)/", "", s, flags=re.I)
    s = re.sub(r"^arxiv:", "", s, flags=re.I)
    s = re.sub(r"\.pdf$", "", s, flags=re.I)
    s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s, flags=re.I)
    s = re.sub(r"^doi:", "", s, flags=re.I)
    arxiv_doi = re.match(r"^10\.48550/arxiv\.(.+)$", s, flags=re.I)
    if arxiv_doi:
        s = arxiv_doi.group(1)
    for pattern in (ARXIV_NEW, ARXIV_OLD):
        m = pattern.match(s)
        if m:
            return "arxiv", m.group(1)
    if DOI.match(s):
        return "doi", s.lower()
    raise ValueError("Not an arXiv identifier or DOI: %r" % identifier)


def parse_arxiv_atom(xml_text: str, arxiv_id: str) -> dict:
    root = ET.fromstring(xml_text)
    entry = root.find("a:entry", ATOM)
    title = entry.findtext("a:title", default="", namespaces=ATOM) if entry is not None else ""
    if entry is None or not title.strip() or entry.find("a:author", ATOM) is None:
        raise LookupError_("arXiv has no paper with identifier %s" % arxiv_id)
    clean = lambda t: re.sub(r"\s+", " ", t or "").strip()
    return {
        "title": clean(title),
        "authors": [clean(a.findtext("a:name", default="", namespaces=ATOM))
                    for a in entry.findall("a:author", ATOM)],
        "abstract": clean(entry.findtext("a:summary", default="", namespaces=ATOM)),
        "arxiv_id": arxiv_id,
        "doi": entry.findtext("arxiv:doi", default=None, namespaces=ATOM),
        "venue": clean(entry.findtext("arxiv:comment", default="", namespaces=ATOM)) or None,
        "published": (entry.findtext("a:published", default="", namespaces=ATOM) or "")[:10] or None,
        "url": "https://arxiv.org/abs/%s" % arxiv_id,
        "metadata_source": "arxiv",
    }


def parse_openalex_work(work: dict, doi: str) -> dict:
    inverted = work.get("abstract_inverted_index") or {}
    positions = sorted((pos, word) for word, where in inverted.items() for pos in where)
    source = ((work.get("primary_location") or {}).get("source") or {}).get("display_name")
    return {
        "title": work.get("title") or work.get("display_name") or doi,
        "authors": [a["author"]["display_name"] for a in work.get("authorships", [])
                    if a.get("author", {}).get("display_name")],
        "abstract": " ".join(word for _, word in positions) or None,
        "arxiv_id": None,
        "doi": doi,
        "venue": source,
        "published": work.get("publication_date"),
        "url": "https://doi.org/%s" % doi,
        "metadata_source": "openalex",
    }


def lookup(identifier: str, client: Optional[httpx.Client] = None) -> dict:
    kind, value = classify(identifier)
    own = client is None
    client = client or httpx.Client(timeout=20.0, follow_redirects=True,
                                    headers={"User-Agent": "papertrail/0.1"})
    try:
        if kind == "arxiv":
            r = client.get("https://export.arxiv.org/api/query", params={"id_list": value})
            r.raise_for_status()
            return parse_arxiv_atom(r.text, value)
        params = {}
        if os.environ.get("OPENALEX_API_KEY"):
            params["api_key"] = os.environ["OPENALEX_API_KEY"]
        r = client.get("https://api.openalex.org/works/https://doi.org/%s" % value, params=params)
        if r.status_code == 404:
            raise LookupError_("OpenAlex has no work with DOI %s" % value)
        r.raise_for_status()
        return parse_openalex_work(r.json(), value)
    except httpx.HTTPError as exc:
        raise LookupError_("Metadata lookup failed: %s" % exc) from exc
    finally:
        if own:
            client.close()
