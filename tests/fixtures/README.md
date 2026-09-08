# Compatibility fixtures

`backup-v1/` contains the exact uncompressed entries of a format-v1 Canwoo
archive produced on September 7, 2026 from the synthetic lifecycle test setup.
The source sentence, researcher identity, note revisions, evidence, tasks,
budget and watch are invented test data. No account export, model key or
third-party research material is included. These fixtures use the repository's
AGPL-3.0-only license.

The default test suite packages these entries into a ZIP without recomputing
their manifest hashes, then imports them with the current code. This tests
compatibility with a fixed older export in addition to the live round-trip tests.
It requires no environment variables, network service or credentials.

Do not regenerate this fixture to make a failing import pass. Its JSON is
excluded from automatic formatting because exact bytes are part of the checksum
contract. For a deliberate new backup format, retain this fixture and add a new
one with its provenance and expected compatibility behavior.
