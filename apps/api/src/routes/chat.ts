import { FastifyInstance } from 'fastify';

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.get('/ws/chat', { websocket: true }, (connection, req) => {
    connection.socket.on('message', async message => {
      console.log(`[WebSocket] Received query: ${message}`);
      
      // Send immediate acknowledgment to UI
      connection.socket.send(JSON.stringify({ type: 'status', text: 'Analyzing transcript...' }));
      
      // Simulate LangGraph tool execution status streaming
      setTimeout(() => {
        connection.socket.send(JSON.stringify({ type: 'status', text: 'Executing mcp-tx-case-law...' }));
      }, 1000);
      
      // Simulate Final Agent Response
      setTimeout(() => {
        connection.socket.send(JSON.stringify({ 
          type: 'message', 
          text: 'I found **Ex parte Smith**, 123 S.W.3d 456 (Tex. Crim. App. 2004), which supports an Ineffective Assistance of Counsel (IAC) claim regarding the hearsay objection on Line 12.' 
        }));
      }, 2500);
    });
  });
}
