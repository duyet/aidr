/**
 * The one AI-keyword list the pipeline uses to pre-filter high-volume feeds.
 *
 * It lives here (not in `hn.ts`) so the HN adapter and the generic `rss`
 * adapter's flood gate share a single definition: a second copy would drift
 * and the "arXiv is gated by the same rule as HN" claim in ALGORITHM.md
 * would quietly become false.
 *
 * This is a cheap title test, NOT the relevance judgment. The LLM scorer
 * still decides `relevance` and the `relevance < 0.4` hide rule is
 * unchanged — the filter only stops a firehose from reaching the scorer at
 * all, which is what keeps arXiv's daily volume inside the existing
 * score-batch budget.
 */
export const AI_KEYWORD_RE =
  /\b(ai|llms?|gpt|claude|gemini|openai|anthropic|deepseek|qwen|mistral|llama|grok|kimi|glm|olmo|phi|gemma|models?|language models?|foundation models?|open[- ]weights?|world models?|video models?|speech models?|voice models?|mixture of experts|ai labs?|research labs?|agents?|agentic|transformers?|neural|machine learning|nvidia|hugging ?face|cursor|copilot|codex|windsurf|openrouter|ollama|vllm|mcp|rag|diffusion|multimodal|vision.?language|reasoning|fine.?tun(?:e|es|ed|ing)?|benchmarks?|swe.?bench|arc.?agi|chatgpt|chatbots?|deepmind|perplexity|cohere|elevenlabs|midjourney|sora|nemotron|mimo|manus|black forest labs|meta muse|super ?intelligence|text.to.speech|dspy|langchain|langgraph|langsmith|crewai|autogen|mastra|pydantic ai|llamaindex|llama stack|semantic kernel|agents? sdk|ai sdk|workers ai|ai gateway|vector (?:databases?|db|search|stores?)|embeddings|embedding models?|mlops|llmops|lakehouse|feature stores?|pytorch|tensorflow|sglang|tensorrt|gguf)\b/i;

/** Named filter profiles a source row can opt into via `config.keywordFilter`. */
export const KEYWORD_FILTERS: Record<string, RegExp> = {
  ai: AI_KEYWORD_RE,
};

export function isAiRelatedTitle(title: string): boolean {
  return AI_KEYWORD_RE.test(title);
}
