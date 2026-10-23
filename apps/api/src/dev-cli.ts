import { LangGraphOrchestrator } from '@hg/ai'
import { HumanMessage } from '@langchain/core/messages'
import * as readline from 'readline'

/**
 * The dev helper's own instruction (UPL review 2026-10-23, rec 12: the
 * persona file is gone from the product tree; this is the one non-legal
 * role it carried, kept here where the CLI uses it).
 */
const DEV_HELPER = {
  name: 'Codebase helper',
  systemPrompt:
    'You help developers navigate this monorepo. Refer to docs/architecture/website_architecture.md before answering questions about state management or database design. ' +
    'If a developer asks how to implement a feature, check whether an existing service can be reused first.',
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function runDevCli() {
  console.log('Starting the dev helper...')
  console.log('Type your question or request. Type "exit" to quit.\n')
  
  const orchestrator = new LangGraphOrchestrator()
  const graph = orchestrator.createGraph()
  const compiledGraph = graph.compile()
  
  const persona = DEV_HELPER

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
