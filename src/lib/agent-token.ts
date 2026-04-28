import { createHmac } from "crypto";

export function deriveAgentToken(serviceKey: string): string {
  return createHmac("sha256", serviceKey).update("dpma-agent-v1").digest("hex").slice(0, 40);
}
