import { Checkpoint, BaseCheckpointSaver, CheckpointMetadata } from '@langchain/langgraph'
import { prisma } from '@hg/database'

export class PostgresCheckpointSaver extends BaseCheckpointSaver {
  async getTuple(config: any) {
    const threadId = config.configurable.thread_id
    const checkpointId = config.configurable.checkpoint_id

    const record = await prisma.$queryRawUnsafe<any[]>(
      `SELECT checkpoint FROM "GraphState" WHERE thread_id = $1 ${checkpointId ? 'AND checkpoint_id = $2' : ''} ORDER BY created_at DESC LIMIT 1`,
      threadId,
      ...(checkpointId ? [checkpointId] : [])
    )

    if (record.length === 0) return undefined

    return {
      config,
      checkpoint: JSON.parse(record[0].checkpoint),
      metadata: {},
    }
  }

  async list(config: any, limit?: number, before?: string) {
    // Implementation for listing checkpoints
    return []
  }

  async put(config: any, checkpoint: Checkpoint, metadata: CheckpointMetadata) {
    const threadId = config.configurable.thread_id
    const checkpointId = checkpoint.id

    await prisma.$executeRawUnsafe(
      `INSERT INTO "GraphState" (thread_id, checkpoint_id, checkpoint, metadata) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id, checkpoint_id) DO UPDATE SET checkpoint = $3`,
      threadId,
      checkpointId,
      JSON.stringify(checkpoint),
      JSON.stringify(metadata)
    )

    return config
  }
}
