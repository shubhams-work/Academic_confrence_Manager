const panelDateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Formats a panel timestamp in the member's local timezone. */
export function formatPanelDateTime(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return panelDateTime.format(date);
}
