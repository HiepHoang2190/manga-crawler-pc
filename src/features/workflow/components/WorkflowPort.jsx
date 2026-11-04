import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { PORT_COLORS, PORT_TYPE_LABELS } from '../engine/nodeDefinitions';
import { isPortCompatible } from '../engine/workflowGraph';

export default function WorkflowPort({
  nodeId,
  port,
  isOutput = false,
  isReversed = false,
  onStartConnect,
  onCompleteConnect,
  onCancelConnect,
  onDisconnectPort,
  onConnectError,
  connecting = null,
  isConnected = false,
}) {
  const { t } = useI18n();
  const isVisualRight = isReversed ? !isOutput : isOutput;
  const color = PORT_COLORS[port.type] || PORT_COLORS.any;
  const typeLabel = t(`workflow.portType.${port.type}`, PORT_TYPE_LABELS[port.type] || port.type);

  // Check relationship to active connecting wire
  const isOriginPort = Boolean(
    connecting &&
    (connecting.fromType === 'input'
      ? connecting.targetNodeId === nodeId && connecting.targetHandle === port.id
      : connecting.sourceNodeId === nodeId && connecting.sourceHandle === port.id)
  );

  const isOriginNode = Boolean(
    connecting &&
    (connecting.fromType === 'input' ? connecting.targetNodeId === nodeId : connecting.sourceNodeId === nodeId)
  );

  const isOppositeDirection = connecting
    ? (isOutput ? 'output' : 'input') === (connecting.fromType === 'input' ? 'output' : 'input')
    : false;

  const isTypeCompatible = connecting
    ? isPortCompatible(
        connecting.fromType === 'input' ? port.type : connecting.sourceHandleType,
        connecting.fromType === 'input' ? connecting.targetHandleType : port.type
      )
    : false;

  const isCompatibleTarget = Boolean(connecting && !isOriginNode && isOppositeDirection && isTypeCompatible);
  const isIncompatibleTarget = Boolean(connecting && !isOriginPort && !isCompatibleTarget);

  const expectedType = connecting
    ? connecting.fromType === 'input'
      ? connecting.targetHandleType
      : connecting.sourceHandleType
    : null;
  const expectedTypeLabel = expectedType
    ? t(`workflow.portType.${expectedType}`, PORT_TYPE_LABELS[expectedType] || expectedType)
    : '';

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // If currently connecting wire:
    if (connecting) {
      if (isSamePort(connecting, nodeId, port.id)) {
        onCancelConnect && onCancelConnect();
        return;
      }

      // If clicking a compatible target: complete connection!
      if (isCompatibleTarget && onCompleteConnect) {
        if (connecting.fromType === 'input') {
          onCompleteConnect({
            source: nodeId,
            sourceHandle: port.id,
            target: connecting.targetNodeId,
            targetHandle: connecting.targetHandle,
          });
        } else {
          onCompleteConnect({
            source: connecting.sourceNodeId,
            sourceHandle: connecting.sourceHandle,
            target: nodeId,
            targetHandle: port.id,
          });
        }
        return;
      } else {
        // If clicked an incompatible port, inform user with clear toast
        if (isOriginNode) {
          onConnectError && onConnectError(t('workflow.port.errSameNode'));
        } else if (!isOppositeDirection) {
          onConnectError && onConnectError(t('workflow.port.errDirection'));
        } else {
          onConnectError &&
            onConnectError(
              t('workflow.port.errIncompatible', { type: typeLabel, expectedType: expectedTypeLabel })
            );
        }
        onCancelConnect && onCancelConnect();
        return;
      }
    }

    // Start a new connection (supports bi-directional: from Output -> Input or Input -> Output)
    if (onStartConnect) {
      if (isOutput) {
        onStartConnect({
          fromType: 'output',
          sourceNodeId: nodeId,
          sourceHandle: port.id,
          sourceHandleType: port.type,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      } else {
        onStartConnect({
          fromType: 'input',
          targetNodeId: nodeId,
          targetHandle: port.id,
          targetHandleType: port.type,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      }
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDisconnectPort) {
      onDisconnectPort(nodeId, port.id, isOutput);
    }
  };

  // Build helpful tooltip text
  let tooltipText = t('workflow.port.typePrefix', { type: typeLabel });
  if (connecting) {
    if (isOriginPort) {
      tooltipText = t('workflow.port.startWire');
    } else if (isCompatibleTarget) {
      tooltipText = t('workflow.port.validTarget', { type: typeLabel });
    } else if (isOriginNode) {
      tooltipText = t('workflow.port.errSameNodeTooltip');
    } else if (!isOppositeDirection) {
      tooltipText = isOutput ? t('workflow.port.errNeedInput') : t('workflow.port.errNeedOutput');
    } else {
      tooltipText = t('workflow.port.errIncompatibleTooltip', { thisType: typeLabel, expectedType: expectedTypeLabel });
    }
  } else if (isConnected) {
    tooltipText = t('workflow.port.connectedHint', { type: typeLabel });
  }

  return (
    <div
      data-port-id={port.id}
      data-port-type={port.type}
      data-node-id={nodeId}
      data-port-direction={isOutput ? 'output' : 'input'}
      className={`group relative flex items-center gap-1.5 py-1 text-[11px] transition-all ${
        isVisualRight ? 'justify-end' : 'justify-start'
      } ${
        isCompatibleTarget
          ? 'bg-primary/20 text-primary rounded-lg px-2 ring-1 ring-primary/50 shadow-sm'
          : isIncompatibleTarget
          ? 'opacity-30'
          : isOriginPort
          ? 'bg-primary/10 rounded-lg px-1 text-primary'
          : ''
      }`}
    >
      {!isVisualRight && (
        <div
          data-port-id={port.id}
          data-port-type={port.type}
          data-node-id={nodeId}
          data-port-direction={isOutput ? 'output' : 'input'}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          data-tooltip={tooltipText}
          aria-label={tooltipText}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all -ml-4 flex items-center justify-center shrink-0 ${
            isCompatibleTarget
              ? 'scale-150 border-primary ring-4 ring-primary/60 animate-pulse cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.8)]'
              : isIncompatibleTarget
              ? 'border-surface-container-lowest grayscale cursor-not-allowed opacity-40'
              : isOriginPort
              ? 'scale-125 border-primary ring-4 ring-primary/40'
              : isConnected
              ? 'border-surface-container-lowest ring-2 ring-primary/30 hover:scale-125 cursor-crosshair shadow-xs'
              : 'border-surface-container-lowest hover:scale-125 cursor-crosshair shadow-xs'
          }`}
          style={{ backgroundColor: color }}
        />
      )}

      <span className={`select-none transition-colors ${isCompatibleTarget ? 'font-bold text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
        {port.label}
      </span>

      {/* Target compatibility badge */}
      {isCompatibleTarget && (
        <span className="text-[9px] px-1 py-0.2 rounded-full bg-primary text-on-primary font-bold shadow-xs animate-pulse">
          {t('workflow.port.compatible')}
        </span>
      )}

      {isOriginPort && (
        <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-semibold">
          {t('workflow.port.origin')}
        </span>
      )}

      {isVisualRight && (
        <div
          data-port-id={port.id}
          data-port-type={port.type}
          data-node-id={nodeId}
          data-port-direction={isOutput ? 'output' : 'input'}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          data-tooltip={tooltipText}
          aria-label={tooltipText}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all -mr-4 flex items-center justify-center shrink-0 ${
            isCompatibleTarget
              ? 'scale-150 border-primary ring-4 ring-primary/60 animate-pulse cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.8)]'
              : isIncompatibleTarget
              ? 'border-surface-container-lowest grayscale cursor-not-allowed opacity-40'
              : isOriginPort
              ? 'scale-125 border-primary ring-4 ring-primary/40'
              : isConnected
              ? 'border-surface-container-lowest ring-2 ring-primary/30 hover:scale-125 cursor-crosshair shadow-xs'
              : 'border-surface-container-lowest hover:scale-125 cursor-crosshair shadow-xs'
          }`}
          style={{ backgroundColor: color }}
        />
      )}

      {/* Tooltip only when dragging a wire, positioned outside the node card */}
      {connecting && (
        <div
          className={`absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 px-2.5 py-1 rounded-lg border text-[10px] whitespace-nowrap shadow-xl backdrop-blur-md ${
            isIncompatibleTarget
              ? 'bg-error-container/95 border-error/40 text-on-error-container font-medium'
              : isCompatibleTarget
              ? 'bg-primary-container/95 border-primary/40 text-on-primary-container font-semibold'
              : 'bg-surface-container-highest border-outline-variant/30 text-on-surface'
          } ${isVisualRight ? 'left-full ml-3 top-1/2 -translate-y-1/2' : 'right-full mr-3 top-1/2 -translate-y-1/2'}`}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}

function isSamePort(connecting, nodeId, portId) {
  return (
    (connecting.fromType === 'input' && connecting.targetNodeId === nodeId && connecting.targetHandle === portId) ||
    (connecting.fromType !== 'input' && connecting.sourceNodeId === nodeId && connecting.sourceHandle === portId)
  );
}
