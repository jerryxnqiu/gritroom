// OpenAI-compatible DeepSeek API: https://api-docs.deepseek.com/
// Reserved for the learner practice assistant chat (not shelf material analysis).
// Coaching/study materials are reviewed with Codex and saved back via the shelf.
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

type ChatOptions = {
  model?: DeepseekModel;
  temperature?: number;
  maxTokens?: number;
  jsonObject?: boolean;
};

export async function deepseekChat(
  apiKey: string,
  messages: DeepseekMessage[],
  options?: ChatOptions,
) {
  const model = options?.model ?? DEEPSEEK_MODEL;
  const maxTokens = options?.maxTokens ?? 8192;
  const first = await requestChat(apiKey, messages, {
    model,
    temperature: options?.temperature ?? 0.2,
    maxTokens,
    jsonObject: options?.jsonObject ?? true,
  });
  if (first.ok) return first;

  // Empty/length cutoffs happen on vision PDFs; retry once with plain JSON and a higher cap.
  if (first.empty) {
    console.error("deepseek.empty_retry", { model, detail: first.error });
    return requestChat(apiKey, [
      ...messages,
      {
        role: "user",
        content: "Reply with one JSON object only. No markdown fences. Keep each field concise.",
      },
    ], {
      model,
      temperature: options?.temperature ?? 0.2,
      maxTokens: Math.max(maxTokens, 12288),
      jsonObject: false,
    });
  }

  return first;
}

async function requestChat(
  apiKey: string,
  messages: DeepseekMessage[],
  options: Required<Pick<ChatOptions, "model" | "temperature" | "maxTokens" | "jsonObject">>,
) {
  const { model } = options;
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
        stream: false,
      }),
    });
  } catch {
    return { ok: false as const, empty: false, error: "Could not reach the AI service. Try again shortly.", model };
  }

  if (!response.ok) {
    const detail = await readApiError(response);
    console.error("deepseek.chat_failed", { status: response.status, model, detail });
    return { ok: false as const, empty: false, error: publicApiError(response.status, detail), model };
  }

  const payload = await response.json() as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; refusal?: string | null };
    }>;
  };
  const choice = payload.choices?.[0];
  const content = unwrapJsonContent(choice?.message?.content ?? undefined);
  if (content) return { ok: true as const, content, model };

  const refusal = choice?.message?.refusal?.trim();
  const finish = choice?.finish_reason || "unknown";
  console.error("deepseek.empty_content", { model, finish, refusal: refusal?.slice(0, 160) || null });
  if (refusal) {
    return { ok: false as const, empty: true, error: `The AI service refused the analysis: ${refusal.slice(0, 200)}`, model };
  }
  return {
    ok: false as const,
    empty: true,
    error: `The AI service returned an empty analysis (${finish}). Try again with fewer PDF pages or add short notes.`,
    model,
  };
}

function unwrapJsonContent(raw: string | null | undefined) {
  const text = raw?.trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || text;
}

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } | string; message?: string };
    if (typeof body.error === "string") return body.error.slice(0, 240);
    if (body.error && typeof body.error === "object" && typeof body.error.message === "string") {
      return body.error.message.slice(0, 240);
    }
    if (typeof body.message === "string") return body.message.slice(0, 240);
  } catch {
    /* ignore */
  }
  return "";
}

function publicApiError(status: number, detail: string) {
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403 || lower.includes("authentication") || lower.includes("api key")) {
    return "DeepSeek rejected the API key. Check the Worker secret deepseek-api-key.";
  }
  if (status === 413 || lower.includes("too large") || lower.includes("request body") || lower.includes("payload")) {
    return "The page images were too large for analysis. Try fewer pages or a smaller PDF.";
  }
  if (status === 429 || lower.includes("rate")) {
    return "The AI service is rate-limited right now. Try again in a minute.";
  }
  if (detail) return `The AI service could not analyse this resource (${status}): ${detail}`;
  return "The AI service could not analyse this resource. Try again shortly.";
}
