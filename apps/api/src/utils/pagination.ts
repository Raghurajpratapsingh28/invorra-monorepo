export function toSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function toPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
