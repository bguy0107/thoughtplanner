import { Client } from 'minio'

export const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'thoughtplanner',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'thoughtplanner-secret',
})

export const BUCKET = process.env.MINIO_BUCKET ?? 'thoughtplanner'

export async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET)
  if (!exists) {
    await minio.makeBucket(BUCKET)
    // Allow public read for file serving
    await minio.setBucketPolicy(
      BUCKET,
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET}/*`],
          },
        ],
      }),
    )
  }
}

export function fileUrl(storageKey: string) {
  const base = process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000'
  return `${base}/${BUCKET}/${storageKey}`
}
