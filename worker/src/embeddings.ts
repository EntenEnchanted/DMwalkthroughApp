import type { Env } from "./types.js";

const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const response = (await env.AI.run(EMBEDDING_MODEL, { text: texts })) as { data: number[][] };
  return response.data;
}

export async function embedOne(env: Env, text: string): Promise<number[]> {
  const [vector] = await embed(env, [text]);
  return vector;
}
