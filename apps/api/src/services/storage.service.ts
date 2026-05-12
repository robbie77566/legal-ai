import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy',
  },
  endpoint: process.env.S3_ENDPOINT, // For MinIO or localstack
})

export class StorageService {
  static async getUploadUrl(bucket: string, key: string, expiresIn = 3600) {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key })
    return await getSignedUrl(s3Client, command, { expiresIn })
  }
}
