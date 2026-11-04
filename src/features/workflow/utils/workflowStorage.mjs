import { DEFAULT_TEMPLATES } from '../templates/defaultTemplates.mjs';

const WORKFLOWS_STORAGE_KEY = 'mangaCrawlerWorkflows';
const ACTIVE_WORKFLOW_ID_KEY = 'mangaCrawlerActiveWorkflowId';

export function loadSavedWorkflows() {
  try {
    const raw = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    if (DEFAULT_TEMPLATES.length === 0) {
      return list.filter((wf) => !wf.id?.startsWith('template_'));
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Returns the list of workflows. If storage is empty, seeds it with DEFAULT_TEMPLATES as workflows.
 */
export function getOrInitWorkflows() {
  const existing = loadSavedWorkflows();
  if (existing.length > 0) {
    let hasMigrated = false;
    const migrated = existing.map((wf) => {
      if (Array.isArray(wf.nodes) && wf.nodes.length > 1 && wf.nodes.every((n) => n.y === 180)) {
        hasMigrated = true;
        return {
          ...wf,
          nodes: wf.nodes.map((n, idx) => ({
            ...n,
            x: 60 + idx * 300,
            y: idx % 2 === 0 ? 100 : 260,
          })),
        };
      }
      return wf;
    });

    try {
      const rawStored = JSON.parse(localStorage.getItem(WORKFLOWS_STORAGE_KEY) || '[]');
      if (rawStored.length !== migrated.length || hasMigrated) {
        localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(migrated));
        const activeId = getActiveWorkflowId();
        if (!migrated.some((w) => w.id === activeId)) {
          localStorage.setItem(ACTIVE_WORKFLOW_ID_KEY, migrated[0].id);
        }
      }
    } catch {}

    return migrated;
  }

  const seeded = DEFAULT_TEMPLATES.length > 0
    ? DEFAULT_TEMPLATES.map((tpl, idx) => ({
        id: tpl.id,
        name: tpl.name,
        description: tpl.description || '',
        nodes: tpl.nodes || [],
        edges: tpl.edges || [],
        createdAt: Date.now() - (DEFAULT_TEMPLATES.length - idx) * 60000,
        updatedAt: Date.now() - (DEFAULT_TEMPLATES.length - idx) * 60000,
      }))
    : [
        {
          id: `wf_${Date.now()}`,
          name: 'Workflow 1',
          description: '',
          nodes: [],
          edges: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(seeded));
    if (seeded[0]?.id) {
      localStorage.setItem(ACTIVE_WORKFLOW_ID_KEY, seeded[0].id);
    }
  } catch (err) {
    console.error('Failed to seed default workflows:', err);
  }
  return seeded;
}

export function getActiveWorkflowId() {
  try {
    return localStorage.getItem(ACTIVE_WORKFLOW_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveWorkflowId(id) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_WORKFLOW_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_WORKFLOW_ID_KEY);
    }
  } catch (err) {
    console.error('Failed to set active workflow id:', err);
  }
}

export function saveWorkflow(workflow) {
  if (!workflow || !workflow.id) return;
  const list = loadSavedWorkflows();
  const idx = list.findIndex((w) => w.id === workflow.id);
  const updatedItem = {
    ...workflow,
    updatedAt: Date.now(),
    createdAt: workflow.createdAt || (idx >= 0 ? list[idx].createdAt : Date.now()),
  };
  if (idx >= 0) {
    list[idx] = updatedItem;
  } else {
    list.unshift(updatedItem);
  }
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save workflow:', err);
  }
  return updatedItem;
}

export function createWorkflow({ name, templateId, nodes = [], edges = [] }) {
  let initialNodes = nodes;
  let initialEdges = edges;
  let desc = '';

  if (templateId) {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      initialNodes = JSON.parse(JSON.stringify(tpl.nodes || []));
      initialEdges = JSON.parse(JSON.stringify(tpl.edges || []));
      desc = tpl.description || '';
    }
  }

  const newWorkflow = {
    id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: name?.trim() || `Workflow Mới`,
    description: desc,
    nodes: initialNodes,
    edges: initialEdges,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const list = loadSavedWorkflows();
  list.unshift(newWorkflow);
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(ACTIVE_WORKFLOW_ID_KEY, newWorkflow.id);
  } catch (err) {
    console.error('Failed to create workflow:', err);
  }

  return newWorkflow;
}

export function duplicateWorkflow(workflowId) {
  const list = loadSavedWorkflows();
  const target = list.find((w) => w.id === workflowId);
  if (!target) return null;

  const clone = {
    ...JSON.parse(JSON.stringify(target)),
    id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: `${target.name} (Bản sao)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  list.unshift(clone);
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(ACTIVE_WORKFLOW_ID_KEY, clone.id);
  } catch (err) {
    console.error('Failed to duplicate workflow:', err);
  }

  return clone;
}

export function renameWorkflow(workflowId, newName) {
  if (!workflowId || !newName?.trim()) return null;
  const list = loadSavedWorkflows();
  const target = list.find((w) => w.id === workflowId);
  if (!target) return null;

  target.name = newName.trim();
  target.updatedAt = Date.now();

  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to rename workflow:', err);
  }

  return target;
}

export function deleteWorkflow(workflowId) {
  const list = loadSavedWorkflows().filter((w) => w.id !== workflowId);
  try {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
    const active = getActiveWorkflowId();
    if (active === workflowId) {
      const nextActive = list[0]?.id || null;
      setActiveWorkflowId(nextActive);
    }
  } catch (err) {
    console.error('Failed to delete workflow:', err);
  }
  return list;
}

export function exportWorkflowJson(workflow) {
  return JSON.stringify(workflow, null, 2);
}

export function importWorkflowJson(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    throw new Error('Định dạng JSON không hợp lệ');
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Dữ liệu Workflow không đúng định dạng');
  }

  return {
    ...data,
    id: data.id || `wf_${Date.now()}`,
    name: data.name || 'Workflow đã nhập',
  };
}
