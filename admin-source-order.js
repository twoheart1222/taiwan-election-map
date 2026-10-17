// Reorder existing nodes so unsaved input values and expanded drawers survive.
(() => {
  const rowsOf = container => [...container.querySelectorAll('.src-row')];
  function move(container, row, index) {
    const rows = rowsOf(container);
    const from = rows.indexOf(row);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(rows.length - 1, index));
    if (from === to) return false;
    rows.splice(from, 1);
    container.insertBefore(row, rows[to] || null);
    return true;
  }
  const bindings = new WeakMap();
  function attach(container, changed) {
    bindings.get(container)?.();
    let dragging = null;
    let restore = [];
    let startY = 0;
    let moved = false;
    const finish = cancel => {
      if (!dragging) return;
      dragging.classList.remove('src-dragging');
      if (cancel && moved) restore.forEach(row => container.appendChild(row));
      if (moved) changed(!cancel);
      dragging = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
    const onMove = event => {
      if (!dragging) return;
      if (!moved && Math.abs(event.clientY - startY) < 5) return;
      event.preventDefault();
      dragging.classList.add('src-dragging');
      const others = rowsOf(container).filter(row => row !== dragging);
      const before = others.find(row => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
      const target = before ? others.indexOf(before) : others.length;
      if (move(container, dragging, target)) { moved = true; changed(true); }
      if (event.clientY < 70) window.scrollBy(0, -18);
      else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 18);
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    const onDown = event => {
      const handle = event.target.closest('[data-source-drag]');
      if (!handle || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault();
      dragging = handle.closest('.src-row');
      restore = rowsOf(container); startY = event.clientY; moved = false;
      handle.focus({ preventScroll: true });
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
    };
    const onClick = event => {
      const button = event.target.closest('[data-source-move], [data-source-drag]');
      if (!button) return;
      event.preventDefault();
      if (!button.hasAttribute('data-source-move')) return;
      const row = button.closest('.src-row');
      if (move(container, row, rowsOf(container).indexOf(row) + Number(button.dataset.sourceMove))) changed(true);
    };
    const onKey = event => {
      const handle = event.target.closest('[data-source-drag]');
      if (event.key === 'Escape' && dragging) { event.preventDefault(); finish(true); return; }
      if (!handle || !container.contains(handle) || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const row = handle.closest('.src-row');
      const rows = rowsOf(container);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1);
      if (move(container, row, target)) changed(true);
      handle.focus({ preventScroll: true });
    };
    container.addEventListener('pointerdown', onDown);
    container.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    bindings.set(container, () => {
      finish(true);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    });
  }
  globalThis.SourceOrder = { move, attach };
})();
