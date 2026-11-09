export function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "...")[] {
  if (!Number.isFinite(totalPages) || totalPages <= 0) {
    return [];
  }

  const total = Math.floor(totalPages);
  const current = Number.isFinite(currentPage)
    ? Math.max(1, Math.min(Math.floor(currentPage), total))
    : 1;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }

  if (current >= total - 3) {
    return [
      1,
      "...",
      total - 4,
      total - 3,
      total - 2,
      total - 1,
      total,
    ];
  }

  return [
    1,
    "...",
    current - 1,
    current,
    current + 1,
    "...",
    total,
  ];
}

