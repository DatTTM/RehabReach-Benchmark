# RehabReach-Benchmark

Technical benchmark dataset accompanying the manuscript:

**"RehabReach: A Browser-Based Computer Vision Platform for Upper Limb Rehabilitation"**

This repository contains the technical benchmarking data collected during the development and evaluation of the RehabReach system.

The repository includes:

- JSON summary files
- Time-series CSV logs
- Benchmark tables
- Figures used in the manuscript
- Performance monitoring source code

---

## Benchmark Protocol

### Hardware

- Apple MacBook Air M1
- Apple Mac mini M4
- Windows laptop (AMD Ryzen)

### Software

- Google Chrome
- Camera resolution: 1280 × 720
- Camera frame rate: 30 fps

### Tasks

Four representative rehabilitation tasks were evaluated:

- Table Wipe
- Target
- Ball Drop
- Fish Hunt

### Protocol

- Duration: 1 minute per task
- Warm-up period: first 5 seconds excluded
- One benchmark session per task on each platform

### Performance Metrics

- Rendering FPS
- Tracking availability
- MediaPipe inference time
- End-to-end latency
- JavaScript heap memory

**No patient data are included in this repository. All benchmark data were collected using technical evaluation sessions.**
---

## License

MIT License
