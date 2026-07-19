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
  }
  // Bucket stays private — object bytes are private page data and must only be
  // reachable through the API's /api/files/:id/content route, which checks
  // page/workspace permission (or public-page status) before streaming them.
  // Do not set a public bucket policy here.
}

export function fileUrl(fileId: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  return `${base}/api/files/${fileId}/content`
}
