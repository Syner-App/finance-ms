export const FINANCE_EVENTS_CLIENT = 'FINANCE_EVENTS_CLIENT';

// Read-only gRPC clients: finance-ms never writes to another service over gRPC (stock
// changes travel as events), it only reads the stock and the open purchase orders
export const PRODUCTS_SERVICE = 'PRODUCTS_SERVICE';
export const ORDERS_SERVICE = 'ORDERS_SERVICE';
export const INTEGRATION_TIMEOUT_MS = 5000;

// Topic exchange shared by every Syner service. It and the work queues are declared
// in syner/rabbitmq/definitions.json; queue arguments here must match that file
export const SYNER_EXCHANGE = 'syner.events';

// Dead-letter exchange (and DLQs) declared in syner/rabbitmq/definitions.json
export const SYNER_DLX = 'syner.dlx';

// Inbox of finance-ms: received purchase orders and the stock replies of products-ms.
// The RMQ server binds it to the pattern of every @EventPattern of the app (wildcards)
export const FINANCE_EVENTS_QUEUE = 'finance.events';

export const PUBLISH_TIMEOUT_MS = 5000;
