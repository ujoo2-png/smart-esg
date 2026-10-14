const enc = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data))
  return toHex(new Uint8Array(digest))
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return new Uint8Array(sig)
}

async function signingKey(secret: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  let k = await hmac(enc.encode('AWS4' + secret), dateStamp)
  k = await hmac(k, region)
  k = await hmac(k, service)
  k = await hmac(k, 'aws4_request')
  return k
}

function uriEncode(value: string, encodeSlash = true): string {
  let out = ''
  for (const ch of value) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch
    else if (ch === '/') out += encodeSlash ? '%2F' : '/'
    else out += '%' + Array.from(enc.encode(ch)).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')
  }
  return out
}

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export function s3ConfigFromEnv(): S3Config {
  const endpoint = Deno.env.get('S3_ENDPOINT') || ''
  const bucket = Deno.env.get('S3_BUCKET') || ''
  const accessKeyId = Deno.env.get('S3_ACCESS_KEY_ID') || ''
  const secretAccessKey = Deno.env.get('S3_SECRET_ACCESS_KEY') || ''
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 저장소 환경변수(S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)가 설정되지 않았습니다.')
  }
  return {
    endpoint,
    region: Deno.env.get('S3_REGION') || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: (Deno.env.get('S3_FORCE_PATH_STYLE') || 'true') !== 'false'
  }
}

function objectUrl(cfg: S3Config, key: string): { origin: string; path: string; host: string } {
  const base = new URL(cfg.endpoint)
  const path = uriEncode('/' + (cfg.forcePathStyle ? cfg.bucket + '/' : '') + key, false)
  const host = cfg.forcePathStyle ? base.host : `${cfg.bucket}.${base.host}`
  return { origin: base.origin, path, host }
}

export async function presign(cfg: S3Config, method: string, key: string, expires = 3600): Promise<string> {
  const { origin, path, host } = objectUrl(cfg, key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`

  const params = new URLSearchParams()
  params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  params.set('X-Amz-Credential', `${cfg.accessKeyId}/${credentialScope}`)
  params.set('X-Amz-Date', amzDate)
  params.set('X-Amz-Expires', String(expires))
  params.set('X-Amz-SignedHeaders', 'host')

  const canonicalQuery = Array.from(params.entries())
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const key2 = await signingKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3')
  const signature = toHex(await hmac(key2, stringToSign))

  return `${origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export async function putObject(cfg: S3Config, key: string, body: Uint8Array, contentType: string): Promise<void> {
  const { origin, path, host } = objectUrl(cfg, key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', body)))
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, `${dateStamp}/${cfg.region}/s3/aws4_request`, await sha256Hex(canonicalRequest)].join('\n')
  const signing = await signingKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3')
  const signature = toHex(await hmac(signing, stringToSign))

  const res = await fetch(`${origin}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${dateStamp}/${cfg.region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`
    },
    body
  })
  if (!res.ok) throw new Error(`S3 PUT 실패 (${res.status}): ${await res.text()}`)
}

export async function getObject(cfg: S3Config, key: string): Promise<Uint8Array> {
  const url = await presign(cfg, 'GET', key, 300)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`S3 GET 실패 (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function deleteObject(cfg: S3Config, key: string): Promise<void> {
  const { origin, path, host } = objectUrl(cfg, key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex('')
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['DELETE', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, `${dateStamp}/${cfg.region}/s3/aws4_request`, await sha256Hex(canonicalRequest)].join('\n')
  const signing = await signingKey(cfg.secretAccessKey, dateStamp, cfg.region, 's3')
  const signature = toHex(await hmac(signing, stringToSign))

  const res = await fetch(`${origin}${path}`, {
    method: 'DELETE',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${dateStamp}/${cfg.region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  })
  if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE 실패 (${res.status})`)
}
