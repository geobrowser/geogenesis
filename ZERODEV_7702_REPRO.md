# ZeroDev selfFunded proxy — zero-nonce EIP-7702 auth repro

New-user signup on Geo testnet (chain 55516) fails because ZeroDev's
`zd_sponsorUserOperation` handler on the **selfFunded** endpoint re-serializes
zero-valued EIP-7702 authorization fields (`"0x0"` → `"0x"`) before its
internal gas estimate, which then dies with `Cannot convert 0x to a BigInt`.
Every experiment below is a stateless stub call (`shouldConsume: false`, dummy
signature) — safe to replay.

## Evidence matrix (all runnable via curl, 2026-07-23)

| # | Request | Endpoint | Result |
|---|---|---|---|
| 1 | `zd_sponsorUserOperation`, auth `nonce:"0x0"`, `yParity:"0x0"` | `…/chain/55516?selfFunded=true` | **500** — inner `eth_estimateUserOperationGas` shows `nonce:"0x"`, `yParity:"0x"`, error `Cannot convert 0x to a BigInt`, `Version: 2.19.7` (their stack; our client is viem 2.48.1 and sent well-formed values) |
| 2 | Same request | `…/chain/55516` (no selfFunded) | 200 — JSON-RPC error `AA21 didn't pay prefund`: the same zero-valued auth serializes fine and reaches real simulation, but no sponsorship is applied in this mode |
| 3 | **Direct** `eth_estimateUserOperationGas` with well-formed `eip7702Auth` (`nonce:"0x0"`, `yParity:"0x0"`) + the stub paymaster fields | `…?selfFunded=true` | **200 with real gas estimates** — the bundler layer of the same endpoint handles zero-nonce auths correctly; only the sponsor-proxy serialization is broken |
| 4 | `zd_sponsorUserOperation` with the authorization field removed | `…?selfFunded=true` | 400 `AA20 account not deployed` — the auth is required for fresh-account simulation, so stripping it client-side is not a workaround |
| 5 | `zd_sponsorUserOperation` with the field renamed to `eip7702Auth` | `…?selfFunded=true` | Same 500 — their proxy parses and minimally re-serializes zero regardless of input shape, so no client-side request shape avoids the bug |

Conclusion from #1 vs #3: the defect is isolated to the
`zd_sponsorUserOperation` handler's serialization of the authorization tuple
when values are zero. Zero values occur only on a fresh EOA's first-ever
authorization, so all existing accounts (delegation already installed → no
auth attached) are unaffected, and every new account is blocked at its first
transaction.

## Where this lives in code

**geo web (request origin — all values correct when they leave the client):**
- `apps/web/core/hooks/use-smart-account.ts:48` — builds the wallet via
  `generateZeroDevAccount({ network, signer })`
- `packages/auth/src/account.ts:40` — `createGeoWalletClient({ signer, network })`

**geo-sdk `0.20.0-beta.8` (chose the selfFunded endpoint — the change that
exposed the bug, shipped 2026-07-06):**
- `dist/src/networks.js:4` —
  `GEO_TESTNET_SPONSORSHIP_RPC_URL = 'https://rpc.zerodev.app/api/v3/d26c96b9-…/chain/55516?selfFunded=true'`
- `dist/src/wallet.js:76-83` — the same URL is both `bundlerTransport` and the
  paymaster; `getPaymasterStubData` → `paymaster.sponsorUserOperation({ userOperation, shouldConsume: false })`
  is the call that 500s

**@zerodev/sdk 5.5.10 (client-side — behaves correctly):**
- `_esm/accounts/kernel/createKernelAccount.js:317-345` — `signAuthorization()`
  attaches the authorization only when `getCode` shows no
  `0xef0100<implementation>` delegation on the EOA. This is why only the
  first-ever operation carries the tuple (and why existing users never hit the
  bug). The outgoing payload has well-formed `"nonce":"0x0"`, `"yParity":"0x0"`.

**ZeroDev server (the defect — not in any repo we control):** the 500 body
embeds their internal `eth_estimateUserOperationGas` request with the
zero-truncated fields and `Version: 2.19.7` — a viem release predating stable
EIP-7702 support.

## Temporary workaround (until ZeroDev fixes the proxy)

No client-side request shape fixes their serializer (#4, #5). But the broken
handler is only unavoidable for **activation** — so activation can bypass
ZeroDev entirely:

1. Sign the EIP-7702 authorization client-side (we hold the signer; delegate =
   the Kernel v3.3 implementation address from `@zerodev/sdk/constants`).
2. Broadcast it in a standard **type-4 transaction from a funded relayer EOA**
   straight to the chain RPC (`viem sendTransaction({ authorizationList: [auth], … })`).
   Costs a trivial amount of GEO; needs one funded testnet key.
3. Once the delegation code is installed, `signAuthorization()` attaches
   nothing, and the normal SDK flow — including selfFunded sponsorship — works
   (proven daily by all existing-account traffic).

Fine for dev/testing with a shared funded key; a production stopgap would need
a tiny relayer endpoint, which is an infra decision.

## Ask for ZeroDev

Fix the `zd_sponsorUserOperation` handler on selfFunded endpoints to preserve
zero-valued `eip7702Auth` quantities (`nonce`, `yParity`) as `"0x0"` instead of
truncating to `"0x"` — or upgrade the proxy's viem (2.19.7) to a
7702-supporting release. Experiment #3 shows the rest of the pipeline already
handles these correctly.
