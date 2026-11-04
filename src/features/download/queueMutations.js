function default_entry_id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function resolveInitialWorkflowId(meta) {
  if (!meta) return null;
  const wid = meta.workflowId !== undefined ? meta.workflowId : meta.initialWorkflowId;
  if (wid === 'none') return 'none';
  if (!wid || wid === 'inherit') return null;
  return String(wid).trim();
}

export function createChapterEntry(ch, make_id = default_entry_id) {
  return {
    id: make_id(),
    chapterUrl: ch.url,
    chapterTitle: ch.title,
    status: 'waiting',
  };
}

export function countNewChaptersForManga(queue, mangaUrl, chapter_list) {
  const existing_idx = (queue || []).findIndex((g) => g.mangaUrl === mangaUrl);
  if (existing_idx < 0) return chapter_list.length;
  const existing_urls = new Set(queue[existing_idx].chapters.map((c) => c.chapterUrl));
  let added_count = 0;
  for (const ch of chapter_list) {
    if (!existing_urls.has(ch.url)) added_count += 1;
  }
  return added_count;
}

export function mergeChaptersIntoQueue(prev, group_meta, chapter_list, make_id = default_entry_id) {
  const existing_idx = prev.findIndex((g) => g.mangaUrl === group_meta.mangaUrl);
  if (existing_idx >= 0) {
    const existing_urls = new Set(prev[existing_idx].chapters.map((c) => c.chapterUrl));
    const merged = [...prev[existing_idx].chapters];
    for (const ch of chapter_list) {
      if (existing_urls.has(ch.url)) continue;
      existing_urls.add(ch.url);
      merged.push(createChapterEntry(ch, make_id));
    }
    if (merged.length === prev[existing_idx].chapters.length) return prev;
    const next = [...prev];
    next[existing_idx] = {
      ...prev[existing_idx],
      paused: false,
      chapters: merged,
      workflowId: prev[existing_idx].workflowId !== undefined
        ? prev[existing_idx].workflowId
        : resolveInitialWorkflowId(group_meta),
    };
    return next;
  }

  return [
    ...prev,
    {
      id: make_id(),
      mangaTitle: group_meta.mangaTitle,
      mangaUrl: group_meta.mangaUrl,
      site: group_meta.site || '',
      coverUrl: group_meta.coverUrl || '',
      paused: false,
      downloadOrder: 'asc',
      workflowId: resolveInitialWorkflowId(group_meta),
      workflowState: group_meta.workflowState || 'idle',
      workflowProgress: group_meta.workflowProgress || null,
      chapters: chapter_list.map((ch) => createChapterEntry(ch, make_id)),
    },
  ];
}

export function removeQueueGroup(prev, group_id) {
  return prev.filter((g) => g.id !== group_id);
}

export function removeQueueChapter(prev, group_id, chapter_id) {
  return prev
    .map((g) => {
      if (g.id !== group_id) return g;
      const new_chapters = g.chapters.filter((c) => c.id !== chapter_id);
      if (new_chapters.length === 0) return null;
      return { ...g, chapters: new_chapters };
    })
    .filter(Boolean);
}

export function skipQueueChapter(prev, group_id, chapter_id) {
  return prev.map((g) => {
    if (g.id !== group_id) return g;
    return {
      ...g,
      chapters: g.chapters.map((c) =>
        c.id === chapter_id ? { ...c, status: 'error', downloadError: 'Skipped', retryCount: 0 } : c
      ),
    };
  });
}

export function retryQueueChapter(prev, group_id, chapter_id) {
  return prev.map((g) => {
    if (g.id !== group_id) return g;
    return {
      ...g,
      chapters: g.chapters.map((c) =>
        c.id === chapter_id ? { ...c, status: 'waiting', retryCount: 0, downloadError: null } : c
      ),
    };
  });
}

export function reorderQueueChapter(prev, group_id, from_idx, to_idx) {
  return prev.map((g) => {
    if (g.id !== group_id) return g;
    const chapters = [...g.chapters];
    const [moved] = chapters.splice(from_idx, 1);
    chapters.splice(to_idx, 0, moved);
    return { ...g, chapters };
  });
}

export function clearCompletedQueueGroups(prev) {
  return prev.filter((g) => !(g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done')));
}

export function clearCompletedChaptersInGroup(prev, group_id) {
  return prev
    .map((g) => {
      if (g.id !== group_id) return g;
      const new_chapters = g.chapters.filter((c) => c.status !== 'done' || !!c.downloadError);
      if (new_chapters.length === 0) return null;
      return { ...g, chapters: new_chapters };
    })
    .filter(Boolean);
}

export function listQueuedChapterUrlsAhead(chapters, current_chapter_id, limit = 8) {
  const list = Array.isArray(chapters) ? chapters : [];
  const current_index = list.findIndex((chapter) => chapter && chapter.id === current_chapter_id);
  const rest = current_index >= 0 ? list.slice(current_index + 1) : [];
  const urls = [];
  const seen = new Set();
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 8;
  for (const chapter of rest) {
    if (!chapter || chapter.status !== 'waiting') continue;
    const url = String(chapter.chapterUrl || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= cap) break;
  }
  return urls;
}

export function pauseQueueGroups(prev, group_ids, paused) {
  if (!group_ids?.length) return prev;
  const id_set = new Set(group_ids);
  return prev.map((g) => (id_set.has(g.id) ? { ...g, paused } : g));
}

export function toggleGroupDownloadOrder(prev, group_id) {
  return prev.map((g) => {
    if (g.id !== group_id) return g;
    const current = g.downloadOrder === 'desc' ? 'desc' : 'asc';
    return {
      ...g,
      downloadOrder: current === 'asc' ? 'desc' : 'asc',
      chapters: [...g.chapters].reverse(),
    };
  });
}

export function retryFailedChapters(prev, group_id) {
  return prev.map((g) => {
    if (g.id !== group_id) return g;
    return {
      ...g,
      chapters: g.chapters.map((c) => {
        if (c.status === 'done' && c.downloadError) {
          const { downloadError, ...rest } = c;
          return { ...rest, status: 'waiting', retryCount: 0 };
        }
        return c;
      }),
    };
  });
}

export function reorderQueueGroups(prev, from_index, to_index) {
  if (from_index === to_index) return prev;
  if (from_index < 0 || to_index < 0 || from_index >= prev.length || to_index >= prev.length) {
    return prev;
  }
  const next = [...prev];
  const [item] = next.splice(from_index, 1);
  next.splice(to_index, 0, item);
  return next;
}

export function mergeHistoryRowsIntoQueue(prev, rows, make_id = default_entry_id) {
  if (!rows?.length) return prev;
  const by_manga = new Map();
  for (const row of rows) {
    if (!row.mangaUrl || !row.chapterUrl) continue;
    if (!by_manga.has(row.mangaUrl)) by_manga.set(row.mangaUrl, []);
    by_manga.get(row.mangaUrl).push(row);
  }
  const next = [...prev];
  for (const [manga_url, manga_rows] of by_manga) {
    const existing_idx = next.findIndex((g) => g.mangaUrl === manga_url);
    if (existing_idx !== -1) {
      const group = next[existing_idx];
      const existing_urls = new Set(group.chapters.map((c) => c.chapterUrl));
      const new_chapters = manga_rows
        .filter((r) => !existing_urls.has(r.chapterUrl))
        .map((r) => createChapterEntry({ url: r.chapterUrl, title: r.chapterTitle }, make_id));
      if (new_chapters.length > 0) {
        next[existing_idx] = { ...group, chapters: [...group.chapters, ...new_chapters] };
      }
    } else {
      const first_row = manga_rows[0];
      const seen = new Set();
      const chapters = [];
      for (const r of manga_rows) {
        if (!seen.has(r.chapterUrl)) {
          seen.add(r.chapterUrl);
          chapters.push(createChapterEntry({ url: r.chapterUrl, title: r.chapterTitle }, make_id));
        }
      }
      next.push({
        id: make_id(),
        mangaTitle: first_row.mangaTitle,
        mangaUrl: first_row.mangaUrl,
        site: first_row.siteId,
        coverUrl: first_row.coverUrl || '',
        paused: false,
        downloadOrder: 'asc',
        chapters,
      });
    }
  }
  return next;
}

export function countNewHistoryChapters(queue, rows) {
  const by_manga = new Map();
  for (const row of rows || []) {
    if (!row.mangaUrl || !row.chapterUrl) continue;
    if (!by_manga.has(row.mangaUrl)) by_manga.set(row.mangaUrl, []);
    by_manga.get(row.mangaUrl).push(row);
  }
  let added_count = 0;
  let affected_manga = 0;
  for (const [manga_url, manga_rows] of by_manga) {
    const group = (queue || []).find((g) => g.mangaUrl === manga_url);
    if (group) {
      const existing_urls = new Set(group.chapters.map((c) => c.chapterUrl));
      const new_count = manga_rows.filter((r) => !existing_urls.has(r.chapterUrl)).length;
      if (new_count > 0) {
        added_count += new_count;
        affected_manga += 1;
      }
    } else {
      const unique_urls = new Set(manga_rows.map((r) => r.chapterUrl));
      added_count += unique_urls.size;
      affected_manga += 1;
    }
  }
  return { addedCount: added_count, affectedManga: affected_manga };
}

export function setGroupWorkflow(queue, groupId, workflowId) {
  let wid = null;
  if (workflowId === 'none') {
    wid = 'none';
  } else if (workflowId && workflowId !== 'inherit') {
    wid = String(workflowId).trim();
  }
  return (queue || []).map((g) => (g.id === groupId ? { ...g, workflowId: wid } : g));
}

export function setAllGroupsWorkflow(queue, workflowId) {
  let wid = null;
  if (workflowId === 'none') {
    wid = 'none';
  } else if (workflowId && workflowId !== 'inherit') {
    wid = String(workflowId).trim();
  }
  return (queue || []).map((g) => {
    const isCompleted = g.chapters && g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done');
    if (isCompleted) return g;
    return { ...g, workflowId: wid };
  });
}

export function updateGroupWorkflowState(queue, groupId, { workflowState, workflowProgress } = {}) {
  return (queue || []).map((g) => {
    if (g.id !== groupId) return g;
    return {
      ...g,
      workflowState: workflowState !== undefined ? workflowState : (g.workflowState || 'idle'),
      workflowProgress: workflowProgress !== undefined ? workflowProgress : (g.workflowProgress || null),
    };
  });
}

