/** 选当前公司身份：优先用户指定（如刚接受了另一家公司的项目邀请），没有或已不在名单里则取第一家。 */
export function pickActiveCompany<T extends { id: number }>(items: T[] | undefined, preferredId: number | null): T | null {
  const list = items ?? [];
  if (preferredId != null) {
    const hit = list.find((c) => c.id === preferredId);
    if (hit) return hit;
  }
  return list[0] ?? null;
}
