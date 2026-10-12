export const DomainEventName = {
  SALE_RECORDED: 'SALE_RECORDED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  FORECAST_GENERATED: 'FORECAST_GENERATED',
  RECOMMENDATION_CREATED: 'RECOMMENDATION_CREATED',
  PO_CREATED: 'PO_CREATED',
  PO_APPROVED: 'PO_APPROVED',
  PO_RECEIVED: 'PO_RECEIVED',
} as const;

export type DomainEventName = (typeof DomainEventName)[keyof typeof DomainEventName];

export type DomainEvent = {
  name: DomainEventName;
  organizationId: string;
  entityType: string;
  entityId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};
