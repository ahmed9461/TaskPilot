export interface ReplyTarget {
  sessionId: string;
  groupId: string;
  externalMessageId: string;
  body: string;
  jobId: string;
  sourceMessageId?: string;
}
export class DefinitelyNotSent extends Error {}
export interface WhatsAppTransport {
  readonly provider: "mock" | "baileys";
  canSend?(sessionId: string): boolean;
  connect(sessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  listGroups(sessionId: string): Promise<unknown[]>;
  replyToMessage(target: ReplyTarget): Promise<{ providerMessageId: string }>;
  getSessionHealth(sessionId: string): Promise<string>;
}
// No live WhatsApp dependency, network code, pairing or credentials exist in this adapter.
export class MockTransport implements WhatsAppTransport {
  readonly provider = "mock";
  sent: ReplyTarget[] = [];
  async connect(_id: string) {}
  async disconnect(_id: string) {}
  async listGroups(_id: string) {
    return [];
  }
  async getSessionHealth(_id: string) {
    return "MOCK";
  }
  async replyToMessage(target: ReplyTarget) {
    this.sent.push(target);
    return { providerMessageId: `mock:${target.jobId}` };
  }
}
