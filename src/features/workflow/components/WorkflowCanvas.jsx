import React, { useRef, useEffect, useState, useCallback } from 'react';
import WorkflowNodeCard from './WorkflowNodeCard';
import WorkflowEdge from './WorkflowEdge';
import { useI18n } from '../../../context/I18nContext';
import { NODE_DEFINITIONS, PORT_COLORS, PORT_TYPE_LABELS } from '../engine/nodeDefinitions';
import { isPortCompatible, getNodeOutputs } from '../engine/workflowGraph';

export default function WorkflowCanvas({
  nodes,
  edges,
  pan,
  zoom,
  selectedNodeId,
  selectedEdgeId,
  connecting,
  nodeStates = {},
  nodeErrors = {},
  onSelectNode,
  onSelectEdge,
  onRemoveNode,
  onRemoveEdge,
  onUpdateNodePosition,
  onSetNodePosition,
  onAddEdge,
  onStartConnect,
  onCompleteConnect,
  onCancelConnect,
  onDisconnectPort,
  onConnectError,
  onRetryNode,
  startCanvasDrag,
  onCanvasMouseMove,
  onCanvasMouseUp,
  handleWheel,
  zoomIn,
  zoomOut,
  resetView,
  onAutoLayout,
  onAutoConnect,
  onDropNewNode,
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const [draggingNode, setDraggingNode] = useState(null);

  // Calculate approximate port coordinates for edges
  const getPortCoordinates = useCallback((nodeId, portId, isOutput) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const def = NODE_DEFINITIONS[node.type];
    const ports = isOutput ? getNodeOutputs(node, def) : def?.inputs || [];
    const index = ports.findIndex((p) => p.id === portId);
    const safeIndex = index >= 0 ? index : 0;

    // Card dimensions: width = 256px (w-64)
    // Header height ~ 40px, each port line ~ 26px
    const cardWidth = 256;
    const x = isOutput ? node.x + cardWidth : node.x;
    const y = node.y + 40 + 16 + safeIndex * 26;
    const side = isOutput ? 'right' : 'left';

    return { x, y, side };
  }, [nodes]);

  // Handle node dragging start
  const handleNodeDragStart = (nodeId, clientX, clientY) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDraggingNode({
      id: nodeId,
      startMouseX: clientX,
      startMouseY: clientY,
      startNodeX: node.x,
      startNodeY: node.y,
    });
  };

  // Window-level mousemove, mouseup, and keydown listeners to guarantee release and escape
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (draggingNode) {
        const targetX = Math.round(draggingNode.startNodeX + (e.clientX - draggingNode.startMouseX) / zoom);
        const targetY = Math.round(draggingNode.startNodeY + (e.clientY - draggingNode.startMouseY) / zoom);
        if (onSetNodePosition) {
          onSetNodePosition(draggingNode.id, targetX, targetY);
        } else if (onUpdateNodePosition) {
          const current = nodes.find((n) => n.id === draggingNode.id);
          if (current) {
            onUpdateNodePosition(draggingNode.id, targetX - current.x, targetY - current.y);
          }
        }
      }
      onCanvasMouseMove(e);
    };

    const handleGlobalMouseUp = (e) => {
      if (draggingNode) {
        setDraggingNode(null);
      }

      if (connecting) {
        // Find element under cursor when mouse is released
        let elUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        let portEl = elUnderCursor?.closest('[data-port-id]');

        // Proximity search if released slightly outside port circle/row
        if (!portEl) {
          const offsets = [
            [-8, 0], [8, 0], [0, -8], [0, 8],
            [-14, 0], [14, 0], [0, -14], [0, 14],
          ];
          for (const [dx, dy] of offsets) {
            const nearby = document.elementFromPoint(e.clientX + dx, e.clientY + dy);
            const found = nearby?.closest('[data-port-id]');
            if (found) {
              portEl = found;
              break;
            }
          }
        }

        if (portEl) {
          const targetNodeId = portEl.getAttribute('data-node-id');
          const targetPortId = portEl.getAttribute('data-port-id');
          const targetPortType = portEl.getAttribute('data-port-type');
          const targetDirection = portEl.getAttribute('data-port-direction');

          const isSamePort =
            (connecting.fromType === 'input' &&
              connecting.targetNodeId === targetNodeId &&
              connecting.targetHandle === targetPortId) ||
            (connecting.fromType !== 'input' &&
              connecting.sourceNodeId === targetNodeId &&
              connecting.sourceHandle === targetPortId);

          if (isSamePort) {
            // Clicked and released on the same port: keep wire active for click-to-connect mode
            return;
          }

          // Case 1: Started from Input A -> Dropped on Output C
          if (
            connecting.fromType === 'input' &&
            targetDirection === 'output' &&
            targetNodeId !== connecting.targetNodeId
          ) {
            if (isPortCompatible(targetPortType, connecting.targetHandleType)) {
              onCompleteConnect &&
                onCompleteConnect({
                  source: targetNodeId,
                  sourceHandle: targetPortId,
                  target: connecting.targetNodeId,
                  targetHandle: connecting.targetHandle,
                });
              return;
            }
          }
          // Case 2: Started from Output C -> Dropped on Input A
          else if (
            connecting.fromType !== 'input' &&
            targetDirection === 'input' &&
            targetNodeId !== connecting.sourceNodeId
          ) {
            if (isPortCompatible(connecting.sourceHandleType, targetPortType)) {
              onCompleteConnect &&
                onCompleteConnect({
                  source: connecting.sourceNodeId,
                  sourceHandle: connecting.sourceHandle,
                  target: targetNodeId,
                  targetHandle: targetPortId,
                });
              return;
            }
          }

          // Incompatible port dropped: trigger clear explanation toast for user
          const originNodeId = connecting.fromType === 'input' ? connecting.targetNodeId : connecting.sourceNodeId;
          if (targetNodeId === originNodeId) {
            onConnectError && onConnectError(t('workflow.canvas.errSameNode'));
          } else if (
            (connecting.fromType === 'input' && targetDirection === 'input') ||
            (connecting.fromType !== 'input' && targetDirection === 'output')
          ) {
            onConnectError && onConnectError(t('workflow.canvas.errDirection'));
          } else {
            const srcType = connecting.fromType === 'input' ? targetPortType : connecting.sourceHandleType;
            const tgtType = connecting.fromType === 'input' ? connecting.targetHandleType : targetPortType;
            const srcName = t(`workflow.portType.${srcType}`, PORT_TYPE_LABELS[srcType] || srcType);
            const tgtName = t(`workflow.portType.${tgtType}`, PORT_TYPE_LABELS[tgtType] || tgtType);
            onConnectError &&
              onConnectError(
                t('workflow.canvas.errIncompatible', { src: srcName, tgt: tgtName })
              );
          }
        }

        // If released on blank canvas or incompatible port, cancel wire
        onCancelConnect && onCancelConnect();
        return;
      }

      onCanvasMouseUp(e);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (draggingNode) {
          if (onSetNodePosition) {
            onSetNodePosition(draggingNode.id, draggingNode.startNodeX, draggingNode.startNodeY);
          }
          setDraggingNode(null);
        }
        if (connecting) {
          onCancelConnect && onCancelConnect();
        }
        onSelectNode && onSelectNode(null);
        onSelectEdge && onSelectEdge(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draggingNode, zoom, onSetNodePosition, onUpdateNodePosition, onCanvasMouseMove, onCanvasMouseUp, connecting, onCancelConnect, onCompleteConnect, onConnectError, nodes, t]);

  // Handle canvas mouse down
  const handleCanvasMouseDown = (e) => {
    if (connecting) {
      // If clicking canvas while drawing a wire, cancel the wire immediately
      onCancelConnect && onCancelConnect();
      return;
    }
    startCanvasDrag(e);
  };

  // Drag & drop from palette
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/workflow-node-type');
    if (type && containerRef.current && onDropNewNode) {
      const rect = containerRef.current.getBoundingClientRect();
      onDropNewNode(type, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full overflow-hidden bg-surface-container-low/40 select-none cursor-grab active:cursor-grabbing text-outline-variant/30"
      style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Zoom / Pan Transformed Viewport */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
        }}
      >
        {/* SVG Edges Layer */}
        <svg
          className="absolute inset-0 w-[50000px] h-[50000px] -left-[25000px] -top-[25000px] overflow-visible pointer-events-none"
          style={{ transform: 'translate(25000px, 25000px)' }}
        >
          {edges.map((edge) => {
            const sourcePos = getPortCoordinates(edge.source, edge.sourceHandle, true);
            const targetPos = getPortCoordinates(edge.target, edge.targetHandle, false);
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const def = sourceNode ? NODE_DEFINITIONS[sourceNode.type] : null;
            const outputPort = def?.outputs.find((p) => p.id === edge.sourceHandle);
            const isRunning = nodeStates[edge.source]?.status === 'running';

            return (
              <WorkflowEdge
                key={edge.id}
                edge={edge}
                sourcePos={sourcePos}
                targetPos={targetPos}
                sourceType={outputPort?.type || 'any'}
                isRunning={isRunning}
                isSelected={selectedEdgeId === edge.id}
                onSelect={onSelectEdge}
                onDelete={onRemoveEdge}
              />
            );
          })}

          {/* Active connecting wire */}
          {(() => {
            if (!connecting || !containerRef.current) return null;
            const isFromInput = connecting.fromType === 'input';
            const startPortPos = isFromInput
              ? getPortCoordinates(connecting.targetNodeId, connecting.targetHandle, false)
              : getPortCoordinates(connecting.sourceNodeId, connecting.sourceHandle, true);

            if (!startPortPos) return null;

            const containerRect = containerRef.current.getBoundingClientRect();
            const currentCanvasX = (connecting.currentX - containerRect.left - pan.x) / zoom;
            const currentCanvasY = (connecting.currentY - containerRect.top - pan.y) / zoom;

            const sx = startPortPos.x;
            const sy = startPortPos.y;
            const tx = currentCanvasX;
            const ty = currentCanvasY;

            const dx = Math.max(Math.abs(tx - sx) / 2, 40);
            const startSide = startPortPos.side || (isFromInput ? 'left' : 'right');
            const c1x = startSide === 'left' ? sx - dx : sx + dx;
            const c2x = startSide === 'left' ? tx + dx : tx - dx;

            const portType = isFromInput ? connecting.targetHandleType : connecting.sourceHandleType;
            const color = PORT_COLORS[portType] || '#38bdf8';

            return (
              <path
                d={`M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray="5 4"
                className="animate-pulse pointer-events-none"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0 pointer-events-auto">
          {nodes.map((node) => (
            <WorkflowNodeCard
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              nodeState={nodeStates[node.id]}
              validationError={nodeErrors[node.id] || null}
              edges={edges}
              connecting={connecting}
              onSelect={onSelectNode}
              onRemove={onRemoveNode}
              onDragStart={handleNodeDragStart}
              onStartConnect={onStartConnect}
              onCompleteConnect={onCompleteConnect}
              onCancelConnect={onCancelConnect}
              onDisconnectPort={onDisconnectPort}
              onConnectError={onConnectError}
              onRetryNode={onRetryNode}
            />
          ))}
        </div>
      </div>

      {/* Floating Connecting Helper Banner (Top Center) */}
      {connecting && (() => {
        const portType =
          connecting.fromType === 'input'
            ? connecting.targetHandleType
            : connecting.sourceHandleType;
        const color = PORT_COLORS[portType] || '#38bdf8';
        const label = t(`workflow.portType.${portType}`, PORT_TYPE_LABELS[portType] || portType);

        return (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-surface-container-lowest/95 border border-primary/50 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2 select-none">
            <div
              className="w-2.5 h-2.5 rounded-full animate-ping shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-on-surface">
              {t('workflow.canvas.connectingType')}{' '}
              <strong className="font-bold" style={{ color }}>
                {label}
              </strong>
            </span>
            <span className="text-[11px] text-primary font-medium bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-lg">
              {t('workflow.canvas.connectingHint')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelConnect && onCancelConnect();
              }}
              className="text-[11px] font-medium text-on-surface-variant hover:text-on-surface bg-surface-container px-2 py-0.5 rounded-lg border border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              {t('workflow.canvas.cancelWire')}
            </button>
          </div>
        );
      })()}

      {/* Empty State Help Overlay */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="max-w-md p-6 rounded-2xl bg-surface-container-lowest/95 border border-outline-variant/30 text-center space-y-3 shadow-xl backdrop-blur-md">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">account_tree</span>
            </div>
            <h3 className="text-sm font-bold text-on-surface">{t('workflow.canvas.emptyTitle')}</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t('workflow.canvas.emptyDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Floating Canvas Controls (Bottom Left) */}
      <div className="absolute bottom-5 left-5 flex items-center gap-1 p-1.5 rounded-xl bg-surface-container-lowest/90 border border-outline-variant/30 backdrop-blur-md shadow-md z-20 text-on-surface">
        <button
          type="button"
          onClick={zoomOut}
          data-tooltip={t('workflow.canvas.zoomOut')}
          aria-label={t('workflow.canvas.zoomOut')}
          className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">remove</span>
        </button>

        <span className="text-[11px] font-mono text-on-surface font-semibold w-12 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={zoomIn}
          data-tooltip={t('workflow.canvas.zoomIn')}
          aria-label={t('workflow.canvas.zoomIn')}
          className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
        </button>

        <div className="w-px h-4 bg-outline-variant/30 my-auto mx-0.5" />

        <button
          type="button"
          onClick={resetView}
          data-tooltip={t('workflow.canvas.resetZoom')}
          aria-label={t('workflow.canvas.resetZoom')}
          className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">center_focus_strong</span>
        </button>

        {onAutoLayout && (
          <button
            type="button"
            onClick={onAutoLayout}
            data-tooltip={t('workflow.canvas.autoLayout')}
            aria-label={t('workflow.canvas.autoLayout')}
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">alt_route</span>
          </button>
        )}

        {onAutoConnect && (
          <button
            type="button"
            data-testid="workflow-canvas-autoconnect-btn"
            onClick={onAutoConnect}
            data-tooltip={t('workflow.canvas.autoConnect')}
            aria-label={t('workflow.canvas.autoConnect')}
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">hub</span>
          </button>
        )}
      </div>
    </div>
  );
}
