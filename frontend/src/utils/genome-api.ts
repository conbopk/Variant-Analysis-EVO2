import {env} from "~/env";

export interface GenomeAssemblyFromSearch {
  id: string;
  name: string;
  sourceName: string;
  active: boolean;
}

export interface ChromosomeFromSearch {
  name: string;
  size: number | undefined;
}

export interface GeneFromSearch {
  symbol: string;
  name: string;
  chrom: string;
  description: string;
  gene_id?: string;
}

export interface GeneDetailsFromSearch {
  genomicInfo?: {
    chrStart: number;
    chrStop: number;
    strand?: string;
  }[];
  summary?: string;
  organism?: {
    scientificname: string;
    commonname: string;
  };
}

export interface GeneBounds {
  min: number;
  max: number;
}

export interface ClinvarVariant {
  clinvar_id: string;
  title: string;
  variation_type: string;
  classification: string;
  gene_sort: string;
  chromosome: string;
  location: string;
  evo2Result?: {
    prediction: string;
    delta_score: number;
    classification_confidence: number;
    reference: string;
  };
  isAnalyzing?: boolean;
  evo2Error?: string;
}

export interface AnalysisResult {
  position: number;
  reference: string;
  alternative: string;
  delta_score: number;
  prediction: string;
  classification_confidence: number;
}


// Type definition for API response
interface UCSCGenomeInfo {
  description?: string;
  sourceName?: string;
  active?: string;
  organism?: string;
}

interface UCSCGenomesResponse {
  ucscGenomes?: Record<string, UCSCGenomeInfo>;
}

interface UCSCChromosomesResponse {
  chromosomes?: Record<string, number>
}

interface NCBISearchResponse {
  0: number;
  1: string[];
  2: Record<string, number>;
  3: unknown[][];
}

interface NCBIGeneDetailResponse {
  result?: Record<string, {
    genomicinfo?: Array<{
      chrstart: number;
      chrstop: number;
      strand?: string;
    }>;
    summary?: string;
    organism?: {
      scientificname: string;
      commonname: string;
    };
  }>;
}

interface UCSCSequenceResponse {
  dna?: string;
  error?: string;
}

interface ClinvarSearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface ClinvarSummaryResponse {
  result?: {
    uids?: string[];
  } & Record<string, {
    title?: string;
    obj_type?: string;
    germline_classification?: {
      description?: string;
    };
    gene_sort?: string;
    location_sort?: string;
  }>;
}

export async function getAvailableGenomes() {
  const apiUrl = "https://api.genome.ucsc.edu/list/ucscGenomes";
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch genome list from UCSC API");
  }

  const genomeData = await response.json() as UCSCGenomesResponse;
  if (!genomeData.ucscGenomes) {
    throw new Error("UCSC API error: missing ucscGenomes");
  }

  const genomes = genomeData.ucscGenomes;
  const structuredGenomes: Record<string, GenomeAssemblyFromSearch[]> = {};

  for (const genomeId in genomes) {
    const genomeInfo = genomes[genomeId];
    const organism = genomeInfo?.organism ?? "Other";

    structuredGenomes[organism] ??= [];
    structuredGenomes[organism].push({
      id: genomeId,
      name: genomeInfo?.description ?? genomeId,
      sourceName: genomeInfo?.sourceName ?? genomeId,
      active: !!genomeInfo?.active,
    });
  }

  return { genomes: structuredGenomes };
}


export async function getGenomeChromosomes(genomeId: string) {
  const apiUrl = `https://api.genome.ucsc.edu/list/chromosomes?genome=${genomeId}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch chromosome list from UCSC API");
  }

  const chromosomesData = await response.json() as UCSCChromosomesResponse;
  if (!chromosomesData.chromosomes) {
    throw new Error("UCSC API error: missing chromosomes");
  }

  const chromosomes: ChromosomeFromSearch[] = [];
  for (const chromId in chromosomesData.chromosomes) {
    if (chromId.includes("_") || chromId.includes("Un") || chromId.includes("random")) continue;

    const size = chromosomesData.chromosomes[chromId];
    chromosomes.push({
      name: chromId,
      size,
    });
  }

  // chr1, chr2,..., chrX, chrY
  chromosomes.sort((a, b) => {
    const anum = a.name.replace("chr", "");
    const bnum = b.name.replace("chr", "");
    const isNumA = /^\d+$/.test(anum);
    const isNumB = /^\d+$/.test(bnum);
    if (isNumA && isNumB) return Number(anum) - Number(bnum);
    if (isNumA) return -1;
    if (isNumB) return 1;
    return anum.localeCompare(bnum);
  })

  return { chromosomes }
}

export async function searchGenes(query: string, genome: string) {
  const url = 'https://clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search';
  const params = new URLSearchParams({
    terms: query,
    df: "chromosome,Symbol,description,map_location,type_of_gene,GenomicInfo,GeneID",
    ef: "chromosome,Symbol,description,map_location,type_of_gene,GenomicInfo,GeneID",
  });

  const response = await fetch(`${url}?${params}`);
  if (!response.ok) {
    throw new Error("NCBI API error");
  }

  const data = await response.json() as NCBISearchResponse;
  const results: GeneFromSearch[] = [];

  // console.log('🔍 NCBI Response structure:', {
  //   isArray: Array.isArray(data),
  //   length: data?.length,
  //   totalCount: data?.[0],
  //   fieldMap: data?.[2] ? Object.keys(data[2]) : 'N/A',
  //   recordsCount: data?.[3]?.length || 0,
  //   firstRecord: data?.[3]?.[0]
  // });

  if (data[0] > 0) {
    const maxResults = Math.min(30, data[0]);
    const records = data[3];

    for (let i = 0; i < maxResults; ++i) {
      if (i < records.length) {
        try {
          const display = records[i];
          if (!Array.isArray(display) || display.length < 7) continue;

          let chrom = display[0] as string;
          if (chrom && !chrom.startsWith("chr")) {
            chrom = `chr${chrom}`;
          }

          const symbol = display[1] as string;
          const name = display[2] as string;
          const mapLocation = display[3] as string;
          const geneId = display[6] as string;

          results.push({
            symbol,
            name,
            chrom,
            description: `${name} (${mapLocation})`,
            gene_id: geneId ?? "",
          })
        } catch {
          continue;
        }
      }
    }
  }

  return { query, genome, results };
}

export async function fetchGeneDetails(geneId: string): Promise<{
  geneDetails: GeneDetailsFromSearch | null;
  geneBounds: GeneBounds | null;
  initialRange: { start: number; end: number } | null;
}> {
  try {
    const detailUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
    const detailsResponse = await fetch(detailUrl);

    if (!detailsResponse.ok) {
      console.error(`Failed to fetch gene details: ${detailsResponse.statusText}`);
      return { geneDetails: null, geneBounds: null, initialRange: null };
    }

    const detailData = await detailsResponse.json() as NCBIGeneDetailResponse;

    if (detailData.result?.[geneId]) {
      const detail = detailData.result[geneId];

      if (detail.genomicinfo && detail.genomicinfo.length > 0) {
        const info = detail.genomicinfo[0];
        if (typeof info?.chrstart === 'number' && typeof info.chrstop === 'number') {
          const minPos = Math.min(info.chrstart, info.chrstop);
          const maxPos = Math.max(info.chrstart, info.chrstop);
          const bounds = { min: minPos, max: maxPos };

          const genSize = maxPos - minPos;
          const seqStart = minPos;
          const seqEnd = genSize > 10000 ? minPos + 10000 : maxPos;
          const range = { start: seqStart, end: seqEnd };

          return { geneDetails: detail, geneBounds: bounds, initialRange: range }
        }
      }
    }

    return { geneDetails: null, geneBounds: null, initialRange: null };
  } catch (e) {
    return { geneDetails: null, geneBounds: null, initialRange: null };
  }
}

export async function fetchGeneSequence(
    chrom: string,
    start: number,
    end: number,
    genomeId: string,
): Promise<{
  sequence: string;
  actualRange: {start: number, end: number};
  error?: string;
}> {
  try {
    const chromosome = chrom.startsWith("chr") ? chrom : `chr${chrom}`;

    const apiStart = start - 1;     // -> 0-base
    const apiEnd = end;

    const apiUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${genomeId};chrom=${chromosome};start=${apiStart};end=${apiEnd}`;
    const response = await fetch(apiUrl);
    const data = await response.json() as UCSCSequenceResponse;

    const actualRange = { start, end };

    if (data.error || !data.dna) {
      return { sequence: "", actualRange, error: data.error };
    }

    const sequence = data.dna.toUpperCase();

    return { sequence, actualRange };
  } catch (e) {
    return {
      sequence: "",
      actualRange: {start, end},
      error: "Internal error in fetch gene sequence",
    };
  }
}


export async function fetchClinvarVariants(
    chrom: string,
    geneBound: GeneBounds,
    genomeId: string
): Promise<ClinvarVariant[]> {
  const chromFormatted = chrom.replace(/^chr/i, "");

  const minBound = Math.min(geneBound.min, geneBound.max);
  const maxBound = Math.max(geneBound.min, geneBound.max);

  const positionField = genomeId === "hg19" ? "chrpos37" : "chrpos38";
  const searchTerm = `${chromFormatted}[chromosome] AND ${minBound}:${maxBound}[${positionField}]`;

  const searchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
  const searchParams = new URLSearchParams({
    db: "clinvar",
    term: searchTerm,
    retmode: "json",
    retmax: "20",
  });

  const searchResponse = await fetch(`${searchUrl}?${searchParams.toString()}`);

  if (!searchResponse.ok) {
    throw new Error("Clinvar search failed: " + searchResponse.statusText);
  }

  const searchData = await searchResponse.json() as ClinvarSearchResponse;

  if (!searchData.esearchresult?.idlist || searchData.esearchresult.idlist.length === 0) {
    console.log("No ClinVar variants found");
    return [];
  }

  const variantIds = searchData.esearchresult.idlist;

  const summaryUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
  const summaryParams = new URLSearchParams({
    db: "clinvar",
    id: variantIds.join(","),
    retmode: "json",
  });

  const summaryResponse = await fetch(`${summaryUrl}?${summaryParams.toString()}`);

  if (!summaryResponse.ok) {
    throw new Error("Failed to fetch variant details: " + summaryResponse.statusText);
  }

  const summaryData = await summaryResponse.json() as ClinvarSummaryResponse;
  const variants: ClinvarVariant[] = [];

  if (summaryData.result?.uids) {
    for (const id of summaryData.result.uids) {
      const variant = summaryData.result[id];
      if (!variant) continue;

      const objType = variant.obj_type ?? "Unknown";
      const variationType = objType.split(" ")
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");

      const locationSort = variant.location_sort;
      const location = locationSort ? parseInt(locationSort).toLocaleString() : "Unknown";

      variants.push({
        clinvar_id: id,
        title: variant.title ?? "",
        variation_type: variationType,
        classification: variant.germline_classification?.description ?? "Unknown",
        gene_sort: variant.gene_sort ?? "",
        chromosome: chromFormatted,
        location,
      });
    }
  }

  return variants;
}

export async function analyzeVariantWithApi({
  position,
  alternative,
  genomeId,
  chromosome,
}: {
  position: number;
  alternative: string;
  genomeId: string;
  chromosome: string
}): Promise<AnalysisResult>{

  const url = env.NEXT_PUBLIC_ANALYZE_SINGLE_VARIANT_BASE_URL;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      variant_position: position,
      alternative: alternative,
      genome: genomeId,
      chromosome: chromosome,
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Failed to analyze variant " + errorText);
  }

  return await response.json() as AnalysisResult;
}

