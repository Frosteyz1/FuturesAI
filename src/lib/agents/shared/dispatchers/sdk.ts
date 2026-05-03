/**
 * SdkDispatcher — direct Anthropic API calls.
 *
 * Used for production deploy (Vercel runtime). Requires ANTHROPIC_API_KEY.
 * NOT used during local dev/test/backtest — those use FileQueueDispatcher
 * driven by Claude Code Task tool to run within Max plan tokens, no API spend.
 */

import { getAnthropic, MODELS } from '@/lib/anthropic/client';
import type { AgentDispatcher, DispatchRequest, DispatchResponse } from './types';
import { DispatchError } from './types';

export class SdkDispatcher implements AgentDispatcher {
  async dispatch(req: DispatchRequest): Promise<DispatchResponse> {
    if (req.image.kind !== 'base64') {
      throw new DispatchError(
        `SdkDispatcher requires base64 image data, got kind=${req.image.kind}`,
      );
    }

    const client = getAnthropic();
    const model = MODELS[req.tier];

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: [
          {
            type: 'text',
            text: req.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: req.image.mimeType,
                  data: req.image.data,
                },
              },
              { type: 'text', text: req.userInstruction },
            ],
          },
        ],
      });
    } catch (err) {
      throw new DispatchError(
        `Anthropic SDK call failed: ${(err as Error).message}`,
        err,
      );
    }

    const textBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
    );
    const rawText = textBlocks.map((b) => b.text).join('\n');

    return {
      requestId: req.requestId,
      rawText,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cachedTokens: response.usage?.cache_read_input_tokens ?? undefined,
      },
    };
  }
}
