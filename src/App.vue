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
  
  // Filtriamo livestream: cercăm prima 10 entries și scoatem live-urile
  const videos = []
  for (const entry of entries.slice(0, 10)) {
    const videoIdNode = entry.getElementsByTagName('yt:videoId')?.[0]
    const titleNode = entry.getElementsByTagName('title')?.[0]
    const linkNode = entry.getElementsByTagName('link')?.[0]

    const videoId = videoIdNode?.textContent?.trim() || ''
    const title = titleNode?.textContent?.trim() || ''
    const href = linkNode?.getAttribute('href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')

    // Skip dacă titlul conține indicatori de livestream
    if (!videoId || !title) continue
    const lowerTitle = title.toLowerCase()
    if (lowerTitle.includes('🔴') || 
        lowerTitle.includes('[live]') || 
        lowerTitle.includes('(live)') ||
        lowerTitle.includes('live stream')) {
      continue
    }

    videos.push({
      videoId,
      title,
      href,
      embedUrl: toEmbedUrl(videoId),
    })

    if (videos.length >= 3) break
  }

  return videos
}

async function loadLatestVideos() {
  latestLoading.value = true
  latestError.value = ''

  for (const candidate of FEED_CANDIDATES) {
    try {
      const xml = await fetchFeedXml(candidate)
      const parsed = parseLatestFromXml(xml).filter((v) => v.videoId)
      if (parsed.length) {
        latestVideos.value = parsed
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
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700/30 ring-1 ring-white/10" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-5 w-5 text-brand-200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6.2 6.3L17.8 17.9M17.8 6.3L6.2 17.9"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
              />
              <path
                d="M12 2.75l8 4.65v9.2l-8 4.65-8-4.65V7.4l8-4.65Z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
                opacity="0.65"
              />
            </svg>
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

    <main>
      <section id="acasa" class="container-x py-12 md:py-16">
        <div class="grid items-center gap-10 md:grid-cols-12">
          <div class="md:col-span-5">
            <p class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <span class="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Entertainment + gaming • CS2 • Premier / FACEIT • vibe bun
            </p>

            <h1 class="mt-2 text-4xl font-black leading-snug tracking-tight md:text-5xl">
              <span class="whitespace-nowrap">XADRY — gaming</span>
              <span class="mt-2 block whitespace-nowrap">și entertainment</span>
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
              Locul unde găsești entertainment și gaming.
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
              <p class="mt-1 text-xs text-zinc-300">Ultimul upload de pe canal (se actualizează automat)</p>
            </div>

                <div class="aspect-video w-full bg-black/30">
                  <div v-if="latestLoading" class="grid h-full w-full place-items-center">
                    <p class="text-sm text-zinc-200">Încărcăm…</p>
                  </div>
                  <div v-else-if="!latestVideos?.[0]?.embedUrl" class="grid h-full w-full place-items-center px-6 text-center">
                    <div>
                      <p class="text-sm font-semibold text-zinc-100">Nu am putut încărca ultimul clip</p>
                      <p class="mt-2 text-sm text-zinc-200">Deschide canalul pe YouTube și vezi direct acolo.</p>
                      <a class="btn-ghost-x mt-4 inline-flex" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Deschide canalul</a>
                    </div>
                  </div>
                  <iframe
                    v-else
                    class="h-full w-full"
                    :src="latestVideos[0].embedUrl"
                    title="YouTube video player"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                  />
                </div>

            <div class="p-4">
              <div class="grid gap-2 sm:grid-cols-2">
                <a class="btn-ghost-x w-full" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Deschide canalul pe YouTube</a>
                <a class="btn-ghost-x w-full" :href="CHANNEL_URL_ALT" target="_blank" rel="noreferrer">Link de rezervă (backup)</a>
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

              <div>
                <p class="text-sm font-semibold">Regula de aur</p>
                <p class="mt-2 text-sm text-zinc-200">
                  Nu se spamează chatul. Ne tratăm ok în chat (până la un anumit nivel de caterincă).
                  Fără hate, fără toxic. Și dacă e vibe: hai să bem o bere rece împreună.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="youtube" class="container-x py-12">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-2xl font-extrabold tracking-tight">YouTube</h2>
            <p class="mt-2 text-sm text-zinc-200">Vezi ultimul clip în secțiunea de sus (hero).</p>
          </div>
          <a class="btn-primary-x" :href="CHANNEL_URL" target="_blank" rel="noreferrer">Mergi la canal</a>
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

      <section id="linkuri" class="container-x py-12">
        <div class="card-x p-6">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-extrabold tracking-tight">Linkuri</h2>
              <p class="mt-2 text-sm text-zinc-200">Dă follow / intră pe server și hai la caterincă.</p>
            </div>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a class="btn-ghost-x w-full justify-center" :href="CHANNEL_URL" target="_blank" rel="noreferrer">YouTube</a>
            <a class="btn-ghost-x w-full justify-center" :href="INSTAGRAM_URL" target="_blank" rel="noreferrer">Instagram</a>
            <a class="btn-ghost-x w-full justify-center" :href="DISCORD_URL" target="_blank" rel="noreferrer">Discord (Go to Server)</a>
            <a class="btn-ghost-x w-full justify-center" :href="TELEGRAM_URL" target="_blank" rel="noreferrer">Telegram</a>
            <a class="btn-ghost-x w-full justify-center sm:col-span-2 lg:col-span-1" :href="TIKTOK_URL" target="_blank" rel="noreferrer">TikTok</a>
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
