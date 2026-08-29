import { LangGraphOrchestrator } from '@hg/ai'
import { AgentPersonas } from '@hg/ai/personas'
import { HumanMessage } from '@langchain/core/messages'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function runDevCli() {
  console.log('🤖 Starting HabeasGraph Dev Agent (Codebase Architect)...')
  console.log('Type your question or request. Type "exit" to quit.\n')
  
  const orchestrator = new LangGraphOrchestrator()
  const graph = orchestrator.createGraph()
  const compiledGraph = graph.compile()
  
  const persona = AgentPersonas.codebase_architect

  const chatLoop = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        rl.close()
        return
      }

      console.log('Agent is thinking...')
      
      try {
        const initialState = {
          messages: [
            new HumanMessage({ content: `System: ${persona.systemPrompt}\n\nUser: ${input}` })
          ]
        }
        
        // In a real implementation, you would probably want to explicitly run the 'codebaseArchitect' node
        // or a graph specifically configured for development. For this CLI, we will run the main graph
        // and let the supervisor route to the 'codebaseArchitect' node if appropriate, or we can invoke it directly.
        // We'll invoke the graph with a thread_id for persistence if we added the checkpointer.
        const result = await compiledGraph.invoke(initialState, { configurable: { thread_id: "dev-cli-session" } })
        
        const messages = (result as { messages: Array<{ content: unknown }> }).messages
        const lastMessage = messages[messages.length - 1]
        console.log(`\n${persona.name}: ${lastMessage.content}\n`)
      } catch (error) {
        console.error('Error during execution:', error)
      }
      
      chatLoop()
    })
  }

  chatLoop()
}

runDevCli().catch(console.error)
