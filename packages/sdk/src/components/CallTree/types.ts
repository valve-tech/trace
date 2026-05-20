export interface CallTreeClassNames {
  /** Outer wrapper card. */
  root?: string;
  /** Header row (title + counts). */
  header?: string;
  /** Legend row of call-type chips. */
  legend?: string;
  /** Container for the tree of nodes. */
  tree?: string;
  /** The clickable row for an individual frame. */
  nodeRow?: string;
  /** The call-type badge (CALL/STATICCALL/etc). */
  typeBadge?: string;
  /** The address text (from / to). */
  address?: string;
  /** The function selector chip. */
  selector?: string;
  /** The non-zero value chip. */
  value?: string;
  /** The "REVERT" badge. */
  errorBadge?: string;
  /** The expanded detail panel under a frame. */
  detailPanel?: string;
}
