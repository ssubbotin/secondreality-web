# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What this is

A modern web port of Future Crew's *Second Reality* (Assembly'93). Fidelity target: **"faithful core +
modern polish"** — original choreography, the original `.S3M` soundtrack, every effect recognizable, but
rendered sharp at high resolution and 60fps+ with an authentic↔modern toggle.

- **Design spec:** `docs/superpowers/specs/2026-06-13-secondreality-web-stack-design.md` (read this first).
- **Original 1993 source:** `/home/sergey/SecondReality` (read its `CLAUDE.md` for the DOS-era architecture:
  the DIS runtime, ~20 effect "parts", S3M music, the asset formats).

## Stack (see the spec for the full rationale)

TypeScript (strict) · **Three.js** (`three/webgpu` + **TSL**, WebGL2 co-primary) · **libopenmpt 0.8 in an
AudioWorklet as the master clock** (four-channel `Zxx`/`musplus` sync reconstruction) · **Vite (Rolldown)** ·
**pnpm workspace monorepo** (`packages/engine`, `packages/effects/*`, `packages/assets-pipeline`,
`apps/demo`, `apps/lab`) · Biome · Vitest + Playwright · Cloudflare Pages + PWA.

## Conventions

- **License:** public domain (**Unlicense**), same as the original. Ship an `UNLICENSE` file.
- **Git identity:** commits use `Sergey Subbotin <ssubbotin@gmail.com>`.
- **Commit attribution:** this repo **DOES** include the Claude co-author trailer on commits
  (`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). This is a deliberate per-repo
  override of the global "no AI attribution" rule — **do not strip it here.**
- **Decisions locked (2026-06-13):** all 20 parts; authentic↔modern toggle defaulting to modern 16:9
  (mode-X pixel-aspect correction always on); desktop-first, mobile must-not-crash; default-loop playback.
