// ---------------------------------------------------------------------------
// RPC Request Analytics — in-memory ring buffer for tracking RPC usage
// ---------------------------------------------------------------------------

export interface RequestRecord {
  method: string;
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

export interface MethodStats {
  count: number;
  avgLatency: number;
  errorCount: number;
  lastCalled: number;
}

export interface AnalyticsSummary {
  totalRequests: number;
  methodBreakdown: Record<string, MethodStats>;
  recentRequests: RequestRecord[];
}

class RpcAnalytics {
  private buffer: RequestRecord[];
  private head = 0;
  private size = 0;
  private readonly capacity: number;

  constructor(capacity = 10_000) {
    this.capacity = capacity;
    this.buffer = new Array<RequestRecord>(capacity);
  }

  /**
   * Record a completed RPC request.
   */
  record(method: string, latencyMs: number, success: boolean): void {
    const record: RequestRecord = {
      method,
      timestamp: Date.now(),
      latencyMs,
      success,
    };

    this.buffer[this.head] = record;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Get all stored records ordered from oldest to newest.
   */
  private getAllRecords(): RequestRecord[] {
    if (this.size === 0) return [];

    if (this.size < this.capacity) {
      // Buffer hasn't wrapped yet — records are 0..size-1
      return this.buffer.slice(0, this.size);
    }

    // Buffer has wrapped — oldest is at `head`, newest at `head - 1`
    return [
      ...this.buffer.slice(this.head, this.capacity),
      ...this.buffer.slice(0, this.head),
    ];
  }

  /**
   * Return a full analytics summary.
   */
  getStats(): AnalyticsSummary {
    const all = this.getAllRecords();

    const methodBreakdown: Record<string, MethodStats> = {};

    for (const rec of all) {
      let entry = methodBreakdown[rec.method];
      if (!entry) {
        entry = { count: 0, avgLatency: 0, errorCount: 0, lastCalled: 0 };
        methodBreakdown[rec.method] = entry;
      }
      entry.count++;
      // Running sum stored in avgLatency temporarily
      entry.avgLatency += rec.latencyMs;
      if (!rec.success) entry.errorCount++;
      if (rec.timestamp > entry.lastCalled) entry.lastCalled = rec.timestamp;
    }

    // Convert summed latency to averages
    for (const entry of Object.values(methodBreakdown)) {
      if (entry.count > 0) {
        entry.avgLatency = Math.round(entry.avgLatency / entry.count);
      }
    }

    // Last 100 records (most recent first)
    const recentRequests = all.slice(-100).reverse();

    return {
      totalRequests: all.length,
      methodBreakdown,
      recentRequests,
    };
  }

  /**
   * Return detailed stats for a single method.
   */
  getMethodStats(method: string): MethodStats & { recentRequests: RequestRecord[] } {
    const all = this.getAllRecords();
    const filtered = all.filter((r) => r.method === method);

    let totalLatency = 0;
    let errorCount = 0;
    let lastCalled = 0;

    for (const rec of filtered) {
      totalLatency += rec.latencyMs;
      if (!rec.success) errorCount++;
      if (rec.timestamp > lastCalled) lastCalled = rec.timestamp;
    }

    return {
      count: filtered.length,
      avgLatency: filtered.length > 0 ? Math.round(totalLatency / filtered.length) : 0,
      errorCount,
      lastCalled,
      recentRequests: filtered.slice(-50).reverse(),
    };
  }
}

/** Singleton analytics instance shared across the application. */
export const rpcAnalytics = new RpcAnalytics();
