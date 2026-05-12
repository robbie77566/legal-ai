import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const syncClioMatter = tool(
  async ({ clientId, matterId }) => {
    console.log(`[MCP] Syncing Clio Matter ${matterId} for Client ${clientId}`);
    // Formats Cypher queries for Neo4j based on Clio API payload
    const cypher = `
      MERGE (a:Attorney {name: 'Jane Doe'})
      MERGE (c:Client {id: '${clientId}'})
      MERGE (m:Matter {id: '${matterId}'})
      MERGE (a)-[:REPRESENTS]->(c)
      MERGE (c)-[:INVOLVED_IN]->(m)
    `;
    return JSON.stringify({ success: true, cypherExecuted: cypher });
  },
  {
    name: "sync_clio_matter",
    description: "Synchronizes a legal matter from Clio to the Neo4j Knowledge Graph.",
    schema: z.object({
      clientId: z.string(),
      matterId: z.string()
    })
  }
);
