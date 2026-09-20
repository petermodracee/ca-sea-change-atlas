# Contributing

Thanks for helping. This is a small personal project; issues, discussions and pull requests are all welcome. Start with [`README.md`](README.md) to run it locally and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.

## Workflow

1. Branch from `main` (`feature/...`, `fix/...`, `docs/...`).
2. Make the change, and update the docs it affects in the same pull request.
3. Run `npm run build` (must succeed) and check the pages you touched with `npm run serve`.
4. Open a pull request describing what changed and why.

There is no automated test suite yet, so say how you verified the change.

## Licensing requirements

Everything in this project stays open. Two rules follow from that.

### What you contribute

By submitting a pull request you agree that:

- your original **written content** (page copy, tool descriptions, comparisons, documentation) is licensed under **[CC BY-SA 4.0](LICENSE-CONTENT.md)**, and
- your original **code** (templates, JavaScript, CSS, build config) is licensed under **[GPL v3.0](LICENSE)**.

Don't paste in text or code you didn't write unless it is covered by the next rule.

### What you reuse

Any content, data, or code you bring in from elsewhere must carry an **open license** that allows reuse and redistribution here:

| Accepted | Not accepted |
|---|---|
| Public domain, including U.S. federal government works | "All rights reserved", or no license stated |
| CC0, CC BY, CC BY-SA | CC BY-NC, CC BY-ND, or any non-commercial / no-derivatives terms |
| ODbL (data) | Terms of use that bar reuse, bulk download, scraping, or mirroring |
| MIT, BSD, ISC, Apache-2.0 (code and libraries) | Licensed or paid data products |

Notes:

- **Live-loaded data** (the map's layers) isn't stored or redistributed by this project, but it still needs a license or terms that permit this use, and its attribution is shown to visitors.
- **Share-alike sources** (CC BY-SA, ODbL): fine to display live. If a dataset itself is ever copied into this repository, that copy must stay under the same license.
- **Screenshots** of a tool are a separate category: the project treats small, credited, dated screenshots on tool pages as fair use, so they don't need an open license. The rules are in [`docs/LICENSING.md`](docs/LICENSING.md#screenshots).
- **Not sure?** Open an issue before writing code. A source that fails the test can still be listed on the comparison page as an external tool; see [`docs/LICENSING.md`](docs/LICENSING.md) for how past sources were judged.

### Record it

Before a new source or library is merged:

- add it to [`_data/credits.json`](_data/credits.json) with its license and the attribution it requires (this feeds `/licenses.html`);
- for a tool, add or update its entry in [`data/tools.json`](data/tools.json) (`mapEligibility: "excluded"` if it can't go on the map);
- record why a source was excluded, with the ToU clause or how you verified it, in [`docs/LICENSING.md`](docs/LICENSING.md).

## Documentation rules

- Per-tool status lives in `data/tools.json`. Don't restate it, or counts of tools, in prose; link to it.
- Docs describe what the code does now. Verify names and paths, and remove text that no longer applies rather than annotating it.
- Findings about a live service that weren't obvious go in [`docs/DECISIONS.md`](docs/DECISIONS.md), briefly.

## Common tasks

- **Add a map layer:** [`docs/MAP.md`](docs/MAP.md#adding-a-layer)
- **Add or edit a tool:** [`docs/TOOLS.md`](docs/TOOLS.md#adding-a-tool)
