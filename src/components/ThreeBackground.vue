<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const containerEl = ref(null)

let renderer
let scene
let camera
let rafId
let stars
let starsGlow
let geometry
let material
let materialGlow

let positionsArray
let introStartMs
let lastFrameMs

const FIELD = {
  count: 1400,
  radius: 16,
  zMin: -95,
  zMax: 25,
}

function shouldReduceMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function createStarfield() {
  scene = new THREE.Scene()

  const container = containerEl.value
  const width = container?.clientWidth || window.innerWidth
  const height = container?.clientHeight || window.innerHeight

  camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200)
  camera.position.set(0, 0, 22)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setClearColor(0x000000, 0)

  container.appendChild(renderer.domElement)

  // Paletă "brand" (magenta închis) — aceeași idee ca în tailwind.config.js
  const c1 = new THREE.Color('#d63faf') // brand-500
  const c2 = new THREE.Color('#942173') // brand-700
  const c3 = new THREE.Color('#f0a2df') // brand-300

  const positions = new Float32Array(FIELD.count * 3)
  const colors = new Float32Array(FIELD.count * 3)
  positionsArray = positions

  for (let i = 0; i < FIELD.count; i++) {
    // Distribuție tip "tunel" (mai bună pentru efectul de warp la intrare)
    const r = Math.pow(Math.random(), 0.55) * FIELD.radius
    const a = Math.random() * Math.PI * 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const z = FIELD.zMin + Math.random() * (FIELD.zMax - FIELD.zMin)

    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const pick = Math.random()
    const col = pick < 0.6 ? c1 : pick < 0.9 ? c2 : c3
    colors[i * 3 + 0] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }

  geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  material = new THREE.PointsMaterial({
    size: 0.075,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  // Al doilea layer (glow) — dă efect "WOW" fără post-processing.
  materialGlow = new THREE.PointsMaterial({
    size: 0.18,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  // Un "spark" extra: câteva particule foarte luminoase, rare, ca niște sclipiri.
  const sparkCount = 120
  const sparkPositions = new Float32Array(sparkCount * 3)
  const sparkColors = new Float32Array(sparkCount * 3)
  for (let i = 0; i < sparkCount; i++) {
    const r = Math.pow(Math.random(), 0.35) * (FIELD.radius * 0.95)
    const a = Math.random() * Math.PI * 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const z = FIELD.zMin + Math.random() * (FIELD.zMax - FIELD.zMin)

    sparkPositions[i * 3 + 0] = x
    sparkPositions[i * 3 + 1] = y
    sparkPositions[i * 3 + 2] = z

    const col = Math.random() < 0.65 ? c3 : c1
    sparkColors[i * 3 + 0] = col.r
    sparkColors[i * 3 + 1] = col.g
    sparkColors[i * 3 + 2] = col.b
  }

  const sparkGeom = new THREE.BufferGeometry()
  sparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3))
  sparkGeom.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3))
  const sparkMat = new THREE.PointsMaterial({
    size: 0.42,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const spark = new THREE.Points(sparkGeom, sparkMat)
  spark.name = 'spark'
  scene.add(spark)

  stars = new THREE.Points(geometry, material)
  scene.add(stars)

  starsGlow = new THREE.Points(geometry, materialGlow)
  scene.add(starsGlow)

  // Un "haze" subtil ca să lege vizual fundalul de tema dark-magenta.
  // Fundalul de pagină e negru; aici rămân doar "spark"-urile (stele + glow).
  // Fără haze/overlay colorat ca să păstrăm negrul curat.
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3)
}

function updateWarp(dtMs, timeMs) {
  if (!positionsArray) return

  // Intro: "holy shit" warp 2.6s, apoi revine la slow drift.
  const introDuration = 2600
  const elapsed = timeMs - (introStartMs || timeMs)
  const p = clamp01(elapsed / introDuration)
  const k = 1 - easeOutCubic(p) // 1 -> 0

  // Viteză mare la început, scade gradual (mai redus).
  const speed = 0.04 + k * 0.34
  const step = speed * dtMs

  // Un mic "pulse" la început (size)
  if (material && materialGlow) {
    material.size = 0.075 + k * 0.06
    materialGlow.size = 0.18 + k * 0.18
    materialGlow.opacity = 0.18 + k * 0.22
  }

  for (let i = 0; i < FIELD.count; i++) {
    const idx = i * 3
    let z = positionsArray[idx + 2]

    // Mișcare către cameră (z crește)
    z += step

    if (z > FIELD.zMax) {
      // Respawn în spate
      const r = Math.pow(Math.random(), 0.55) * FIELD.radius
      const a = Math.random() * Math.PI * 2
      positionsArray[idx + 0] = Math.cos(a) * r
      positionsArray[idx + 1] = Math.sin(a) * r
      z = FIELD.zMin
    }

    positionsArray[idx + 2] = z
  }

  geometry.attributes.position.needsUpdate = true
}

function renderFrame(timeMs) {
  const t = timeMs * 0.00005
  const dtMs = lastFrameMs ? Math.min(50, timeMs - lastFrameMs) : 16
  lastFrameMs = timeMs

  if (stars) {
    // Rotire lentă (după intro) — păstrează vibe-ul.
    stars.rotation.y = t * 0.18
    stars.rotation.x = t * 0.11
    if (starsGlow) {
      starsGlow.rotation.y = stars.rotation.y
      starsGlow.rotation.x = stars.rotation.x
    }

    updateWarp(dtMs, timeMs)
  }

  renderer.render(scene, camera)
  rafId = requestAnimationFrame(renderFrame)
}

function handleResize() {
  const container = containerEl.value
  if (!container || !renderer || !camera) return

  const width = container.clientWidth
  const height = container.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
}

onMounted(() => {
  if (!containerEl.value) return

  createStarfield()
  window.addEventListener('resize', handleResize)

  if (!shouldReduceMotion()) {
    introStartMs = performance.now()
    rafId = requestAnimationFrame(renderFrame)
  } else {
    renderer.render(scene, camera)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)

  if (rafId) cancelAnimationFrame(rafId)

  if (stars) scene?.remove(stars)
  if (starsGlow) scene?.remove(starsGlow)

  geometry?.dispose?.()
  material?.dispose?.()
  materialGlow?.dispose?.()
  renderer?.dispose?.()

  const canvas = renderer?.domElement
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas)

  renderer = undefined
  scene = undefined
  camera = undefined
  stars = undefined
  starsGlow = undefined
  geometry = undefined
  material = undefined
  materialGlow = undefined
  positionsArray = undefined
  introStartMs = undefined
  lastFrameMs = undefined
  rafId = undefined
})
</script>

<template>
  <div ref="containerEl" class="fixed inset-0 -z-10" aria-hidden="true" />
</template>
