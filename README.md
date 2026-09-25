# plow-messages

A CLI that reads the owner's iMessage archive (`~/Library/Messages/chat.db`)
and WhatsApp archive
(`~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`)
through the same four verbs and the same JSON line. iMessage bodies that live
only in `attributedBody` are decoded. WhatsApp is `--app whatsapp`, a global
that belongs before the subcommand. The default is iMessage.
`plow-messages --help` is the contract; `skill.md` is the agent-facing page.

## Build & test

```sh
npm ci
just test
```

macOS only — the CLI is Swift, built against `Foundation`'s typedstream
decoder, and the suite runs the built binary.

## Release

Pushing a `v*` tag publishes a release.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 The
Plow Collective, Inc.

"Plow" and the Plow logo are trademarks of The Plow Collective, Inc. The
license grants no trademark rights.
