# Changelog

## 0.1.4

- Publish reviewed SDK bundles through GitHub trusted publishing.
- Link npm releases to the dedicated public SDK repository.

## 0.1.3

- Scope connections to cards, wallets, or all wallets in a workspace.
- List permitted cards with `o11 cards` or `client.cards()`.
- Select a card with `--card ID` or `client.withCard(id)`.
- Browser login and doctor support connections with multiple cards.

## 0.1.2

- Keep agent credentials in separate named profiles without changing the default login.
- Bind browser approval to the selected card and connection name.
- Support `--profile` on every command and renew only that profile's credentials.

## 0.1.1

- Connect agents through browser approval without copying a card key.
- Renew saved card access automatically and preserve the requested task.
- Keep existing environment and key-stdin connections available.

## 0.1.0

- Publish the wallet SDK as `@o11/sdk`, including the `o11` terminal command.
- Support tool discovery, price quotes, spending balances, execution, receipts, cancellation, and service controls.
- Keep wallet card access in `~/.config/o11-wallet`, separate from retention profiles.

The earlier documentation download used `@o11/tool-sdk` and `o11-tools`. See https://docs.o11.ai/product-names/ for the new names.
