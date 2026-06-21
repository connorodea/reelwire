/**
 * Best-effort extraction of a JSON object string from an LLM text response.
 * Tolerates raw JSON, markdown-fenced JSON, and JSON embedded in prose.
 * Throws when no balanced object can be found.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;

  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fence) return fence[1];

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  throw new Error(`Could not extract JSON from model response: ${trimmed.slice(0, 200)}`);
}
