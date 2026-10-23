import { StateGraph, START, END } from '@langchain/langgraph'
import { BaseMessage, SystemMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { findPrecedent, isGoodLaw } from '../mcp/servers/mcp-tx-case-law';
import { formatCitation } from '../mcp/servers/mcp-bluebook-sanitizer';

/**
 * Node instructions (UPL review 2026-10-23, E9/rec 12): the drafting
 * personas — "Senior Texas Appellate Attorney", CREAC writ formatter,
 * clemency advocate — are gone from the product tree. Every node DESCRIBES
 * what the record shows, by volume, page and line; none advises, concludes
 * about anyone's rights, predicts what a court would do, or addresses a
 * family.
 */
const DESCRIBE_RULE =
  'Describe only what the court record shows, citing volume, page and line with the verbatim excerpt. ' +
  'Never advise, never conclude about anyone\'s rights, never predict what a lawyer or court would do, and never address the family.';
const NODE_INSTRUCTIONS = {
  counsel_conduct: `Read the transcript for what it shows about defense counsel's actions and omissions: objections made or not made, witnesses contacted or not, motions filed or not. ${DESCRIBE_RULE}`,
  disclosure: `Read the transcript for testimony about material the State held and whether the record shows it was produced to the defense. ${DESCRIBE_RULE}`,
  record_summary: `Arrange the passages already found into a plain list by record location, each with its verbatim excerpt and the doctrine category it was found under. Add nothing that is not in the record. ${DESCRIBE_RULE}`,
} as const;

export interface AgentState {
  messages: BaseMessage[]
  next?: string
  findings?: any[]
  citations?: string[]
}

export class LangGraphOrchestrator {
  private llm: ChatGoogleGenerativeAI;

  constructor() {
    this.llm = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      temperature: 0,
    });
  }

  private async iacAuditorNode(state: AgentState) {
    console.log("[LangGraph] IAC Auditor Node active");
    const tools = [findPrecedent, isGoodLaw];
    const modelWithTools = this.llm.bindTools(tools);
    
    const messages = [
      new SystemMessage(NODE_INSTRUCTIONS.counsel_conduct),
      ...state.messages
    ];
    
    const response = await modelWithTools.invoke(messages);
    return { messages: [response], next: 'bradyAuditor' };
  }

  private async bradyAuditorNode(state: AgentState) {
    console.log("[LangGraph] Brady Auditor Node active");
    // Brady Auditor primarily diffs text (Transcript vs Pre-Trial Disclosure).
    // In a full implementation, it would use an MCP tool to fetch the disclosure log.
    const messages = [
      new SystemMessage(NODE_INSTRUCTIONS.disclosure),
      ...state.messages
    ];
    
    const response = await this.llm.invoke(messages);
    return { messages: [response], next: 'writFormatter' };
  }

  private async writFormatterNode(state: AgentState) {
    console.log("[LangGraph] Writ Formatter Node active");
    const tools = [formatCitation];
    const modelWithTools = this.llm.bindTools(tools);
    
    const messages = [
      new SystemMessage(NODE_INSTRUCTIONS.record_summary),
      ...state.messages
    ];
    
    const response = await modelWithTools.invoke(messages);
    return { messages: [response], next: END };
  }

  public createGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => [],
        },
        next: {
          value: (x?: string, y?: string) => y ?? x,
          default: () => undefined,
        },
        findings: {
          value: (x?: any[], y?: any[]) => y ?? x,
          default: () => [],
        },
        citations: {
          value: (x?: string[], y?: string[]) => y ?? x,
          default: () => [],
        },
      },
    })

    // Chained so the builder's node-name generic accumulates the literal types
    // (separate statements leave it at "__start__" and every edge fails to type).
    return workflow
      .addNode('iacAuditor', this.iacAuditorNode.bind(this))
      .addNode('bradyAuditor', this.bradyAuditorNode.bind(this))
      .addNode('writFormatter', this.writFormatterNode.bind(this))
      .addEdge(START, 'iacAuditor')
      .addEdge('iacAuditor', 'bradyAuditor')
      .addEdge('bradyAuditor', 'writFormatter')
      .addEdge('writFormatter', END)
  }
}
