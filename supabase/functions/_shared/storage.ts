import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { S3Config, s3ConfigFromEnv, presign, getObject, putObject, deleteObject } from './s3.ts'

export type Backend = 's3' | 'supabase'

export function backend(): Backend {
  const b = (Deno.env.get('STORAGE_BACKEND') || 's3').toLowerCase()
  return b === 'supabase' ? 'supabase' : 's3'
}

export function bucketName(): string {
  return Deno.env.get('STORAGE_BUCKET') || 'references'
}

let _s3: S3Config | null = null
function s3(): S3Config {
  if (!_s3) _s3 = s3ConfigFromEnv()
  return _s3
}

let _sb: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false }
    })
  }
  return _sb
}

export async function signUpload(key: string): Promise<{ uploadUrl: string; method: string }> {
  if (backend() === 'supabase') {
    const { data, error } = await sb().storage.from(bucketName()).createSignedUploadUrl(key)
    if (error) throw new Error(error.message)
    return { uploadUrl: data!.signedUrl, method: 'PUT' }
  }
  return { uploadUrl: await presign(s3(), 'PUT', key, 3600), method: 'PUT' }
}

export async function signDownload(key: string, expires = 3600): Promise<string> {
  if (backend() === 'supabase') {
    const { data, error } = await sb().storage.from(bucketName()).createSignedUrl(key, expires)
    if (error) throw new Error(error.message)
    return data!.signedUrl
  }
  return await presign(s3(), 'GET', key, expires)
}

export async function downloadBytes(key: string): Promise<Uint8Array> {
  if (backend() === 'supabase') {
    const { data, error } = await sb().storage.from(bucketName()).download(key)
    if (error) throw new Error(error.message)
    return new Uint8Array(await data!.arrayBuffer())
  }
  return await getObject(s3(), key)
}

export async function uploadBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (backend() === 'supabase') {
    const { error } = await sb().storage.from(bucketName()).upload(key, body, { contentType, upsert: true })
    if (error) throw new Error(error.message)
    return
  }
  await putObject(s3(), key, body, contentType)
}

export async function removeObject(key: string): Promise<void> {
  if (backend() === 'supabase') {
    const { error } = await sb().storage.from(bucketName()).remove([key])
    if (error) throw new Error(error.message)
    return
  }
  await deleteObject(s3(), key)
}
