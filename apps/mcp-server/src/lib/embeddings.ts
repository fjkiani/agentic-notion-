/**
 * Local embedding model for query-side embedding in the MCP server.
 * Mirrors the agent-api embedder (all-MiniLM-L6-v2, 384-dim). Self-contained
 * so the MCP server does not depend on agent-api being reachable at runtime.
 */
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
      env.allowLocalModels = false;
      return (await pipeline(
        "feature-extraction",
        EMBEDDING_MODEL
      )) as unknown as FeatureExtractionPipeline;
    })();
  }
  return pipelinePromise;
}

export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const out = await extractor([text], { pooling: "mean", normalize: true });
  const dim = out.dims[1] ?? 0;
  if (dim !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dim ${dim}, expected ${EMBEDDING_DIM}`);
  }
  return Array.from(out.data.slice(0, EMBEDDING_DIM));
}
