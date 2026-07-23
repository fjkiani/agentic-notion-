/**
 * Local embedding model: all-MiniLM-L6-v2 (384-dim) via @xenova/transformers.
 * CPU-only, no API key, ~90MB on disk, cached after first load.
 * Singleton pipeline — loaded lazily on first use.
 */

// @xenova/transformers is ESM-only; dynamic import keeps it out of the module graph until needed.
type FeatureExtractionPipeline = (
  texts: string | string[],
  opts?: { pooling?: "mean" | "cls" | "none"; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Cache models under a stable dir so redeploys don't re-download unnecessarily.
      // Render's disk is ephemeral but the model re-downloads in <2s on cold start.
      env.allowLocalModels = false;
      const extractor = (await pipeline(
        "feature-extraction",
        EMBEDDING_MODEL
      )) as unknown as FeatureExtractionPipeline;
      return extractor;
    })();
  }
  return pipelinePromise;
}

/**
 * Embed one or more texts. Returns an array of normalized 384-dim vectors.
 * Mean-pooled + L2-normalized so cosine similarity == dot product.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getPipeline();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const n = out.dims[0] ?? 0;
  const dim = out.dims[1] ?? 0;
  if (dim !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dim ${dim}, expected ${EMBEDDING_DIM}`);
  }
  const vectors: number[][] = [];
  for (let i = 0; i < n; i++) {
    vectors.push(Array.from(out.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

/** Embed a single query string → one 384-dim vector. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw new Error("Embedding produced no vector");
  return vec;
}

/** Warm the model at startup so the first user request isn't slow. */
export async function warmEmbeddings(): Promise<void> {
  try {
    await embedQuery("warmup");
  } catch {
    // non-fatal; will retry on first real use
  }
}
