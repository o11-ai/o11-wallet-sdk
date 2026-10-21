# Releases

The SDK snapshot contains an explicit file allowlist. Release bundles have no source maps.

The Publish wallet SDK workflow runs on main with the npm-production environment. It uses a package-scoped OIDC credential; no npm token is stored in GitHub.

Initial setup: publish the first reviewed package, then configure @o11/sdk → Settings → Trusted publishing with organization o11-ai, repository o11-wallet-sdk, workflow publish.yml, environment npm-production, and direct publishing allowed. Set the repository variable NPM_PUBLISH_ENABLED to true after setup. Until then the workflow only reviews the package without publishing.

Every later main update publishes a new version or verifies that the existing version has identical contents. Bump the version when package files change. To retry a failed release, rerun its workflow. To pause future publishing, set NPM_PUBLISH_ENABLED to false.

Local package review: `bun scripts/publish.ts --check`.
