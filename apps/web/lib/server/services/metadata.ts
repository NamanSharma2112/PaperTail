import "server-only";
import { ApiError } from "../http";

/**
 * Paper metadata from public sources, by identifier:
 *   arXiv identifiers and arxiv.org URLs  -> arXiv API (export.arxiv.org)
 *   DOIs and doi.org / publisher URLs     -> Crossref REST API, OpenAlex as fallback
 * Only metadata and links are stored; no PDFs are downloaded.
 */

export type PaperMetadata = {
  title: string;
  authors: string[];
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  publication_year: number | null;
  venue: string | null;
  publisher: string | null;
  landing_url: string | null;
  pdf_url: string | null;
  metadata_source: "arxiv" | "crossref" | "openalex";
};

export type Identifier = { kind: "arxiv"; value: string } | { kind: "doi"; value: string };

const ARXIV_NEW = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const ARXIV_OLD = /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/;
const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"<>?#]+)/i;

export function classifyIdentifier(input: string): Identifier {
  let s = input.trim();
  const arxivUrl = s.match(/arxiv\.org\/(?:abs|pdf|html)\/([^?#\s]+?)(?:\.pdf)?(?:[?#].*)?$/i);
  if (arxivUrl) s = arxivUrl[1];
  s = s.replace(/^arxiv:/i, "");
  const arxivDoi = s.match(/(?:doi\.org\/)?10\.48550\/arxiv\.(.+)$/i);
  if (arxivDoi) s = arxivDoi[1];
  for (const re of [ARXIV_NEW, ARXIV_OLD]) {
    const m = s.match(re);
    if (m) return { kind: "arxiv", value: m[1] };
  }
  const doi = input.trim().replace(/^doi:\s*/i, "").match(DOI_IN_TEXT);
  if (doi) return { kind: "doi", value: decodeURIComponent(doi[1]).replace(/[.,;]+$/, "").toLowerCase() };
  throw new ApiError(422, "unrecognised_identifier", "Enter an arXiv ID (e.g. 1609.02907), a DOI (10.…) or an arXiv / doi.org URL");
}

function userAgent() {
  const mail = process.env.CROSSREF_MAILTO;
  return mail ? `PaperTrail/0.1 (mailto:${mail})` : "PaperTrail/0.1";
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { "User-Agent": userAgent(), Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new ApiError(502, "metadata_unavailable", `The metadata service answered ${res.status}`);
  return { status: res.status, body: await res.json() };
}

const decodeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
const clean = (s: string | null | undefined) => (s ? decodeXml(s).replace(/\s+/g, " ").trim() : "");
const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function parseArxivAtom(xml: string, id: string): PaperMetadata {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const title = clean(entry?.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]);
  const authors = [...(entry ?? "").matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => clean(m[1]));
  if (!entry || !title || authors.length === 0) throw new ApiError(404, "paper_not_found", `arXiv has no paper with identifier ${id}`);
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";
  const doi = entry.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/)?.[1];
  const journal = entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/)?.[1];
  const comment = entry.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/)?.[1];
  return {
    title,
    authors,
    abstract: clean(entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]) || null,
    doi: doi ? doi.trim().toLowerCase() : null,
    arxiv_id: id,
    publication_year: /^\d{4}/.test(published) ? Number(published.slice(0, 4)) : null,
    venue: clean(journal) || clean(comment) || null,
    publisher: "arXiv",
    landing_url: `https://arxiv.org/abs/${id}`,
    pdf_url: `https://arxiv.org/pdf/${id}`,
    metadata_source: "arxiv",
  };
}

type CrossrefWork = {
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  abstract?: string;
  DOI?: string;
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  publisher?: string;
  URL?: string;
  link?: { URL: string; "content-type"?: string }[];
};

export function parseCrossref(work: CrossrefWork, doi: string): PaperMetadata {
  const year = work.issued?.["date-parts"]?.[0]?.[0] ?? work.published?.["date-parts"]?.[0]?.[0] ?? null;
  const pdf = work.link?.find((l) => l["content-type"] === "application/pdf")?.URL ?? null;
  return {
    title: clean(work.title?.[0]) || doi,
    authors: (work.author ?? []).map((a) => clean(a.name ?? [a.given, a.family].filter(Boolean).join(" "))).filter(Boolean),
    abstract: work.abstract ? stripTags(decodeXml(work.abstract)).replace(/^Abstract\s+/i, "") : null,
    doi,
    arxiv_id: null,
    publication_year: typeof year === "number" ? year : null,
    venue: clean(work["container-title"]?.[0]) || null,
    publisher: clean(work.publisher) || null,
    landing_url: work.URL ?? `https://doi.org/${doi}`,
    pdf_url: pdf,
    metadata_source: "crossref",
  };
}

type OpenAlexWork = {
  title?: string;
  display_name?: string;
  authorships?: { author?: { display_name?: string } }[];
  abstract_inverted_index?: Record<string, number[]>;
  publication_year?: number;
  primary_location?: { source?: { display_name?: string; host_organization_name?: string }; landing_page_url?: string; pdf_url?: string };
  best_oa_location?: { pdf_url?: string };
};

export function parseOpenAlex(work: OpenAlexWork, doi: string): PaperMetadata {
  const inv = work.abstract_inverted_index ?? {};
  const words: [number, string][] = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words.push([p, w]);
  words.sort((a, b) => a[0] - b[0]);
  return {
    title: work.title ?? work.display_name ?? doi,
    authors: (work.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    abstract: words.length ? words.map((w) => w[1]).join(" ") : null,
    doi,
    arxiv_id: null,
    publication_year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    publisher: work.primary_location?.source?.host_organization_name ?? null,
    landing_url: work.primary_location?.landing_page_url ?? `https://doi.org/${doi}`,
    pdf_url: work.best_oa_location?.pdf_url ?? work.primary_location?.pdf_url ?? null,
    metadata_source: "openalex",
  };
}

export async function lookupPaper(identifier: string): Promise<PaperMetadata> {
  const id = classifyIdentifier(identifier);
  if (id.kind === "arxiv") {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.value)}`, {
      headers: { "User-Agent": userAgent() },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    }).catch(() => null);
    if (!res || !res.ok) throw new ApiError(502, "metadata_unavailable", "arXiv could not be reached; try again shortly");
    return parseArxivAtom(await res.text(), id.value);
  }
  const mail = process.env.CROSSREF_MAILTO ? `?mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO)}` : "";
  const cr = await getJson(`https://api.crossref.org/works/${encodeURIComponent(id.value)}${mail}`).catch(() => null);
  if (cr && cr.status === 200) return parseCrossref((cr.body as { message: CrossrefWork }).message, id.value);
  const key = process.env.OPENALEX_API_KEY ? `?api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : "";
  const oa = await getJson(`https://api.openalex.org/works/https://doi.org/${id.value}${key}`).catch(() => null);
  if (oa && oa.status === 200) return parseOpenAlex(oa.body as OpenAlexWork, id.value);
  if ((cr && cr.status === 404) || (oa && oa.status === 404)) throw new ApiError(404, "paper_not_found", `No metadata found for DOI ${id.value}`);
  throw new ApiError(502, "metadata_unavailable", "Crossref and OpenAlex could not be reached; try again shortly");
}
