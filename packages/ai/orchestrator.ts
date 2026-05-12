import { StateGraph, END } from '@langchain/langgraph'
import { BaseMessage, SystemMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { findPrecedent, isGoodLaw } from '../mcp/servers/mcp-tx-case-law';
import { formatCitation } from '../mcp/servers/mcp-bluebook-sanitizer';
import { AgentPersonas } from './personas';

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
      modelName: "gemini-1.5-pro",
      temperature: 0,
    });
  }

  private async iacAuditorNode(state: AgentState) {
    console.log("[LangGraph] IAC Auditor Node active");
    const tools = [findPrecedent, isGoodLaw];
    const modelWithTools = this.llm.bindTools(tools);
    
    const messages = [
      new SystemMessage(AgentPersonas.iac_specialist.systemPrompt),
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
      new SystemMessage(AgentPersonas.brady_auditor.systemPrompt),
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
      new SystemMessage(AgentPersonas.writ_formatter.systemPrompt),
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

    workflow.addNode('iacAuditor', this.iacAuditorNode.bind(this))
    workflow.addNode('bradyAuditor', this.bradyAuditorNode.bind(this))
    workflow.addNode('writFormatter', this.writFormatterNode.bind(this))

    workflow.setEntryPoint('iacAuditor')
    workflow.addEdge('iacAuditor', 'bradyAuditor')
    workflow.addEdge('bradyAuditor', 'writFormatter')
    workflow.addEdge('writFormatter', END)

    return workflow
  }
}
