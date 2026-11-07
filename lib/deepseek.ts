// OpenAI-compatible DeepSeek API: https://api-docs.deepseek.com/
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_CHAT_URL = `${DEEPSEEK_BASE_URL}/chat/completions`;

/** Fast default for everyday analysis. Served by DeepSeek-V4.1-Flash (vision capable). */
export const DEEPSEEK_FLASH = "deepseek-flash";
/** Stronger model for harder generation / review work. */
export const DEEPSEEK_PRO = "deepseek-v4-pro";

export const DEEPSEEK_MODEL = DEEPSEEK_FLASH;

export type DeepseekModel = typeof DEEPSEEK_FLASH | typeof DEEPSEEK_PRO;
export type DeepseekContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "original" | "auto" } };
export type DeepseekMessage = {
  role: "system" | "user" | "assistant";
  content: string | DeepseekContentPart[];
};

export async function deepseekChat(
  apiKey: string,
  messages: DeepseekMessage[],
  options?: { model?: DeepseekModel; temperature?: number; maxTokens?: number },
) {
  const model = options?.model ?? DEEPSEEK_MODEL;
  const response = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 1800,
      response_format: { type: "json_object" },
      stream: false,
    }),
  });

  if (!response.ok) {
    return { ok: false as const, error: "The AI service could not analyse this resource. Try again shortly.", model };
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return { ok: false as const, error: "The AI service returned an empty analysis.", model };
  return { ok: true as const, content, model };
}
