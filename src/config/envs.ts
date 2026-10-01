import 'dotenv/config';

import Joi from 'joi';

interface EnvVars {
    PORT: number;
    DATABASE_URL: string;
    RABBITMQ_URL: string;
    PRODUCTS_MICROSERVICE_HOST: string;
    PRODUCTS_MICROSERVICE_PORT: number;
    ORDERS_MICROSERVICE_HOST: string;
    ORDERS_MICROSERVICE_PORT: number;
    BUSINESS_TIMEZONE: string;
    OUTBOX_POLL_INTERVAL_MS: number;
}

const envsSchema = Joi.object({
    PORT: Joi.number().required(),
    DATABASE_URL: Joi.string().required(),
    RABBITMQ_URL: Joi.string().required(),
    PRODUCTS_MICROSERVICE_HOST: Joi.string().required(),
    PRODUCTS_MICROSERVICE_PORT: Joi.number().required(),
    ORDERS_MICROSERVICE_HOST: Joi.string().required(),
    ORDERS_MICROSERVICE_PORT: Joi.number().required(),
    // Decides the day (and so the period) of a movement registered without fecha
    BUSINESS_TIMEZONE: Joi.string().default('America/Bogota'),
    OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().positive().default(1000),
}).unknown(true);

const { error, value } = envsSchema.validate(process.env);

if (error) {
     throw new Error(`Config validation error: ${ error }`);
}

const envVars: EnvVars = value;

export const envs = {
    port: envVars.PORT,
    databaseUrl: envVars.DATABASE_URL,
    rabbitmqUrl: envVars.RABBITMQ_URL,
    productsMicroserviceHost: envVars.PRODUCTS_MICROSERVICE_HOST,
    productsMicroservicePort: envVars.PRODUCTS_MICROSERVICE_PORT,
    ordersMicroserviceHost: envVars.ORDERS_MICROSERVICE_HOST,
    ordersMicroservicePort: envVars.ORDERS_MICROSERVICE_PORT,
    businessTimezone: envVars.BUSINESS_TIMEZONE,
    outboxPollIntervalMs: envVars.OUTBOX_POLL_INTERVAL_MS,
}
