# The Monaco Protocol :computer:

<a href="https://doc.rust-lang.org/std/"><img alt="Repo Language Rust"  src="http://img.shields.io/badge/language-rust-orange"></a>
<a href="https://docs.solana.com/developing/programming-model/overview"><img alt="Repo Platform Solana"  src="http://img.shields.io/badge/platform-solana-blue"></a>
<a href="https://github.com/coral-xyz/anchor"><img alt="Repo Framework Anchor"  src="http://img.shields.io/badge/framework-anchor-9cf"></a><br/>

# About :books:

This is the repository of the main Solana program of The Monaco Protocol, _protocol_, as well as JavaScript clients to help with interacting with the protocol.

The protocol is currently in beta, though it is available both on devnet and mainnet-beta.

# Where to find the protocol :mag:

| Address                                       | Network        | Description                                                                                                         |
|-----------------------------------------------|----------------|---------------------------------------------------------------------------------------------------------------------|
| `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` | `mainnet-beta` | `release` - The latest stable official release. This will only be updated when an official approved upgrade occurs. |
| `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` | `devnet`       | `release` - The latest stable official release. This will only be updated when an official approved upgrade occurs. |
| `mpDEVnZKneBb4w1vQsoTgMkNqnFe1rwW8qjmf3NsrAU` | `devnet`       | `bleeding-edge` - The most recently merged changes.                                                                 |

# Mainnet upgrades :satellite:

Current version of the protocol on mainnet-beta: [0.14.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.14.1).

| Date       | Protocol version                                                          | Program address                               |
|------------|---------------------------------------------------------------------------|-----------------------------------------------|
| 2024-04-29 | [0.14.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.14.1) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2024-01-24 | [0.13.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.13.0) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-12-06 | [0.12.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.12.1) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-11-30 | [0.12.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.12.0) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-08-01 | [0.11.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.11.0) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-07-06 | [0.10.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.10.1) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-06-26 | [0.10.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.10.0) | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-05-26 | [0.9.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.9.0)   | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-04-20 | [0.8.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.8.0)   | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-03-16 | [0.7.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.7.0)   | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2023-03-02 | [0.6.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.6.0)   | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |
| 2022-11-25 | [0.5.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.5.0)   | `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` |

# Recent releases <sup>:rocket:</sup>

Protocol releases, along with their corresponding client versions and audit reports.

| Protocol version                                                          | Client       | Admin client | Audit reports                                                                      |
|---------------------------------------------------------------------------|--------------|--------------|------------------------------------------------------------------------------------|
| [0.14.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.14.1) | 11.1.0       | 10.1.0       | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.14.1.pdf) |
| [0.14.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.14.0) | 11.0.0       | 10.0.0       | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.14.0.pdf) |
| [0.13.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.13.0) | 10.0.0       | 9.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.13.0.pdf) |
| [0.12.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.12.1) | 9.0.0        | 8.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.12.1.pdf) |
| [0.12.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.12.0) | 9.0.0        | 8.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.12.0.pdf) |
| [0.11.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.11.0) | 8.0.0        | 7.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.11.0.pdf) |
| [0.10.1](https://github.com/MonacoProtocol/protocol/releases/tag/v0.10.1) | 7.1.0        | 6.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.10.1.pdf) |
| [0.10.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.10.0) | 7.1.0        | 6.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.10.0.pdf) |
| [0.9.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.9.0)   | 7.0.0        | 4.1.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.9.0.pdf)  |
| [0.8.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.8.0)   | 4.x.x, 5.x.x | 3.x.x, 4.x.x | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.8.0.pdf)  |
| [0.7.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.7.0)   | 4.x.x        | 3.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.7.0.pdf)  |
| [0.6.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.6.0)   | 3.x.x, 4.0.x | 2.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.6.0.pdf)  |
| [0.5.0](https://github.com/MonacoProtocol/protocol/releases/tag/v0.5.0)   | 2.0.0        | 1.0.0        | [Sec3](https://github.com/MonacoProtocol/protocol/tree/main/audit/sec3/0.5.0.pdf)  |

# More info :books:

Information on how to interact with the protocol, or to build for the protocol can be found in [the Monaco Protocol SDK](https://github.com/MonacoProtocol/sdk).
