#!/usr/bin/env node
/**
 * Remove the light-gray background from VTracer SVGs and tighten the viewBox
 * to the character's bounding box (respecting `transform="translate(x,y)"`).
 *
 * Usage: node svg-transparent.mjs <input.svg> [output.svg]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const NUM = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g

/** Near-white / light-gray background paths: low saturation + high lightness. */
function isBackground(fill) {
  const r = parseInt(fill.slice(0, 2), 16)
  const g = parseInt(fill.slice(2, 4), 16)
  const b = parseInt(fill.slice(4, 6), 16)
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  const light = Math.min(r, g, b)
  return sat <= 20 && light >= 180
}

/** Parse a VTracer `transform="translate(x,y)"` into its offsets. */
function translate(path) {
  const m = /transform="translate\((-?\d+(?:\.\d+)?)(?:,\s*(-?\d+(?:\.\d+)?))?\)"/.exec(path)
  return { tx: m ? parseFloat(m[1]) : 0, ty: m && m[2] ? parseFloat(m[2]) : 0 }
}

function processSvg(inPath, outPath) {
  const source = readFileSync(inPath, 'utf8')
  const paths = source.match(/<path\b[^>]*\/>/g) ?? []
  const kept = []
  for (const path of paths) {
    const fill = /fill="#([0-9A-Fa-f]{6})"/.exec(path)
    if (fill && isBackground(fill[1])) continue
    kept.push(path)
  }

  // Bounding box over kept paths, with the translate offsets applied.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const path of kept) {
    const d = /d="([^"]*)"/.exec(path)
    if (!d) continue
    const { tx, ty } = translate(path)
    const nums = d[1].match(NUM)
    if (!nums) continue
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = parseFloat(nums[i]) + tx
      const y = parseFloat(nums[i + 1]) + ty
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const pad = 4
  minX = Math.max(0, Math.floor(minX - pad))
  minY = Math.max(0, Math.floor(minY - pad))
  maxX = Math.min(1024, Math.ceil(maxX + pad))
  maxY = Math.min(1024, Math.ceil(maxY + pad))
  const width = maxX - minX
  const height = maxY - minY

  const out = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n${kept.join('\n')}\n</svg>\n`
  writeFileSync(outPath, out)
  console.log(`${inPath}: removed ${paths.length - kept.length} bg paths, kept ${kept.length}, viewBox=(${minX},${minY}) ${width}x${height}`)
}

const [inPath, outPath] = process.argv.slice(2)
if (!inPath) {
  console.error('usage: node svg-transparent.mjs <input.svg> [output.svg]')
  process.exit(1)
}
processSvg(inPath, outPath ?? inPath)
