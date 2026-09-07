type ScrollSnapshot = {
  x: number;
  y: number;
  body: {
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
    overscrollBehavior: string;
  };
  rootOverflow: string;
  rootOverscrollBehavior: string;
  rootScrollBehavior: string;
};

let lockCount = 0;
let snapshot: ScrollSnapshot | null = null;

/**
 * Freeze the document underneath a modal while leaving the modal's own
 * scroll container usable. The reference count keeps nested dialogs from
 * unlocking their parent game screen too early.
 */
export function lockDocumentScroll() {
  if (typeof window === 'undefined') return () => undefined;

  lockCount += 1;
  if (lockCount === 1) {
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    snapshot = {
      x: window.scrollX,
      y: window.scrollY,
      body: {
        position: bodyStyle.position,
        top: bodyStyle.top,
        left: bodyStyle.left,
        right: bodyStyle.right,
        width: bodyStyle.width,
        overflow: bodyStyle.overflow,
        overscrollBehavior: bodyStyle.overscrollBehavior,
      },
      rootOverflow: rootStyle.overflow,
      rootOverscrollBehavior: rootStyle.overscrollBehavior,
      rootScrollBehavior: rootStyle.scrollBehavior,
    };

    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${snapshot.y}px`;
    bodyStyle.left = `-${snapshot.x}px`;
    bodyStyle.right = '0';
    bodyStyle.width = '100%';
    bodyStyle.overflow = 'hidden';
    bodyStyle.overscrollBehavior = 'none';
    rootStyle.overflow = 'hidden';
    rootStyle.overscrollBehavior = 'none';
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !snapshot) return;

    const saved = snapshot;
    snapshot = null;
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    bodyStyle.position = saved.body.position;
    bodyStyle.top = saved.body.top;
    bodyStyle.left = saved.body.left;
    bodyStyle.right = saved.body.right;
    bodyStyle.width = saved.body.width;
    bodyStyle.overflow = saved.body.overflow;
    bodyStyle.overscrollBehavior = saved.body.overscrollBehavior;
    rootStyle.overflow = saved.rootOverflow;
    rootStyle.overscrollBehavior = saved.rootOverscrollBehavior;
    rootStyle.scrollBehavior = 'auto';
    window.scrollTo(saved.x, saved.y);
    rootStyle.scrollBehavior = saved.rootScrollBehavior;
  };
}
