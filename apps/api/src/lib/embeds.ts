import dns from 'node:dns/promises'
import net from 'node:net'

// Docker-network service names that must never be reachable through a
// user-supplied embed URL, on top of the private-IP ranges checked below.
const BLOCKED_HOSTNAMES = new Set(['localhost', 'postgres', 'redis', 'minio', 'api', 'web', 'caddy'])

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata endpoint
  return false
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip)
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    if (normalized === '::1' || normalized === '::') return true
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice(7))
    return false
  }
  return true // unrecognized format — fail closed
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) throw new Error('That host is not allowed')
  const addresses = await dns.lookup(hostname, { all: true })
  if (addresses.length === 0) throw new Error('Could not resolve host')
  if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error('That host is not allowed')
}

const MAX_BODY_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 6000
const USER_AGENT = 'Mozilla/5.0 (compatible; ThoughtPlannerBot/1.0; +embed-preview)'

async function safeFetch(
  url: string,
  redirectsLeft = 3,
): Promise<{ finalUrl: string; body: string; contentType: string }> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http/https URLs are supported')
  await assertPublicHost(parsed.hostname)

  const res = await fetch(parsed.toString(), {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' },
  })

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location')
    if (!location || redirectsLeft <= 0) throw new Error('Too many redirects')
    return safeFetch(new URL(location, parsed).toString(), redirectsLeft - 1)
  }

  if (!res.ok) throw new Error(`Request failed with status ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Empty response')

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new Error('Response too large')
    }
    chunks.push(value)
  }
  return { finalUrl: parsed.toString(), body: Buffer.concat(chunks).toString('utf-8'), contentType }
}

type VideoMatch = { provider: 'youtube' | 'vimeo'; embedUrl: string; oembedUrl: string }

function matchVideoProvider(url: URL): VideoMatch | null {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

  if (host === 'youtube.com' || host === 'youtu.be') {
    let videoId: string | null = null
    if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0]
    else if (url.pathname === '/watch') videoId = url.searchParams.get('v')
    else if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2]
    else if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2]

    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) return null
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      oembedUrl: `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const idMatch = url.pathname.match(/(\d{6,12})/)
    if (!idMatch) return null
    const videoId = idMatch[1]
    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      oembedUrl: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`,
    }
  }

  return null
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
}

function metaContent(html: string, attr: 'property' | 'name', key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (match) return decodeEntities(match[1])
  }
  return null
}

function extractOpenGraph(html: string) {
  const title = metaContent(html, 'property', 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null
  const description = metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description')
  const image = metaContent(html, 'property', 'og:image')
  const siteName = metaContent(html, 'property', 'og:site_name')
  return {
    title: title ? decodeEntities(title).slice(0, 300) : null,
    description: description ? description.slice(0, 500) : null,
    image,
    siteName,
  }
}

function resolveImageUrl(maybeRelative: string, base: string): string | null {
  try {
    const resolved = new URL(maybeRelative, base)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null
  } catch {
    return null
  }
}

export type EmbedMetadata = {
  url: string
  embedType: 'video' | 'link'
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  embedUrl: string | null
  provider: string | null
}

export async function resolveEmbed(rawUrl: string): Promise<EmbedMetadata> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http/https URLs are supported')

  const video = matchVideoProvider(parsed)
  if (video) {
    try {
      const { body } = await safeFetch(video.oembedUrl)
      const data = JSON.parse(body)
      return {
        url: parsed.toString(),
        embedType: 'video',
        title: typeof data.title === 'string' ? data.title : null,
        description: null,
        image: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
        siteName: typeof data.provider_name === 'string' ? data.provider_name : video.provider,
        embedUrl: video.embedUrl,
        provider: video.provider,
      }
    } catch {
      // oEmbed lookup can fail (private/deleted video, provider rate limit) — the
      // player itself still works, so embed it without the extra title/thumbnail.
      return {
        url: parsed.toString(),
        embedType: 'video',
        title: null,
        description: null,
        image: null,
        siteName: video.provider,
        embedUrl: video.embedUrl,
        provider: video.provider,
      }
    }
  }

  const { body, contentType, finalUrl } = await safeFetch(parsed.toString())
  if (!contentType.includes('text/html')) throw new Error('That link does not point to a web page')

  const meta = extractOpenGraph(body)
  return {
    url: finalUrl,
    embedType: 'link',
    title: meta.title,
    description: meta.description,
    image: meta.image ? resolveImageUrl(meta.image, finalUrl) : null,
    siteName: meta.siteName,
    embedUrl: null,
    provider: null,
  }
}
