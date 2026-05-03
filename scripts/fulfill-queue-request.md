# Smoke test runner — Claude Code session protocol

When the smoke test script (`scripts/run-smoke-test.ts`) is running and waiting
on `.queue/requests/{id}.json` files, Claude Code (in a session) fulfills the
queue by:

## Step-by-step

1. **List pending requests**: `Glob .queue/requests/*.json` — pick the oldest.
2. **Read the request file**: parse the JSON. It contains:
   - `requestId` (use as filename for response)
   - `agentId` (e.g., "00a", "02", "26_da")
   - `tier` ("haiku" | "sonnet" | "opus")
   - `systemPrompt` (the agent's system prompt)
   - `image: { mimeType, path }` — path points to a real PNG on disk
   - `userInstruction`
   - `maxTokens`
3. **Dispatch via Task tool**:
   - `subagent_type: "general-purpose"` (default)
   - `description: "Agent {agentId} dispatch"`
   - Prompt the sub-agent with: the systemPrompt as instructions, then read the
     image at `image.path`, then run the agent's task per the prompt, output
     JSON only.
4. **Capture sub-agent's JSON output** as `rawText`.
5. **Write response file**: `.queue/responses/{requestId}.json` with:
   ```json
   {
     "requestId": "<same as request>",
     "rawText": "<sub-agent's JSON output as a string>",
     "usage": { "inputTokens": ..., "outputTokens": ..., "cachedTokens": 0 }
   }
   ```
6. **Repeat** until no pending requests AND the smoke test script has exited.

## Parallelism

The smoke test makes some dispatches in parallel batches:
- Wave 0 (00a, then 00b+00c+38 simultaneously) → up to 4 concurrent
- Wave A+B+C+D → ~24 concurrent

Claude Code can fan out multiple Task tool invocations in a single message
to mirror the parallelism. Otherwise serial fulfillment also works (slower).

## Sub-agent prompt template

For each dispatch, the sub-agent prompt should be approximately:

```
You are AI-Vision Trading Copilot Agent {agentId}.

Read the chart image at {image.path}.

System instructions:
{systemPrompt}

User request:
{userInstruction}

Output JSON only — no prose, no markdown fences. Match the schema described
in your system instructions exactly.
```

Token budget for the Task agent: maxTokens + ~500 buffer.
