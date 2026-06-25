export function makeTenantData(seatMapEnabled: boolean | undefined) {
  const settings: Record<string, unknown> =
    seatMapEnabled === undefined ? {} : { seatMapEnabled };
  return {
    data: {
      id: "tenant-1",
      name: "Agência",
      slug: "agencia",
      email: "a@b.com",
      planId: "plan-1",
      status: "active",
      createdAt: "2024-01-01",
      settings,
    },
  };
}
