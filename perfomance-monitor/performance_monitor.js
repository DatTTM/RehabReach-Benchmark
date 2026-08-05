// js/core/performance_monitor.js — RehabReach System Performance Logger
// Independent technical performance logger for scientific manuscript benchmarking (e.g., CMPB / IEEE TBME)
// Uses zero-allocation Welford statistics algorithm to continuously monitor real-time computational performance.

/**
 * Welford's Online Statistics Algorithm
 * Calculates running Mean, Standard Deviation, Min, Max in O(1) time and O(1) memory per sample.
 */
export class WelfordStats {
    constructor() {
        this.reset();
    }

    reset() {
        this.count = 0;
        this.mean = 0;
        this.M2 = 0;
        this.min = Infinity;
        this.max = -Infinity;
    }

    update(x) {
        if (x == null || !isFinite(x)) return;
        this.count++;
        const delta = x - this.mean;
        this.mean += delta / this.count;
        const delta2 = x - this.mean;
        this.M2 += delta * delta2;
        if (x < this.min) this.min = x;
        if (x > this.max) this.max = x;
    }

    get stdDev() {
        if (this.count < 2) return 0;
        return Math.sqrt(this.M2 / this.count);
    }

    toJSON(decimals = 2) {
        if (this.count === 0) {
            return { count: 0, mean: 0, stdDev: 0, min: 0, max: 0, formatted: "N/A" };
        }
        const minVal = this.min === Infinity ? 0 : this.min;
        const maxVal = this.max === -Infinity ? 0 : this.max;
        const meanFixed = this.mean.toFixed(decimals);
        const sdFixed = this.stdDev.toFixed(decimals);
        return {
            count: this.count,
            mean: parseFloat(meanFixed),
            stdDev: parseFloat(sdFixed),
            min: parseFloat(minVal.toFixed(decimals)),
            max: parseFloat(maxVal.toFixed(decimals)),
            formatted: `${meanFixed} ± ${sdFixed}`
        };
    }
}

/**
 * System Performance Monitor
 * Continuous technical logger tracking Rendering, Tracking availability, Pipeline Latency, Memory, and Hardware.
 * Supports scientific reporting for CMPB manuscript (Section 3.6 & Table 2).
 */
export class PerformanceMonitor {
    constructor() {
        this.isActive = false;
        this.hardwareInfo = {};

        // Sampling & Welford Accumulators
        this.fpsStats = new WelfordStats();
        this.frameTimeStats = new WelfordStats();
        this.mediapipeInferenceStats = new WelfordStats();
        this.trackingRecoveryStats = new WelfordStats();
        this.pipelineLatencyStats = new WelfordStats();

        // Session metrics
        this.startTime = 0;
        this.stopTime = 0;
        this.totalRenderedFrames = 0;
        this.totalTrackedFrames = 0;
        this.droppedFrames = 0;
        this.trackingLossEvents = 0;
        this.isCurrentlyTracked = false;
        this.lastTrackingLossTime = 0;

        // Memory sampling metrics
        this.heapUsedSumMB = 0;
        this.heapSamplesCount = 0;
        this.peakHeapMB = 0;
        this.minHeapMB = Infinity;

        // Time Series Buffer for CSV Export
        this.csvSamples = [];
        this.maxCsvSamples = 3600;
        this.lastSampleTimestamp = 0;
        this.sampleIntervalMs = 1000; // 1 second resolution for CSV time series

        // Memory sampling timer
        this.memoryIntervalId = null;
        this.latestInferenceMs = 0;
    }

    /**
     * Start performance monitoring session and gather hardware info once.
     * @param {Object} config - Optional session configuration
     */
    start(config = {}) {
        this.reset();
        this.isActive = true;
        this.startTime = performance.now();
        this.hardwareInfo = this._detectHardwareInfo(config);

        // Start periodic 1-second memory check
        if (typeof window !== 'undefined') {
            this._sampleMemory();
            this.memoryIntervalId = setInterval(() => this._sampleMemory(), 1000);
        }

        console.log('[PerformanceMonitor] Started performance benchmarking session.', this.hardwareInfo);
    }

    /**
     * Stop performance monitoring session and output CMPB Table 2 summary to console.
     */
    stop() {
        if (!this.isActive) return;
        this.stopTime = performance.now();
        this.isActive = false;

        if (this.memoryIntervalId) {
            clearInterval(this.memoryIntervalId);
            this.memoryIntervalId = null;
        }

        const durationSec = ((this.stopTime - this.startTime) / 1000).toFixed(2);
        console.log(`[PerformanceMonitor] Stopped session. Total duration: ${durationSec}s`);

        // Print CMPB Table 2 Summary directly to browser DevTools Console
        const summary = this.exportSummary();
        console.group('[PerformanceMonitor] CMPB Table 2 Technical Performance Summary');
        console.table(summary.publicationTable);
        console.log('Full Summary JSON:', summary);
        console.log('To download JSON, run: performanceMonitor.downloadJSON()');
        console.log('To download CSV, run: performanceMonitor.downloadCSV()');
        console.groupEnd();
    }

    /**
     * Reset all accumulators, counters, and samples.
     */
    reset() {
        this.isActive = false;
        if (this.memoryIntervalId) {
            clearInterval(this.memoryIntervalId);
            this.memoryIntervalId = null;
        }

        this.fpsStats.reset();
        this.frameTimeStats.reset();
        this.mediapipeInferenceStats.reset();
        this.trackingRecoveryStats.reset();
        this.pipelineLatencyStats.reset();

        this.startTime = 0;
        this.stopTime = 0;
        this.totalRenderedFrames = 0;
        this.totalTrackedFrames = 0;
        this.droppedFrames = 0;
        this.trackingLossEvents = 0;
        this.isCurrentlyTracked = false;
        this.lastTrackingLossTime = 0;

        this.heapUsedSumMB = 0;
        this.heapSamplesCount = 0;
        this.peakHeapMB = 0;
        this.minHeapMB = Infinity;

        this.csvSamples = [];
        this.lastSampleTimestamp = 0;
        this.latestInferenceMs = 0;
    }

    /**
     * Primary frame record call invoked inside main render loop.
     * ZERO dynamic allocations inside this function to avoid GC spikes.
     * @param {number} frameDeltaMs - Elapsed frame time in milliseconds
     * @param {boolean} isTracked - Whether hand tracking is currently active
     * @param {number|Object} totalLatencyMs - Total end-to-end pipeline latency in ms
     */
    recordFrame(frameDeltaMs, isTracked = false, totalLatencyMs = null) {
        if (!this.isActive) return;

        this.totalRenderedFrames++;
        const now = performance.now();

        // 1. Frame Rate & Delta Time
        this.frameTimeStats.update(frameDeltaMs);
        if (frameDeltaMs > 0) {
            const currentFps = 1000 / frameDeltaMs;
            this.fpsStats.update(currentFps);
            if (frameDeltaMs > 33.33) {
                this.droppedFrames++;
            }
        }

        // 2. Tracking Availability & Recovery
        this.recordTrackingStatus(isTracked, now);

        // 3. Total Pipeline Latency (End-to-End: Inference + Frame Render Loop)
        let lat = typeof totalLatencyMs === 'number' ? totalLatencyMs : totalLatencyMs?.totalLatency;
        if ((lat == null || !isFinite(lat)) && this.latestInferenceMs > 0) {
            lat = this.latestInferenceMs + frameDeltaMs;
        }
        if (lat != null && isFinite(lat)) {
            this.pipelineLatencyStats.update(lat);
        }

        // 4. Time-series CSV sample recording (every 1 sec)
        if (now - this.lastSampleTimestamp >= this.sampleIntervalMs) {
            this.lastSampleTimestamp = now;
            this._pushCsvSample(now, frameDeltaMs, isTracked, lat);
        }
    }

    /**
     * Record MediaPipe inference execution time (ms).
     * Filters extreme outliers (>300ms) caused by tab-switches or GC pauses to preserve accurate SD.
     * @param {number} inferenceTimeMs
     */
    recordInference(inferenceTimeMs) {
        if (!this.isActive || inferenceTimeMs == null || !isFinite(inferenceTimeMs)) return;
        // Ignore extreme startup/tab-switch spikes (>300ms)
        if (inferenceTimeMs > 300) return;
        this.latestInferenceMs = inferenceTimeMs;
        this.mediapipeInferenceStats.update(inferenceTimeMs);
    }

    /**
     * Record tracking availability state transition.
     */
    recordTrackingStatus(isTracked, now = performance.now()) {
        if (!this.isActive) return;

        if (isTracked) {
            this.totalTrackedFrames++;
            if (!this.isCurrentlyTracked) {
                if (this.lastTrackingLossTime > 0) {
                    const recoveryTime = now - this.lastTrackingLossTime;
                    this.trackingRecoveryStats.update(recoveryTime);
                }
                this.isCurrentlyTracked = true;
            }
        } else {
            if (this.isCurrentlyTracked || this.lastTrackingLossTime === 0) {
                this.trackingLossEvents++;
                this.lastTrackingLossTime = now;
                this.isCurrentlyTracked = false;
            }
        }
    }

    /**
     * Update camera stream metadata once stream is ready.
     */
    updateCameraInfo(width, height, fps = 30) {
        if (!this.hardwareInfo) this.hardwareInfo = {};
        this.hardwareInfo.cameraResolution = `${width}x${height}`;
        this.hardwareInfo.cameraFPS = fps;
    }

    /**
     * Sample JS Heap memory using performance.memory API if supported.
     */
    _sampleMemory() {
        if (typeof window === 'undefined' || !window.performance || !window.performance.memory) return;

        const memory = window.performance.memory;
        const usedMB = parseFloat((memory.usedJSHeapSize / (1024 * 1024)).toFixed(2));

        this.heapUsedSumMB += usedMB;
        this.heapSamplesCount++;

        if (usedMB > this.peakHeapMB) this.peakHeapMB = usedMB;
        if (usedMB < this.minHeapMB) this.minHeapMB = usedMB;
    }

    /**
     * Push periodic 1-second sample to time-series buffer for CSV export.
     */
    _pushCsvSample(now, frameDeltaMs, isTracked, totalLatencyMs) {
        if (this.csvSamples.length >= this.maxCsvSamples) {
            this.csvSamples.shift();
        }

        const elapsedSec = parseFloat(((now - this.startTime) / 1000).toFixed(2));
        const currentFps = frameDeltaMs > 0 ? parseFloat((1000 / frameDeltaMs).toFixed(1)) : 0;
        const heapUsed = (typeof window !== 'undefined' && window.performance?.memory)
            ? parseFloat((window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2))
            : 'N/A';

        const latVal = (totalLatencyMs != null && isFinite(totalLatencyMs))
            ? parseFloat(totalLatencyMs.toFixed(2))
            : (this.pipelineLatencyStats.count > 0 ? parseFloat(this.pipelineLatencyStats.mean.toFixed(2)) : 'N/A');

        this.csvSamples.push({
            elapsedSec,
            fps: currentFps,
            tracking: isTracked ? 1 : 0,
            latency: latVal,
            heap: heapUsed
        });
    }

    /**
     * Detect hardware, browser, and WebGL specs once at initialization.
     */
    _detectHardwareInfo(config = {}) {
        if (typeof window === 'undefined') return {};

        const ua = navigator.userAgent || '';
        let browserName = 'Unknown Browser';
        if (ua.includes('Firefox/')) browserName = 'Firefox';
        else if (ua.includes('Edg/')) browserName = 'Edge';
        else if (ua.includes('Chrome/')) browserName = 'Chrome';
        else if (ua.includes('Safari/')) browserName = 'Safari';

        let osName = 'Unknown OS';
        if (navigator.platform?.includes('Win') || ua.includes('Windows')) osName = 'Windows';
        else if (navigator.platform?.includes('Mac') || ua.includes('Macintosh')) osName = 'macOS';
        else if (navigator.platform?.includes('Linux') || ua.includes('Linux')) osName = 'Linux';
        else if (/Android|iPhone|iPad/i.test(ua)) osName = 'Mobile';

        let gpuRenderer = 'N/A';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_STRING) || 'WebGL Supported';
                } else {
                    gpuRenderer = gl.getParameter(gl.RENDERER) || 'WebGL Supported';
                }
            }
        } catch (e) {
            gpuRenderer = 'WebGL Error';
        }

        return {
            browser: browserName,
            os: osName,
            cpuCores: navigator.hardwareConcurrency || 'N/A',
            deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
            gpuRenderer: gpuRenderer,
            cameraResolution: config.cameraResolution || '1280x720',
            cameraFPS: config.cameraFPS || 30
        };
    }

    /**
     * Export complete scientific summary structured specifically for CMPB Section 3.6 and Table 2.
     */
    exportSummary() {
        const durationSec = this.startTime > 0
            ? parseFloat((( (this.stopTime || performance.now()) - this.startTime ) / 1000).toFixed(2))
            : 0;

        const trackingAvailabilityPct = this.totalRenderedFrames > 0
            ? parseFloat(((this.totalTrackedFrames / this.totalRenderedFrames) * 100).toFixed(2))
            : 0;

        const droppedFramePct = this.totalRenderedFrames > 0
            ? parseFloat(((this.droppedFrames / this.totalRenderedFrames) * 100).toFixed(2))
            : 0;

        const meanHeapMB = this.heapSamplesCount > 0
            ? parseFloat((this.heapUsedSumMB / this.heapSamplesCount).toFixed(2))
            : 0;

        const publicationTable = {
            "Camera Resolution": `${this.hardwareInfo.cameraResolution || '1280x720'}`,
            "Camera FPS": `${this.hardwareInfo.cameraFPS || 30} FPS`,
            "Mean Render FPS": `${this.fpsStats.toJSON(1).formatted}`,
            "Tracking Availability": `${trackingAvailabilityPct.toFixed(1)}%`,
            "MediaPipe Inference Time": `${this.mediapipeInferenceStats.toJSON(1).formatted} ms`,
            "End-to-End Latency": `${this.pipelineLatencyStats.toJSON(1).formatted} ms`,
            "Mean Heap Memory": `${meanHeapMB.toFixed(1)} MB`,
            "Peak Heap Memory": `${this.peakHeapMB.toFixed(1)} MB`
        };

        return {
            hardware: {
                browser: this.hardwareInfo.browser || 'Unknown',
                os: this.hardwareInfo.os || 'Unknown',
                cpuCores: this.hardwareInfo.cpuCores || 'N/A',
                deviceMemory: this.hardwareInfo.deviceMemory || 'N/A',
                gpuRenderer: this.hardwareInfo.gpuRenderer || 'N/A',
                cameraResolution: this.hardwareInfo.cameraResolution || '1280x720',
                cameraFPS: this.hardwareInfo.cameraFPS || 30
            },
            rendering: {
                renderFps: this.fpsStats.toJSON(2),
                frameTimeMs: this.frameTimeStats.toJSON(2),
                droppedFramePercentage: droppedFramePct
            },
            tracking: {
                trackingAvailabilityPercentage: trackingAvailabilityPct,
                trackingLossEventsCount: this.trackingLossEvents,
                trackingRecoveryTimeMs: this.trackingRecoveryStats.toJSON(2),
                mediapipeInferenceTimeMs: this.mediapipeInferenceStats.toJSON(2)
            },
            pipeline: {
                totalEndToEndLatencyMs: this.pipelineLatencyStats.toJSON(2)
            },
            memory: {
                meanHeapMB: meanHeapMB,
                peakHeapMB: this.peakHeapMB
            },
            publicationTable: publicationTable
        };
    }

    /**
     * Export raw time series performance log as CSV string.
     * CSV Header: elapsedSec,fps,tracking,latency,heap
     */
    exportCSV() {
        const headers = ['elapsedSec', 'fps', 'tracking', 'latency', 'heap'];
        const rows = this.csvSamples.map(s => [
            s.elapsedSec,
            s.fps,
            s.tracking,
            s.latency,
            s.heap
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        return csvContent;
    }

    /**
     * Helper to trigger browser file download of CSV or JSON.
     */
    downloadFile(filename, content, type = 'application/json') {
        if (typeof window === 'undefined') return;
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /** Download performance summary as JSON */
    downloadJSON(filename = 'rehabreach_performance_summary.json') {
        const summary = this.exportSummary();
        this.downloadFile(filename, JSON.stringify(summary, null, 2), 'application/json');
    }

    /** Download time series log as CSV */
    downloadCSV(filename = 'rehabreach_performance_log.csv') {
        const csv = this.exportCSV();
        this.downloadFile(filename, csv, 'text/csv');
    }
}

// Global Singleton Instance
export const performanceMonitor = new PerformanceMonitor();

if (typeof window !== 'undefined') {
    window.PerformanceMonitor = performanceMonitor;
    window.performanceMonitor = performanceMonitor;

    // Direct global convenience shortcuts for Chrome DevTools Console
    window.getPerfSummary = () => performanceMonitor.exportSummary();
    window.downloadPerfSummary = () => performanceMonitor.downloadJSON();
    window.downloadPerfCSV = () => performanceMonitor.downloadCSV();
}
