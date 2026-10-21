import type Artplayer from 'artplayer';

export const PROGRESS_PREVIEW_MOVE = 'moontv-progress-preview-move';
export const PROGRESS_PREVIEW_END = 'moontv-progress-preview-end';

export interface ProgressPreviewMove {
  ratio: number;
  input: 'mouse' | 'touch';
}

/** Keep playback running while scrubbing; commit the selected time on release. */
export function bindDeferredProgressSeek(art: Artplayer): () => void {
  const progress = art.template.$progress;
  const player = art.template.$player;
  const doc = progress.ownerDocument;
  const win = doc.defaultView;
  let drag: 'mouse' | 'touch' | null = null;
  let touchId: number | null = null;
  let ratio = 0;
  let restoringBar = false;
  let gesturePreview = false;
  let systemGesture = false;

  const endGesturePreview = () => {
    if (!gesturePreview) return;
    gesturePreview = false;
    progress.dispatchEvent(new CustomEvent(PROGRESS_PREVIEW_END));
  };

  const updatePosition = (clientX: number, clientY: number, event?: Event) => {
    const rect = progress.getBoundingClientRect();
    const size = art.isRotate ? rect.height : rect.width;
    if (size <= 0) return;
    const offset = art.isRotate ? clientY - rect.top : clientX - rect.left;
    ratio = Math.min(1, Math.max(0, offset / size));
    art.emit('setBar', 'played', ratio, event);
    // Touch events are intercepted here, so notify previews before returning.
    if (drag) {
      progress.dispatchEvent(
        new CustomEvent<ProgressPreviewMove>(PROGRESS_PREVIEW_MOVE, {
          detail: { ratio, input: drag },
        })
      );
    }
  };

  const finish = (commit: boolean, keepControls = true) => {
    if (!drag) return;
    drag = null;
    touchId = null;
    // The show setter also restarts Artplayer's normal auto-hide countdown.
    if (keepControls && !art.isLock) art.controls.show = true;
    if (commit && Number.isFinite(art.duration) && art.duration > 0) {
      art.seek = ratio * art.duration;
    } else {
      art.emit('setBar', 'played', art.played);
    }
    progress.dispatchEvent(new CustomEvent(PROGRESS_PREVIEW_END));
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || art.isLock || drag) return;
    // Capture before Artplayer starts its continuous-seek drag handler.
    event.stopImmediatePropagation();
    event.preventDefault();
    drag = 'mouse';
    art.controls.show = true;
    updatePosition(event.clientX, event.clientY, event);
  };
  const onMouseMove = (event: MouseEvent) => {
    if (drag !== 'mouse') return;
    event.stopImmediatePropagation();
    updatePosition(event.clientX, event.clientY, event);
  };
  const onMouseUp = (event: MouseEvent) => {
    if (drag !== 'mouse' || event.button !== 0) return;
    event.stopImmediatePropagation();
    updatePosition(event.clientX, event.clientY, event);
    finish(true);
  };
  const onPlayerTouchStart = (event: TouchEvent) => {
    if (!art.fullscreen && !art.fullscreenWeb && !art.isRotate) return;
    const viewportTop = win?.visualViewport?.offsetTop || 0;
    // Use screen coordinates, not the rotated player's progress axis.
    if (
      !systemGesture &&
      !Array.from(event.touches).some(
        (touch) => touch.clientY <= viewportTop + 40
      )
    ) {
      return;
    }
    systemGesture = true;
    endGesturePreview();
    finish(false);
    // Clear Artplayer's previous gesture, including interrupted touch sequences.
    art.emit('document:touchend', event);
    // Do not preventDefault: the OS must still receive notification gestures.
    event.stopImmediatePropagation();
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || art.isLock || drag) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const touch = event.touches[0];
    touchId = touch.identifier;
    drag = 'touch';
    art.controls.show = true;
    updatePosition(touch.clientX, touch.clientY, event);
  };
  const onTouchMove = (event: TouchEvent) => {
    if (systemGesture) {
      event.stopImmediatePropagation();
      return;
    }
    if (drag !== 'touch') return;
    event.stopImmediatePropagation();
    event.preventDefault();
    if (event.touches.length !== 1) {
      finish(false);
      return;
    }
    const touch = Array.from(event.touches).find(
      (item) => item.identifier === touchId
    );
    if (touch) updatePosition(touch.clientX, touch.clientY, event);
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (systemGesture) {
      if (event.touches.length === 0) systemGesture = false;
      return;
    }
    if (event.touches.length === 0) endGesturePreview();
    if (drag !== 'touch') return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === touchId
    );
    if (!touch) return;
    event.stopImmediatePropagation();
    updatePosition(touch.clientX, touch.clientY, event);
    finish(true);
  };
  const onCancel = (event?: Event) => {
    systemGesture = false;
    endGesturePreview();
    finish(false);
    art.emit('document:touchend', event || new Event('touchcancel'));
  };
  const onVisibilityChange = () => {
    if (doc.hidden) onCancel();
  };
  const onClick = (event: MouseEvent) => {
    // A release already committed the seek; do not seek again on its click.
    event.stopImmediatePropagation();
    if (event.detail === 0 && !art.isLock) {
      updatePosition(event.clientX, event.clientY, event);
      art.seek = ratio * art.duration;
    }
  };
  const onSetBar = (type: string, percentage: number, event?: Event) => {
    if (type !== 'played' || restoringBar) return;
    if (!drag) {
      // Artplayer emits this only for progress-changing video gestures.
      if (
        !art.isLock &&
        !systemGesture &&
        event?.type === 'touchmove' &&
        Number.isFinite(percentage)
      ) {
        gesturePreview = true;
        art.controls.show = true;
        progress.dispatchEvent(
          new CustomEvent<ProgressPreviewMove>(PROGRESS_PREVIEW_MOVE, {
            detail: {
              ratio: Math.min(1, Math.max(0, percentage)),
              input: 'touch',
            },
          })
        );
      }
      return;
    }
    // RAF/timeupdate still advance normally, but the thumb follows the drag.
    restoringBar = true;
    art.emit('setBar', 'played', ratio);
    restoringBar = false;
  };
  const onControl = (visible: boolean) => {
    // Auto-hide is driven by video:timeupdate even when a finger holds still.
    if (!visible && (drag || gesturePreview) && !art.isLock)
      art.controls.show = true;
  };

  player.addEventListener('touchstart', onPlayerTouchStart, {
    capture: true,
    passive: true,
  });
  progress.addEventListener('mousedown', onMouseDown, true);
  progress.addEventListener('touchstart', onTouchStart, {
    capture: true,
    passive: false,
  });
  progress.addEventListener('click', onClick, true);
  doc.addEventListener('mousemove', onMouseMove, true);
  doc.addEventListener('mouseup', onMouseUp, true);
  doc.addEventListener('touchmove', onTouchMove, {
    capture: true,
    passive: false,
  });
  doc.addEventListener('touchend', onTouchEnd, true);
  doc.addEventListener('touchcancel', onCancel, true);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  win?.addEventListener('blur', onCancel);
  art.on('setBar', onSetBar);
  art.on('control', onControl);

  const cleanup = () => {
    endGesturePreview();
    finish(false, false);
    player.removeEventListener('touchstart', onPlayerTouchStart, true);
    progress.removeEventListener('mousedown', onMouseDown, true);
    progress.removeEventListener('touchstart', onTouchStart, true);
    progress.removeEventListener('click', onClick, true);
    doc.removeEventListener('mousemove', onMouseMove, true);
    doc.removeEventListener('mouseup', onMouseUp, true);
    doc.removeEventListener('touchmove', onTouchMove, true);
    doc.removeEventListener('touchend', onTouchEnd, true);
    doc.removeEventListener('touchcancel', onCancel, true);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win?.removeEventListener('blur', onCancel);
    art.off('setBar', onSetBar);
    art.off('control', onControl);
    art.off('destroy', cleanup);
  };
  art.on('destroy', cleanup);
  return cleanup;
}
