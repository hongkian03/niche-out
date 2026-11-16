# Epic 6 import capacity measurements

Measured November 16, 2026 on the available Apple M3 Pro Mac (11 cores, 18 GiB RAM), Node 24.22.3. These are production `ImportService` and worker measurements, not a simulated parser. They do not certify an 8 GiB host or measure an internet upload.

## Method and reproduction

Build the project with the pinned Node runtime, then run `node scripts/test-import-capacity.mjs`. The script creates its generated fixtures outside each measured child process, then starts a fresh child with explicit GC for each case. It invokes the real compiled import service, verifies the engine stays in Setup, closes the service, and records memory after cleanup. Every valid fixture must stage; the oversized fixture must reject. Raw evidence is in `work/epic6/import-capacity.json` and includes fixture SHA-256 values, hardware, CPU time, parent/worker heap, transfer RSS, and after-close memory.

RSS is process-wide and includes the parent and worker. The existing importer samples it every 5 ms; shorter peaks may be missed. Worker heap is sampled at worker checkpoints. Import duration ends at staging/rejection; full harness wall time also includes close/GC. The input buffer remains alive for the after-close sample. No browser or connector is included in these memory figures.

## Results

All sizes use bytes; MiB means 1,048,576 bytes.

| Fixture | Size | Import duration | Peak process RSS | Worker peak heap | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Base example, 1 prompt | 897 | 73.4 ms | 95.5 MiB | 12.2 MiB | Staged |
| Singapore example, 10 prompts | 39,600 | 62.4 ms | 96.2 MiB | 13.8 MiB | Staged |
| 20 prompts, 1,800 answers each, long aliases | 6,796,753 | 238.0 ms | 216.3 MiB | 66.2 MiB | Staged |
| 20 prompts, long aliases, padded exactly to the ceiling | 10,485,760 | 205.2 ms | 201.0 MiB | 48.8 MiB | Staged |
| 20 prompts, dense short answers, padded exactly to the ceiling | 10,485,760 | 527.3 ms | 442.7 MiB | 183.6 MiB | Staged |
| One byte beyond the ceiling | 10,485,761 | 0.1 ms | 80.7 MiB | 0 | `UPLOAD_TOO_LARGE`, no worker started |

The dense ceiling fixture had a 145.5 MiB parent peak heap and 442.7 MiB transfer RSS. After worker closure and GC, used parent heap fell to 9.7 MiB; resident memory remained approximately 421 MiB. Resident allocation remaining with the runtime is not itself proof of retained live game data. Repeated-game load measurements are reported separately.

## Findings and fixes

- Both repository examples imported successfully. The earlier base-example capacity failure did not recur under the required Node runtime.
- Equal file sizes can have materially different memory costs: many small answer objects consume more heap than fewer long strings. The byte ceiling alone is not the memory policy.
- The existing 10 MiB ceiling, worker heap limit, timeout, and capacity guards were retained. The measured valid shapes did not justify increasing them.
- An initial harness version generated its fixture inside the measured child, polluting the baseline. Fixture generation was moved to the parent, and the whole measurement set was rerun. This was a measurement correction, not a product bug.

These fixtures cover representative and demanding shapes, not every possible valid JSON arrangement or heavily memory-constrained laptop. The importer may still correctly return a capacity error when host resources are insufficient. Existing import-route tests separately exercise invalid files and preservation of a prior lobby on rejection.
