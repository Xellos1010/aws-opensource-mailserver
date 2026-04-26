---
alwaysApply: true
description: Nx monorepo SDLC rules, tagging, and boundaries
---
Nx Monorepo SDLC Rules
Objectives

Keep architecture clean and evolvable with strict boundaries and clear library types.

Enforce repo-wide consistency via generators, tags, lint rules, and CI.

Prefer local-first iteration; validate via unit → integration → E2E gates.

Tag Taxonomy (repo-aligned)

Use the existing tag vocabulary in project.json. Do not introduce new tags unless you also update the module-boundary rules.

Observed tags in this workspace include:
- type: app, feature, ui, data-access, util, domain, core, api, automation, data
- scope: summerysky, chrome-ext, common, shared, platform, flows, zoominfo, indeed
- platform: web, node
- layer: domain, runtime, browser-api, ui, core, automation

Library Types & Naming

Keep types small and predictable. Prefer placing new libs under libs/<scope>/<type>/<name> when possible, even if legacy libs do not yet follow the pattern.

Project Tags

Every lib/app must specify tags in project.json. Tags drive lint rules and dependency constraints.

Module Boundaries (lint-enforced)

Use ESLint flat config with @nx/enforce-module-boundaries. Keep constraints aligned with the tag taxonomy above.

Baseline constraints to keep layers clean:
- type:app → may depend on any
- type:feature → may depend on ui, data-access, util, domain, core (same scope or scope:shared)
- type:ui → may depend on ui, util (same scope or scope:shared)
- type:data-access → may depend on util, domain (same scope or scope:shared)
- type:domain → may depend on util only
- type:util → may depend on util only

Ban deep imports (*/src/*).

eslint.config.mjs (drop-in)
// eslint.config.mjs
import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature','type:ui','type:data-access','type:util','type:domain','type:core','scope:shared'] },
            { sourceTag: 'type:ui',      onlyDependOnLibsWithTags: ['type:ui','type:util','scope:shared'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access','type:util','type:domain','scope:shared'] },
            { sourceTag: 'type:domain',  onlyDependOnLibsWithTags: ['type:util'] },
            { sourceTag: 'type:util',    onlyDependOnLibsWithTags: ['type:util'] },
            // Keep scopes local or shared
            { sourceTag: 'scope:summerysky', onlyDependOnLibsWithTags: ['scope:summerysky','scope:shared'] },
            { sourceTag: 'scope:chrome-ext', onlyDependOnLibsWithTags: ['scope:chrome-ext','scope:shared'] },
            { sourceTag: 'scope:common', onlyDependOnLibsWithTags: ['scope:common','scope:shared'] },
          ],
          bannedExternalImports: ['**/src/**'],
        },
      ],
    },
  },
];

Generators & Creation Rules

Always generate via Nx generators (no hand-rolled libs). Use --directory, --importPath, and --tags.

Only mark a lib buildable/publishable when you truly need to build or publish it (requires --importPath).

Prefer as-provided path semantics for predictable folder roots in new workspaces.

Linking & Imports

Import only from the library’s root export (no deep paths).

Nx sets up TS path aliases; ensure importPath matches desired alias and avoid collisions with package names.

Task Pipelines & Defaults

Define repo-wide targetDefaults in nx.json for build, test, lint, e2e (including caching, inputs/outputs, and dependsOn).

Use nx affected in CI to scope work; enable remote cache (Nx Replay) to share results across dev/CI.

Caching & CI

Understand computation hashing; don’t break cache with ad-hoc scripts. Prefer Nx executors and declare outputs.

Remote caching cuts CI time dramatically; wire a provider (e.g., Nx Replay).

Create (React/JS example)
# feature lib (web)
nx g @nx/react:lib summerysky-feature-records \
  --directory=libs/summerysky/feature/records \
  --importPath=@ss/feature-records \
  --tags="scope:summerysky,type:feature,platform:web" \
  --unitTestRunner=vitest --linter=eslint

# data-access (node)
nx g @nx/js:lib summerysky-data-access-core \
  --directory=libs/summerysky/data-access/core \
  --importPath=@ss/data-access-core \
  --tags="scope:summerysky,type:data-access,platform:node" \
  --bundler=tsc --unitTestRunner=vitest --linter=eslint

# ui
nx g @nx/react:lib chrome-ext-ui-shell \
  --directory=libs/Google-Chrome-Extension-Library/ui/shell \
  --importPath=@chrome-ext/ui-shell \
  --tags="scope:chrome-ext,type:ui,platform:web" \
  --unitTestRunner=vitest

Create (publishable when needed)
nx g @nx/js:lib shared-util-dates \
  --directory=libs/shared/util/dates \
  --importPath=@shared/util-dates \
  --tags="scope:shared,type:util,platform:node" \
  --publishable --bundler=tsc --unitTestRunner=vitest

(Requires --importPath; use publishable/buildable only if distributing/isolated builds are needed.) 

project.json (tagging & targets)
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "summerysky-data-access-core",
  "sourceRoot": "libs/summerysky/data-access/core/src",
  "projectType": "library",
  "tags": ["scope:summerysky","type:data-access","platform:node"],
  "targets": {
    "build": { "executor": "@nx/js:tsc", "options": { "outputPath": "dist/libs/summerysky/data-access/core" } },
    "test": { "executor": "@nx/vite:test", "options": { "passWithNoTests": true } },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}

Linking Between Libs

Import using the alias (set by --importPath), e.g.:

import { PatientRecordStore } from '@ss/data-access-core';

Ensure every lib has a proper src/index.ts public surface.

Avoid deep imports; ESLint rule bans them. (See boundaries rule.) 

TS Path & Scope Notes

Nx manages tsconfig.base.json paths for you; avoid manual edits unless necessary. If you change, keep alias ≠ package name to prevent resolution conflicts.

Prefer the latest generator behaviors (as-provided paths).

npmScope in nx.json is deprecated; rely on package names/importPath instead.
