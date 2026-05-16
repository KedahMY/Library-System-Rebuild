// BiblioVault Component Barrel — exports all 16 frontend components.
// Use this to import any component: import { BookModal, Sidebar, ... } from '../components/index.jsx';
// Portal pages should import from here to populate their lazyComponentMap.

export { default as StarRating } from './StarRating.jsx';
export { default as QuickReview } from './QuickReview.jsx';
export { default as ReviewSection } from './ReviewSection.jsx';
export { default as BookModal } from './BookModal.jsx';
export { default as Sidebar } from './Sidebar.jsx';
export { default as NotificationBoard } from './NotificationBoard.jsx';
export { default as ProfileEditor } from './ProfileEditor.jsx';
export { default as PDFReader } from './PDFReader.jsx';
export { default as AuthorReviews } from './AuthorReviews.jsx';
export { default as AuthorStats } from './AuthorStats.jsx';
export { default as DownloadedStats } from './DownloadedStats.jsx';
export { default as BookRequests } from './BookRequests.jsx';
export { default as ManageRequests } from './ManageRequests.jsx';
export { default as ManagePublishedBooks } from './ManagePublishedBooks.jsx';
export { default as ReadingHistory } from './ReadingHistory.jsx';
export { default as CrashRecovery } from './CrashRecovery.jsx';

// Re-export named exports from CrashRecovery
export {
  RECORD_KEY,
  REFRESH_FLAG,
  SHOULD_CLEAR_KEY,
  CRASH_TEST_CLOSE_KEY,
  CRASH_NO_RECOVERY_KEY,
  SIMULATE_UNRECOVERABLE_CRASH,
  useSessionRecorder,
  CrashTestButton,
  CrashUnrecoverableButton,
} from './CrashRecovery.jsx';

// ── Component Registry — provides a global lookup for lazyComponentMap ─────────
// Portal pages use a local `lazyComponentMap` const. This registry allows
// populating that map by importing from this barrel.
// Each portal can do:
//   import { componentRegistry } from '../components/index.jsx';
//   const lazyComponentMap = componentRegistry;
export const componentRegistry = {
  StarRating,
  QuickReview,
  ReviewSection,
  BookModal,
  Sidebar,
  NotificationBoard,
  ProfileEditor,
  PDFReader,
  AuthorReviews,
  AuthorStats,
  DownloadedStats,
  BookRequests,
  ManageRequests,
  ManagePublishedBooks,
  ReadingHistory,
};

// ── Global registry (window.__BIBLIO_VAULT_COMPONENTS__) — optional runtime hook ─
// If available, portal pages can check `window.__BIBLIO_VAULT_COMPONENTS__[name]`
// as a fallback when their local lazyComponentMap misses.
if (typeof window !== 'undefined') {
  window.__BIBLIO_VAULT_COMPONENTS__ = componentRegistry;
}
