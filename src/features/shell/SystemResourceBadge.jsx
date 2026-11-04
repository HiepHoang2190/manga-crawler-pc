import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';

/**
 * SystemResourceBadge
 * Hiển thị chỉ số RAM & CPU ở thanh Footer.
 * Mỗi chip có data-tooltip riêng. GlobalTooltip chỉ hiện hộp của chip đang hover.
 */
export default function SystemResourceBadge({ className = '' }) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState({
    ramUsedGB: 0,
    ramTotalGB: 0,
    ramPercent: 0,
    cpuPercent: 0,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetchMetrics() {
      if (typeof window !== 'undefined' && window.electronAPI?.getSystemMetrics) {
        try {
          const res = await window.electronAPI.getSystemMetrics();
          if (mountedRef.current && res && res.ok) {
            setMetrics({
              ramUsedGB: res.ramUsedGB || 0,
              ramTotalGB: res.ramTotalGB || 0,
              ramPercent: res.ramPercent || 0,
              cpuPercent: res.cpuPercent || 0,
            });
          }
        } catch {
          // Ignore transient error
        }
      }
    }

    // Initial fetch
    fetchMetrics();
    // Poll every 2.5s
    const timer = setInterval(fetchMetrics, 2500);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const ramDetail = t('statusBar.ramUsage', {
    ramPercent: metrics.ramPercent,
    ramUsed: metrics.ramUsedGB.toFixed(1),
    ramTotal: metrics.ramTotalGB.toFixed(1),
  });
  const cpuDetail = t('statusBar.cpuUsage', {
    cpuPercent: metrics.cpuPercent,
  });

  return (
    <div className={`relative inline-flex items-center gap-1.5 select-none ${className}`}>
      {/* RAM Badge */}
      <div
        className="h-6 px-2.5 rounded-full bg-surface-container-high/70 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1.5 cursor-default shadow-2xs"
        data-tooltip={ramDetail}
        aria-label={ramDetail}
      >
        {/* RAM memory stick icon */}
        <svg
          className="w-3.5 h-3.5 shrink-0 opacity-80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <line x1="6" y1="18" x2="6" y2="21" />
          <line x1="10" y1="18" x2="10" y2="21" />
          <line x1="14" y1="18" x2="14" y2="21" />
          <line x1="18" y1="18" x2="18" y2="21" />
          <line x1="6" y1="3" x2="6" y2="6" />
          <line x1="10" y1="3" x2="10" y2="6" />
          <line x1="14" y1="3" x2="14" y2="6" />
          <line x1="18" y1="3" x2="18" y2="6" />
          <line x1="7" y1="10" x2="7" y2="14" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <line x1="17" y1="10" x2="17" y2="14" />
        </svg>
        <span className="font-mono text-[11px] font-medium leading-none">
          {metrics.ramPercent}%
        </span>
      </div>

      {/* CPU Badge */}
      <div
        className="h-6 px-2.5 rounded-full bg-surface-container-high/70 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1.5 cursor-default shadow-2xs"
        data-tooltip={cpuDetail}
        aria-label={cpuDetail}
      >
        {/* CPU processor chip icon */}
        <svg
          className="w-3.5 h-3.5 shrink-0 opacity-80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="15" x2="23" y2="15" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="15" x2="4" y2="15" />
        </svg>
        <span className="font-mono text-[11px] font-medium leading-none">
          {metrics.cpuPercent}%
        </span>
      </div>
    </div>
  );
}
