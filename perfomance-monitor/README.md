# Performance Monitor

## Overview

`performance_monitor.js` is the technical benchmarking module of the **RehabReach** rehabilitation system.

It provides lightweight, real-time monitoring of computational performance during vision-based rehabilitation sessions and was developed to support the technical evaluation reported in our scientific publications.

The module is independent of the clinical validation logger (`validation_logger.js`) and focuses exclusively on system-level performance.

---

## Objectives

The logger was designed to:

- Monitor real-time computational performance
- Benchmark computer vision execution across different hardware platforms
- Generate reproducible technical results for publication
- Export standardized JSON and CSV reports

---

## Features

### Rendering Performance

- Render FPS
- Frame time
- Dropped frame percentage

### Tracking Performance

- Tracking availability
- Tracking loss events
- Tracking recovery time
- MediaPipe inference time

### Pipeline Performance

- End-to-end latency

### Memory Usage

- Mean JS Heap
- Peak JS Heap

### Hardware Information

- Browser
- Operating system
- CPU cores
- Device memory
- Camera resolution
- Camera FPS
- GPU renderer (WebGL)

---

## Design Principles

- Zero-allocation runtime statistics
- Welford Online Statistics algorithm
- Constant memory complexity (O(1))
- Constant computational complexity (O(1))
- Warm-up period exclusion (first 5 seconds)
- No dependency on clinical outcome measures

---

## Export Formats

### JSON

Provides summary statistics suitable for scientific reporting.

Example:

- Mean Render FPS
- Tracking Availability
- MediaPipe Inference Time
- End-to-End Latency
- Heap Memory

---

### CSV

Exports one sample per second for time-series analysis.

Columns include:

```
elapsedSec
fps
tracking
latency
heap
```

This file can be directly imported into:

- Microsoft Excel
- R
- Python (Pandas)
- MATLAB

for further statistical analysis and visualization.

---

## Intended Use

This module is intended for:

- Technical benchmarking
- Cross-platform comparison
- Performance optimization
- Scientific publications

It is **not intended** for clinical decision making.

---

## Related Modules

| Module | Purpose |
|---------|---------|
| validation_logger.js | Clinical interaction validation (EADMR, gesture confidence, execution metrics) |
| performance_monitor.js | Technical benchmarking and computational performance |

---

## License

Released as part of the RehabReach research project.

If used in academic work, please cite the associated publication.
