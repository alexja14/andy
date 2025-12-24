<script setup>
import { onMounted, ref } from 'vue'
import ThreeBackground from './components/ThreeBackground.vue'

const CHANNEL_URL = 'https://www.youtube.com/@Adrian.Stefan7'
const CHANNEL_URL_ALT = 'https://youtube.com/@adrian.stefan7?si=KtXgV3FHllQqZNYb'

const INSTAGRAM_URL = 'https://www.instagram.com/adi_asz/'
const DISCORD_URL = 'https://discord.com/invite/9Z6ttGv9ac'
const TELEGRAM_URL = 'https://t.me/adisgaminghub'
const TIKTOK_URL = 'https://www.tiktok.com/@adi_asz?lang=ro-RO'

// Pentru “ultimele 3 videoclipuri” fără API key folosim RSS feed-ul YouTube.
// Varianta cea mai stabilă este cu `channel_id=UC...`.
const FEED_CANDIDATES = [
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCMp-eXBL537Jfpn7zxDJz7g',
  // fallback-uri (în caz că se schimbă handle-ul / feed-ul)
  'https://www.youtube.com/feeds/videos.xml?user=adrian.stefan7',
  'https://www.youtube.com/feeds/videos.xml?user=Adrian.Stefan7',
]

const HERO_VIDEO_ID = 'NT6Dghvanqw'
const HERO_VIDEO_URL = `https://www.youtube.com/watch?v=${HERO_VIDEO_ID}`

const heroVideo = ref({
  videoId: HERO_VIDEO_ID,
  title: 'YouTube video',
  href: HERO_VIDEO_URL,
  embedUrl: toEmbedUrl(HERO_VIDEO_ID),
})
const latestVideos = ref([])
const latestLoading = ref(true)
const latestError = ref('')

const showDoorIntro = ref(true)
const doorInteractive = ref(true)
const doorReduced = ref(false)
const doorSkip = ref(false)
const doorForceMotion = ref(false)
const doorIntroKey = ref(0)

let doorHideTimer
let doorPointerTimer

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function clearDoorTimers() {
  if (doorHideTimer) window.clearTimeout(doorHideTimer)
  if (doorPointerTimer) window.clearTimeout(doorPointerTimer)
  doorHideTimer = undefined
  doorPointerTimer = undefined
}

function skipDoorIntro() {
  clearDoorTimers()

  // Dacă utilizatorul apasă pe logo/overlay, rulăm "deschiderea" rapid (surpriza),
  // apoi ascundem overlay-ul după ce animația apucă să se vadă.
  // La click, forțăm motion chiar dacă OS-ul e pe reduce-motion.
  doorForceMotion.value = true
  if (doorReduced.value) doorReduced.value = false

  doorInteractive.value = false
  doorSkip.value = true

  // Forțăm remount ca să pornească animațiile 100% sigur (fără "nu se aprinde").
  doorIntroKey.value += 1

  // 1.85s = fade rapid + uși (1.35s) să se vadă complet.
  doorHideTimer = window.setTimeout(() => {
    showDoorIntro.value = false
  }, 1850)
}

function startDoorIntro() {
  clearDoorTimers()

  // Dacă utilizatorul are reduce-motion activ, păstrăm intro-ul scurt și fără animații.
  doorReduced.value = prefersReducedMotion()
  showDoorIntro.value = true
  doorInteractive.value = true
  doorSkip.value = false
  doorForceMotion.value = false

  // Ne asigurăm că animațiile pornesc curat la fiecare start.
  doorIntroKey.value += 1

  // Vrem surpriză: ține intro-ul pe ecran 5-6 secunde.
  const durationMs = doorReduced.value ? 1200 : 6000
  const disablePointerAfterMs = doorReduced.value ? 350 : 6000

  doorPointerTimer = window.setTimeout(() => {
    doorInteractive.value = false
  }, disablePointerAfterMs)

  doorHideTimer = window.setTimeout(() => {
    showDoorIntro.value = false
  }, durationMs)
}

function extractYouTubeId(url) {
  if (!url) return ''

  // youtu.be/VIDEO
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
  if (shortMatch?.[1]) return shortMatch[1]

  // youtube.com/watch?v=VIDEO
  const watchMatch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)
  if (watchMatch?.[1]) return watchMatch[1]

  // youtube.com/shorts/VIDEO
  const shortsMatch = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/)
  if (shortsMatch?.[1]) return shortsMatch[1]

  // youtube.com/embed/VIDEO
  const embedMatch = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/)
  if (embedMatch?.[1]) return embedMatch[1]

  return ''
}

function toEmbedUrl(videoId) {
  if (!videoId) return ''
  return `https://www.youtube.com/embed/${videoId}`
}

async function fetchFeedXml(feedUrl) {
  // Folosim CORS-proxy-uri publice ca să putem citi RSS-ul direct din browser.
  // Unele mai dau 5xx ocazional, deci avem fallback.
  const proxyUrls = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ]

  const timeoutMs = 8000
  let lastErr

  for (const toProxy of proxyUrls) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

    try {
      const proxied = toProxy(feedUrl)
      const res = await fetch(proxied, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Proxy error (${res.status})`)
      const text = await res.text()
      if (!text || !text.includes('<feed')) throw new Error('Răspuns invalid')
      return text
    } catch (err) {
      lastErr = err
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  throw lastErr || new Error('Feed indisponibil')
}

function parseLatestFromXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  const entries = Array.from(doc.getElementsByTagName('entry'))
  
  // Parse all videos (unfiltered for latest section)
  const allVideos = []
  for (let i = 0; i < Math.min(10, entries.length); i++) {
    const entry = entries[i]
    const videoIdNode = entry.getElementsByTagName('yt:videoId')?.[0]
    const titleNode = entry.getElementsByTagName('title')?.[0]
    const linkNode = entry.getElementsByTagName('link')?.[0]

    const videoId = videoIdNode?.textContent?.trim() || ''
    const title = titleNode?.textContent?.trim() || ''
    const href = linkNode?.getAttribute('href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')

    if (!videoId || !title) continue

    allVideos.push({
      videoId,
      title,
      href,
      embedUrl: toEmbedUrl(videoId),
      isShort: href.includes('/shorts/'),
      isLive: title.includes('🔴') || title.toLowerCase().includes('[live]') || title.toLowerCase().includes('(live)')
    })
  }

  // Take first 3 for latest section (can be anything)
  const latestThree = allVideos.slice(0, 3)

  return { latestThree }
}

async function loadLatestVideos() {
  latestLoading.value = true
  latestError.value = ''

  for (const candidate of FEED_CANDIDATES) {
    try {
      const xml = await fetchFeedXml(candidate)
      const { latestThree } = parseLatestFromXml(xml)
      if (latestThree.length) {
        latestVideos.value = latestThree
        return
      }
    } catch {
      // încearcă următorul feed
    }
  }

  latestVideos.value = []
  latestError.value = 'Nu am reușit să încarc automat ultimele videoclipuri. Deschide canalul și verifică feed-ul.'
}

const schedule = [
  { day: 'Luni', time: '20:00 — 00:00', note: 'Încălzire + meciuri' },
  { day: 'Marți', time: '20:00 — 00:00', note: 'Premier / FACEIT, focus pe progres' },
  { day: 'Miercuri', time: '20:00 — 00:00', note: 'Cu comunitatea (când se strânge lumea)' },
  { day: 'Joi', time: '20:00 — 00:00', note: 'Gameplay + faze de povestit' },
  { day: 'Vineri', time: '20:00 — ???', note: 'Seară lungă: chill, glume și clutch-uri' },
  { day: 'Sâmbătă', time: 'Variabil', note: '' },
  { day: 'Duminică', time: 'Variabil', note: '' },
]

onMounted(() => {
  loadLatestVideos().finally(() => {
    latestLoading.value = false
  })

  // Ușă care se deschide la intrare ("WOW").
  startDoorIntro()
})
</script>

<template>
  <div class="min-h-dvh">
    <ThreeBackground />

    <div
      v-if="showDoorIntro"
      :key="doorIntroKey"
      class="door-intro fixed inset-0 z-50"
      :class="[
        doorReduced ? 'door-reduced' : '',
        doorSkip ? 'door-skip' : '',
        doorForceMotion ? 'door-force-motion' : '',
        doorInteractive ? 'pointer-events-auto' : 'pointer-events-none',
      ]"
      aria-hidden="true"
      @click="skipDoorIntro"
    >
      <div class="absolute inset-0">
        <div class="door-left absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r from-zinc-950 to-brand-950" />
        <div class="door-right absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-zinc-950 to-brand-950" />
        <div class="door-seam absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-brand-400/40" />
      </div>

      <div class="absolute inset-0 grid place-items-center">
        <button
          type="button"
          class="door-title group rounded-2xl border border-white/10 bg-black/20 px-7 py-5 text-center backdrop-blur"
          @click.stop="skipDoorIntro"
        >
          <p class="font-brand text-3xl font-black tracking-wide">XADRY</p>
          <p class="mt-2 text-xs text-zinc-200">apasă pe logo ca să intri</p>
          <p class="mt-1 text-[11px] text-zinc-400">(sau așteaptă câteva secunde)</p>
        </button>
      </div>
    </div>

    <header class="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
      <div class="container-x flex h-16 items-center justify-between">
        <a href="#acasa" class="flex items-center gap-2">
          <span class="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10" aria-hidden="true">
            <img src="/logo.jpg" alt="" class="h-full w-full object-cover" />
          </span>
          <span class="font-brand text-base font-black tracking-wide">XADRY</span>
        </a>

        <nav class="hidden items-center gap-6 text-sm text-zinc-200 md:flex">
          <a class="hover:text-white" href="#despre">Despre</a>
          <a class="hover:text-white" href="#youtube">YouTube</a>
          <a class="hover:text-white" href="#program">Program</a>
          <a class="hover:text-white" href="#linkuri">Linkuri</a>
        </nav>

        <div class="flex items-center gap-2">
          <a class="btn-ghost-x hidden sm:inline-flex" href="#youtube">Vezi clipuri</a>
          <a class="btn-primary-x" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Abonează-te</a>
        </div>
      </div>
    </header>

    <div class="social-bar border-b border-white/10 bg-gradient-to-r from-brand-950/40 via-zinc-950/60 to-brand-950/40 backdrop-blur-sm">
      
      <div class="container-x py-4">
        <div class="flex flex-wrap items-center justify-center gap-4">
          <a 
            :href="CHANNEL_URL" 
            target="_blank" 
            rel="noreferrer"
            class="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 transition-all hover:border-brand-400/40 hover:bg-brand-950/30"
          >
            <svg class="h-5 w-5 text-brand-300 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span class="text-sm font-semibold text-zinc-100">YouTube</span>
          </a>
          
          <a 
            :href="INSTAGRAM_URL" 
            target="_blank" 
            rel="noreferrer"
            class="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 transition-all hover:border-brand-400/40 hover:bg-brand-950/30"
          >
            <svg class="h-5 w-5 text-brand-300 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
            </svg>
            <span class="text-sm font-semibold text-zinc-100">Instagram</span>
          </a>
          
          <a 
            :href="DISCORD_URL" 
            target="_blank" 
            rel="noreferrer"
            class="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 transition-all hover:border-brand-400/40 hover:bg-brand-950/30"
          >
            <svg class="h-5 w-5 text-brand-300 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span class="text-sm font-semibold text-zinc-100">Discord</span>
          </a>
          
          <a 
            :href="TELEGRAM_URL" 
            target="_blank" 
            rel="noreferrer"
            class="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 transition-all hover:border-brand-400/40 hover:bg-brand-950/30"
          >
            <svg class="h-5 w-5 text-brand-300 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span class="text-sm font-semibold text-zinc-100">Telegram</span>
          </a>
          
          <a 
            :href="TIKTOK_URL" 
            target="_blank" 
            rel="noreferrer"
            class="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-2 transition-all hover:border-brand-400/40 hover:bg-brand-950/30"
          >
            <svg class="h-5 w-5 text-brand-300 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
            </svg>
            <span class="text-sm font-semibold text-zinc-100">TikTok</span>
          </a>
        </div>
      </div>
    </div>

    <main>
      <section id="acasa" class="container-x py-12 md:py-16">
        <div class="grid items-center gap-10 md:grid-cols-12">
          <div class="md:col-span-5">
            <p class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <span class="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Entertainment + gaming • CS2 • Premier / FACEIT • vibe bun
            </p>

            <h1 class="mt-2 text-4xl font-black leading-snug tracking-tight md:text-5xl">
              <span class="block">XADRY - LOCUL UNDE SE GAESTE ENTERNAITMENT SI GAMING </span>
              <span class="mt-3 block whitespace-nowrap">
                <span class="relative inline-block text-brand-300">
                  <span aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 text-brand-400 opacity-50 blur-sm animate-pulse">
                    bere rece + plăcere
                  </span>
                  bere rece + plăcere
                </span>
              </span>
            </h1>

            <p class="mt-4 max-w-prose text-base leading-relaxed text-zinc-200">
              CS2, momente de râs și caterincă non‑stop — plus gameplay puternic când se strânge vibe‑ul.
            </p>

            <div class="mt-5 card-x p-4 text-left">
              <p class="text-sm font-semibold">Un fel de „game friend”</p>
              <p class="mt-2 text-sm text-zinc-200">
                Dacă vrei să mă vezi cum mă fac de râs și mă joc în același timp,
                apasă pe butonul „Vezi canalul”.
              </p>
            </div>

            <div class="mt-6 flex flex-wrap gap-3">
              <a class="btn-primary-x" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Vezi canalul</a>
              <a class="btn-ghost-x" href="#youtube">Ultimele 3 clipuri</a>
            </div>

            <dl class="mt-8 grid grid-cols-3 gap-3">
              <div class="card-x p-4">
                <dt class="text-xs text-zinc-300">Joc preferat</dt>
                <dd class="mt-1 text-sm font-bold">Counter‑Strike 2</dd>
              </div>
              <div class="card-x p-4">
                <dt class="text-xs text-zinc-300">Stil</dt>
                <dd class="mt-1 text-sm font-bold">Caterincă + focus</dd>
              </div>
              <div class="card-x p-4">
                <dt class="text-xs text-zinc-300">Vibe</dt>
                <dd class="mt-1 text-sm font-bold">Bere rece + CS</dd>
              </div>
            </dl>
          </div>

          <div class="card-x overflow-hidden md:col-span-7">
            <div class="border-b border-white/10 p-4">
              <p class="text-sm font-semibold">Video de prezentare</p>
            </div>

            <div class="aspect-video w-full bg-black/30">
              <iframe
                class="h-full w-full"
                :src="heroVideo.embedUrl"
                :title="heroVideo.title || 'YouTube video player'"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
              />
            </div>

            <div class="p-4">
              <div class="grid gap-2 sm:grid-cols-2">
                <a class="btn-ghost-x w-full" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Deschide canalul pe YouTube</a>
                
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="despre" class="container-x py-12">
        <div class="grid gap-6 md:grid-cols-3">
          <div class="md:col-span-1">
            <h2 class="text-2xl font-extrabold tracking-tight">Despre XADRY</h2>
            <p class="mt-2 text-sm text-zinc-200">
              Caterincă zi de zi, gameplay‑uri puternice și momente de neuitat.
              Pe YouTube mă găsești ca <span class="font-semibold text-zinc-100">@Adrian.Stefan7</span>.
            </p>
          </div>

          <div class="card-x p-6 md:col-span-2">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <p class="text-sm font-semibold">Ce găsești pe stream</p>
                <ul class="mt-2 space-y-2 text-sm text-zinc-200">
                  <li class="flex gap-2"><span class="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400" /> CS2: Premier + FACEIT</li>
                  <li class="flex gap-2"><span class="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400" /> OME.TV (ocazional)</li>
                  <li class="flex gap-2"><span class="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400" /> Entertainment și caterincă</li>
                </ul>
              </div>

              <div class="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-950/30 via-amber-950/20 to-yellow-900/30 p-4 shadow-lg shadow-yellow-900/20">
                <div class="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-yellow-400/10 blur-2xl"></div>
                <div class="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-amber-400/10 blur-xl"></div>
                <div class="relative">
                  <p class="text-sm font-bold text-yellow-100">Regula de aur</p>
                  <p class="mt-3 text-sm leading-relaxed text-amber-100/90">
                    Nu se spamează chatul. Ne tratăm ok în chat (până la un anumit nivel de caterincă).
                    Fără hate, fără toxic. Și dacă e vibe: hai să bem o bere rece împreună.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="youtube" class="container-x py-12">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-2xl font-extrabold tracking-tight">YouTube</h2>
            <p class="mt-2 text-sm text-zinc-200">Ultimele clipuri de pe canal.</p>
          </div>
          <a class="btn-primary-x" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Mergi la canal</a>
        </div>

        <div class="mt-6">
          <div v-if="latestLoading" class="card-x p-6">
            <p class="text-sm text-zinc-200">Încărcăm ultimele 3 videoclipuri...</p>
          </div>

          <div v-else-if="latestError" class="card-x p-6">
            <p class="text-sm text-zinc-200">{{ latestError }}</p>
            <p class="mt-2 text-xs text-zinc-400">
              Dacă nu apar clipurile, intră direct pe canal și verifică acolo.
            </p>
          </div>

          <div v-else class="grid gap-4 md:grid-cols-3">
            <div v-for="video in latestVideos" :key="video.videoId" class="card-x overflow-hidden">
              <div class="aspect-video w-full bg-black/30">
                <iframe
                  class="h-full w-full"
                  :src="video.embedUrl"
                  :title="video.title || 'YouTube video'"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                />
              </div>
              <div class="p-4">
                <p class="line-clamp-2 text-sm font-semibold">{{ video.title || 'Video' }}</p>
                <a class="mt-3 inline-flex text-sm font-semibold text-brand-200 hover:text-brand-100" :href="video.href" target="_blank" rel="noreferrer">
                  Deschide pe YouTube
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-4 md:grid-cols-3">
          <div class="card-x p-6">
            <p class="text-sm font-semibold">Entertainment</p>
            <p class="mt-2 text-sm text-zinc-200">Faze de râs și caterincă non‑stop.</p>
          </div>
          <div class="card-x p-6">
            <p class="text-sm font-semibold">Gameplay puternic</p>
            <p class="mt-2 text-sm text-zinc-200">CS2, decizii rapide și progres pas cu pas.</p>
          </div>
          <div class="card-x p-6">
            <p class="text-sm font-semibold">Comunitate</p>
            <p class="mt-2 text-sm text-zinc-200">Intră pe live, simte‑te bine și alătură‑te comunității.</p>
          </div>
        </div>
      </section>

      <section id="program" class="container-x py-12">
        <div class="card-x p-6">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-extrabold tracking-tight">Program stream</h2>
            </div>
            <a class="btn-ghost-x" href="#acasa">Înapoi sus</a>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="item in schedule" :key="item.day" class="rounded-xl border border-white/10 bg-black/20 p-4">
              <div class="flex items-center justify-between">
                <p class="text-sm font-bold">{{ item.day }}</p>
                <span class="rounded-full bg-brand-700/25 px-2 py-1 text-xs text-brand-100 ring-1 ring-white/10">{{ item.time }}</span>
              </div>
              <p v-if="item.note" class="mt-2 text-sm text-zinc-200">{{ item.note }}</p>
            </div>
          </div>
        </div>
      </section>

    
    </main>

    <footer class="border-t border-white/10 py-8">
      <div class="container-x flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p class="text-sm text-zinc-300">© {{ new Date().getFullYear() }} XADRY. Ne vedem la CS.</p>
        <a class="text-sm font-semibold text-brand-200 hover:text-brand-100" :href="CHANNEL_URL" target="_blank" rel="noreferrer">
          YouTube: @Adrian.Stefan7
        </a>
      </div>
    </footer>
  </div>
</template>

<style>
.door-intro {
  /* Intro total ~6s (sincron cu timer-ul din JS) */
  animation: door-fade 6s ease forwards;
}

/* Când utilizatorul apasă pe logo/overlay, deschidem imediat și ieșim rapid */
.door-intro.door-skip {
  animation: door-fade 1.85s ease forwards;
}

.door-left,
.door-right {
  will-change: transform;
}

.door-left {
  /* Ținem "ușa" închisă ~4.2s, apoi se deschide */
  animation: door-left-open 1.35s cubic-bezier(0.2, 0.85, 0.15, 1) 4.2s forwards;
}

.door-intro.door-skip .door-left {
  animation-delay: 0s;
}

.door-right {
  animation: door-right-open 1.35s cubic-bezier(0.2, 0.85, 0.15, 1) 4.2s forwards;
}

.door-intro.door-skip .door-right {
  animation-delay: 0s;
}

.door-seam {
  animation: door-seam-fade 1.35s ease 4.2s forwards;
}

.door-intro.door-skip .door-seam {
  animation-delay: 0s;
}

.door-title {
  /* Logo-ul rămâne vizibil și clicabil */
  animation:
    door-title-in 450ms cubic-bezier(0.2, 0.9, 0.2, 1) both,
    door-title-out 380ms ease 4.15s forwards;
}

.door-intro.door-skip .door-title {
  animation:
    door-title-in 250ms cubic-bezier(0.2, 0.9, 0.2, 1) both,
    door-title-out 300ms ease 0.1s forwards;
}

@keyframes door-left-open {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-108%);
  }
}

@keyframes door-right-open {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(108%);
  }
}

@keyframes door-seam-fade {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes door-title-in {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes door-title-out {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-6px) scale(1.02);
  }
}

@keyframes door-fade {
  0% {
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.door-reduced,
.door-reduced .door-left,
.door-reduced .door-right,
.door-reduced .door-seam,
.door-reduced .door-title {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  /* Respectăm reduce-motion, dar permitem animația dacă user-ul a cerut-o explicit (click). */
  .door-intro:not(.door-force-motion),
  .door-intro:not(.door-force-motion) .door-left,
  .door-intro:not(.door-force-motion) .door-right,
  .door-intro:not(.door-force-motion) .door-seam,
  .door-intro:not(.door-force-motion) .door-title {
    animation: none !important;
  }
}
</style>
