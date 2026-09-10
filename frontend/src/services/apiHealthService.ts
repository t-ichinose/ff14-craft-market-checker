/**
 * Universalis API Health & Latency Monitoring Service
 * 
 * パッシブ監視 (実通信のレイテンシ傍受) と
 * アクティブProbe (無操作時の軽量エンドポイント死活監視) を組み合わせた
 * 高精度・低負荷な通信状態可視化サービス
 */

import { useState, useEffect } from 'react';

export type ApiHealthStatus = 'excellent' | 'good' | 'slow' | 'down' | 'limited' | 'checking';

export interface ApiCallLog {
  timestamp: number;
  latencyMs: number;
  statusCode: number;
  endpoint: string;
}

export interface ApiHealthInfo {
  latencyMs: number;
  status: ApiHealthStatus;
  label: string;
  badgeText: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  lastCheckedAt: number;
  history: ApiCallLog[];
}

const PROBE_URL = 'https://universalis.app/api/v2/data-centers';
const MAX_HISTORY = 10;
const PROBE_INTERVAL_MS = 60 * 1000; // 無操作時の定期プローブ間隔 (60秒)

function evaluateHealth(latencyMs: number, statusCode: number): {
  status: ApiHealthStatus;
  label: string;
  badgeText: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
} {
  if (statusCode >= 500 || statusCode === 0) {
    const codeLabel = statusCode === 0 ? 'タイムアウト' : `HTTP ${statusCode}`;
    return {
      status: 'down',
      label: `障害発生中 (${codeLabel})`,
      badgeText: codeLabel,
      color: '#f87171',
      bgColor: 'rgba(239, 68, 68, 0.15)',
      borderColor: 'rgba(239, 68, 68, 0.4)',
      icon: 'fa-solid fa-circle-xmark',
    };
  }

  if (statusCode === 429) {
    return {
      status: 'limited',
      label: 'レートリミット到達 (一時待機)',
      badgeText: '429 制限中',
      color: '#fb923c',
      bgColor: 'rgba(251, 146, 60, 0.15)',
      borderColor: 'rgba(251, 146, 60, 0.4)',
      icon: 'fa-solid fa-triangle-exclamation',
    };
  }

  const rounded = Math.round(latencyMs);

  if (latencyMs < 600) {
    return {
      status: 'excellent',
      label: `快適・高速 (${rounded}ms)`,
      badgeText: `${rounded}ms`,
      color: '#4ade80',
      bgColor: 'rgba(74, 222, 128, 0.15)',
      borderColor: 'rgba(74, 222, 128, 0.35)',
      icon: 'fa-solid fa-bolt',
    };
  }

  if (latencyMs < 1500) {
    return {
      status: 'good',
      label: `通常・安定 (${rounded}ms)`,
      badgeText: `${rounded}ms`,
      color: '#38bdf8',
      bgColor: 'rgba(56, 189, 248, 0.15)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      icon: 'fa-solid fa-circle-check',
    };
  }

  return {
    status: 'slow',
    label: `遅延・混雑中 (${rounded}ms)`,
    badgeText: `${rounded}ms`,
    color: '#ffb703',
    bgColor: 'rgba(255, 183, 3, 0.15)',
    borderColor: 'rgba(255, 183, 3, 0.4)',
    icon: 'fa-solid fa-clock',
  };
}

class ApiHealthManager {
  private currentHealth: ApiHealthInfo = {
    latencyMs: 0,
    status: 'checking',
    label: 'Universalis 接続確認中...',
    badgeText: '接続中',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
    icon: 'fa-solid fa-spinner fa-spin',
    lastCheckedAt: 0,
    history: [],
  };

  private listeners: Set<(info: ApiHealthInfo) => void> = new Set();
  private probeTimer: any = null;
  private isProbing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      setTimeout(() => this.checkApiProbe(), 500);
      this.startProbeLoop();
    }
  }

  public getHealth(): ApiHealthInfo {
    return this.currentHealth;
  }

  public subscribe(listener: (info: ApiHealthInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentHealth);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 実際のUniversalis通信結果を記録 (パッシブ監視)
   */
  public recordApiCall(url: string, durationMs: number, statusCode: number) {
    const cleanUrl = url.replace('https://universalis.app/api/v2/', '').split('?')[0];
    const log: ApiCallLog = {
      timestamp: Date.now(),
      latencyMs: durationMs,
      statusCode,
      endpoint: cleanUrl,
    };

    const newHistory = [log, ...this.currentHealth.history].slice(0, MAX_HISTORY);

    const recentValid = newHistory.filter((h) => h.statusCode >= 200 && h.statusCode < 400);
    const avgLatency = recentValid.length > 0
      ? recentValid.reduce((sum, h) => sum + h.latencyMs, 0) / recentValid.length
      : durationMs;

    const evaluation = evaluateHealth(avgLatency, statusCode);

    this.currentHealth = {
      latencyMs: Math.round(avgLatency),
      ...evaluation,
      lastCheckedAt: Date.now(),
      history: newHistory,
    };

    this.notify();
  }

  /**
   * 超軽量エンドポイント (/api/v2/data-centers) を叩くアクティブProbe
   */
  public async checkApiProbe(): Promise<void> {
    if (this.isProbing) return;
    this.isProbing = true;

    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(PROBE_URL, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);

      const t1 = performance.now();
      const durationMs = t1 - t0;

      this.recordApiCall('probe:data-centers', durationMs, res.status);
    } catch (err: any) {
      const t1 = performance.now();
      const durationMs = t1 - t0;
      const isAbort = err?.name === 'AbortError';
      this.recordApiCall('probe:data-centers', durationMs, isAbort ? 0 : 500);
    } finally {
      this.isProbing = false;
    }
  }

  private startProbeLoop() {
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = setInterval(() => {
      if (Date.now() - this.currentHealth.lastCheckedAt > 45000) {
        this.checkApiProbe();
      }
    }, PROBE_INTERVAL_MS);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentHealth);
      } catch (err) {
        console.error('Error in ApiHealthListener:', err);
      }
    }
  }
}

export const apiHealthManager = new ApiHealthManager();

export function useApiHealth(): {
  health: ApiHealthInfo;
  checkProbe: () => Promise<void>;
} {
  const [health, setHealth] = useState<ApiHealthInfo>(() => apiHealthManager.getHealth());

  useEffect(() => {
    return apiHealthManager.subscribe((info) => {
      setHealth(info);
    });
  }, []);

  return {
    health,
    checkProbe: () => apiHealthManager.checkApiProbe(),
  };
}
