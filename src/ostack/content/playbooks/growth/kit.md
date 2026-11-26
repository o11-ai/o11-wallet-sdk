---
kit: 1
name: growth
title: Growth
summary: Work out how a company or a creator grew from public evidence, and turn it into plays you can copy.
release: 0.13.1
license: MIT
uses:
  effects: [read, spend]
workflows:
  - id: full
    skill: ostack-growth-teardown
    summary: A company and a time window in, a dated account of how it grew out, ending in ten plays with prompts.
  - id: content
    skill: ostack-growth-teardown
    summary: What a company publishes on each channel and what wins there, with formulas to reuse.
  - id: videos
    skill: ostack-growth-teardown
    summary: The short videos a company posted at each stage of its growth, matched to your stage, with hooks, formats and sounds to remake.
  - id: creator
    skill: ostack-growth-teardown
    summary: A person's handle in, their platforms, rhythm, content patterns and offers out, ending in five plays.
---
Growth research your agent runs on request, on public evidence only, with data routes from your o11 wallet. Every finding is marked seen or inferred, every count is dated, and each paid call is quoted first and kept under a spending cap ($3 by default).

Each teardown is a local folder (`growth-teardown/<target>-<date>/`, or one you name) holding the raw results, the CSVs, the report in markdown and one HTML file. Nothing is uploaded. The o11 workspace holds only the team's text rules for the steps below. Workflows run on request; they have no schedule.
