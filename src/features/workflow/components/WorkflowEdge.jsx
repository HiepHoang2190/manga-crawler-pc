import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { PORT_COLORS } from '../engine/nodeDefinitions';

export default function WorkflowEdge({
  edge,
  sourcePos,
  targetPos,
  sourceType = 'any',
  isRunning = false,
  isSelected = false,
  onSelect,
  onDelete,
}) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);

  if (!sourcePos || !targetPos) return null;

  const x1 = sourcePos.x;
  const y1 = sourcePos.y;
  const x2 = targetPos.x;
  const y2 = targetPos.y;

  const sourceSide = sourcePos.side || 'right';
  const targetSide = targetPos.side || 'left';

  const baseDx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
  const isSameSide = sourceSide === targetSide;
  const loopDx = isSameSide ? Math.max(baseDx, Math.abs(y2 - y1) * 0.35, 60) : baseDx;

  const cp1X = sourceSide === 'right' ? x1 + loopDx : x1 - loopDx;
  const cp2X = targetSide === 'left' ? x2 - loopDx : x2 + loopDx;

  const pathData = `M ${x1} ${y1} C ${cp1X} ${y1}, ${cp2X} ${y2}, ${x2} ${y2}`;
  const midX = 0.125 * x1 + 0.375 * cp1X + 0.375 * cp2X + 0.125 * x2;
  const midY = 0.125 * y1 + 0.375 * y1 + 0.375 * y2 + 0.125 * y2;

  const color = PORT_COLORS[sourceType] || PORT_COLORS.any;

  return (
    <g
      data-testid="workflow-edge"
      data-edge-id={edge.id}
      className="cursor-pointer group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect && onSelect(edge.id);
      }}
    >
      {/* Invisible thick hit-box for easier clicking */}
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={24} />

      {/* Background shadow stroke */}
      <path
        d={pathData}
        fill="none"
        stroke="rgba(100, 116, 139, 0.25)"
        strokeWidth={isSelected ? 6 : 4}
        strokeLinecap="round"
      />

      {/* Main colored bezier curve */}
      <path
        d={pathData}
        fill="none"
        stroke={isSelected ? '#3b82f6' : color}
        strokeWidth={isSelected ? 3 : 2}
        strokeLinecap="round"
        className="transition-all duration-200"
        opacity={isHovered || isSelected ? 1 : 0.85}
      />

      {/* Running pulse particle animation */}
      {isRunning && (
        <path
          d={pathData}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeDasharray="6 14"
          className="animate-[dash_1s_linear_infinite]"
        />
      )}

      {/* Delete button at center of curve when hovered or selected */}
      {(isHovered || isSelected) && (
        <g
          transform={`translate(${midX}, ${midY})`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete && onDelete(edge.id);
          }}
          className="cursor-pointer"
          data-tooltip={t('workflow.edge.delete')}
          aria-label={t('workflow.edge.delete')}
        >
          <circle r={10} fill="#ffffff" className="dark:fill-[#1e1e1e]" stroke="#ef4444" strokeWidth={1.5} />
          <text
            y={3.5}
            textAnchor="middle"
            fill="#ef4444"
            fontSize={12}
            fontWeight="bold"
            className="select-none pointer-events-none"
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}
