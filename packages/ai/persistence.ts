import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from '@langchain/langgraph'
import type {
  CheckpointListOptions,
  ChannelVersions,
  PendingWrite,
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import { prisma } from '@hg/database'

export class PostgresCheckpointSaver extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id
    const checkpointId = config.configurable?.checkpoint_id

    const record = await prisma.$queryRawUnsafe<
      { checkpoint: string; metadata: string | null }[]
    >(
      `SELECT checkpoint, metadata FROM "GraphState" WHERE thread_id = $1 ${checkpointId ? 'AND checkpoint_id = $2' : ''} ORDER BY created_at DESC LIMIT 1`,
      threadId,
      ...(checkpointId ? [checkpointId] : [])
    )

    if (record.length === 0) return undefined

    return {
      config,
      checkpoint: JSON.parse(record[0].checkpoint) as Checkpoint,
      metadata: record[0].metadata
        ? (JSON.parse(record[0].metadata) as CheckpointMetadata)
        : undefined,
    }
  }

  async *list(
    _config: RunnableConfig,
    _options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    // Checkpoint history listing lands with the M4 supervisor-graph rebuild.
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id
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

  async putWrites(
    _config: RunnableConfig,
    _writes: PendingWrite[],
    _taskId: string
  ): Promise<void> {
    // Intermediate pending writes are not persisted yet (M4 rebuild).
  }

  async deleteThread(threadId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "GraphState" WHERE thread_id = $1`,
      threadId
    )
  }
}
