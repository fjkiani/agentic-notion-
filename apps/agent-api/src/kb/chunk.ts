/**
 * Recursive character text splitter (LangChain-compatible behavior, no dependency).
 * Splits text on a hierarchy of separators, packing pieces into chunks of a
 * target character size with overlap. Approximate token budget: ~4 chars/token,
 * so ~800 tokens ≈ 3200 chars.
 */

export interface ChunkOptions {
  chunkSize?: number; // target chunk length in characters
  chunkOverlap?: number; // overlap in characters between consecutive chunks
  separators?: string[];
}

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""];

/** Rough token estimate for metadata (not exact; ~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitOnSeparator(text: string, sep: string): string[] {
  if (sep === "") return text.split("");
  // keep the separator attached to the preceding piece for readability
  const parts = text.split(sep);
  return parts.map((p, i) => (i < parts.length - 1 ? p + sep : p)).filter((p) => p.length > 0);
}

function recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize) return text.length ? [text] : [];
  const [sep = "", ...rest] = separators.length ? separators : [""];
  const pieces = splitOnSeparator(text, sep);

  const out: string[] = [];
  for (const piece of pieces) {
    if (piece.length <= chunkSize) {
      out.push(piece);
    } else if (rest.length) {
      out.push(...recursiveSplit(piece, rest, chunkSize));
    } else {
      // hard split as a last resort
      for (let i = 0; i < piece.length; i += chunkSize) {
        out.push(piece.slice(i, i + chunkSize));
      }
    }
  }
  return out;
}

/** Merge small pieces up to chunkSize, adding overlap between emitted chunks. */
function mergePieces(pieces: string[], chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const piece of pieces) {
    if (current.length + piece.length <= chunkSize || current.length === 0) {
      current += piece;
    } else {
      flush();
      // start next chunk with an overlap tail of the previous chunk
      const tail = overlap > 0 ? current.slice(Math.max(0, current.length - overlap)) : "";
      current = tail + piece;
    }
  }
  flush();
  return chunks;
}

export function splitText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = opts.chunkSize ?? 3200; // ~800 tokens
  const chunkOverlap = opts.chunkOverlap ?? 400; // ~100 tokens
  const separators = opts.separators ?? DEFAULT_SEPARATORS;

  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const pieces = recursiveSplit(clean, separators, chunkSize);
  return mergePieces(pieces, chunkSize, chunkOverlap);
}
