import PQueue from 'p-queue'
import { Pool, QueryResult } from 'pg'
import logger from '../../logger'
import env from '../env'
import { shutDown } from '../trader'
import { fromJSON, toJSON } from './json'

// Tracks whether the database is available and initialised
let isReady = false

// Tracks the number of rows in the database
// It is better to do this in memory rather than querying the database all the time
let rows = 0

// Connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Table names
const RECORDS = "nbt_records"
const OBJECTS = "nbt_objects"

// Error thrown by idle pool
pool.on('error', (err, client) => {
    const logMessage = `Unexpected error on idle client: ${err}`
    logger.error(logMessage)
    // Because the database has failed, we can no longer save the current state of the trader
    shutDown(logMessage)
})

// Checks the connection and creates the tables if they don't exist
// If no database has been configured it will still return successfully, but the result will be false
export async function initialiseDatabase(): Promise<boolean> {
    if (process.env.DATABASE_URL) {
        logger.info("Initialising the database...")

        // Uses the current NODE_ENV for all entries so that you can run production and testing on the same database
        const tables = [
            `CREATE TABLE IF NOT EXISTS ${RECORDS} (
	            id SERIAL,
                env VARCHAR(20) NOT NULL,
	            type VARCHAR(20) NOT NULL,
	            json TEXT NOT NULL,
                PRIMARY KEY (id)
            );`,

            `CREATE TABLE IF NOT EXISTS ${OBJECTS} (
	            env VARCHAR(20) NOT NULL,
                type VARCHAR(20) NOT NULL,
	            json TEXT NOT NULL,
                PRIMARY KEY (env, type)
            );`
        ]

        await execute(tables).catch((reason) => {
            const logMessage = `Failed to initialise database: ${reason}`
            logger.error(logMessage)
            return Promise.reject(logMessage)
        })

        // Currently only the records are variable length, so start with that, objects will be counted later
        rows = (await query(`SELECT COUNT(*) AS total FROM ${RECORDS} WHERE env = $1`, [process.env.NODE_ENV])).rows[0].total
        logger.debug(`Database initialised with ${rows} existing records.`)

        isReady = true
    } else {
        logger.warn("A PostgreSQL database has not been configured, logs, history, and some status information will be lost if the trader restarts.")
    }
    return Promise.resolve(isReady)
}

// Queue for writing records
const recordQueue = new PQueue({
    concurrency: 1
})

// Writes the log and transaction records to the database as JSON
export function saveRecord(type: string, record: any) {
    if (isReady) {
        // Run this through a queue so that everything is written sequentially
        recordQueue.add(async () => {
            // Increment before we write
            rows++

            // Check if this row will put us over the maximum limit
            if (env().MAX_DATABASE_ROWS && rows > env().MAX_DATABASE_ROWS) {
                // So that we're not truncating every time a new entry is written, we'll drop the oldest 5% of records
                const buffer = Math.round(env().MAX_DATABASE_ROWS * 0.05)
                logger.debug(`Truncating ${buffer} database records.`)
                // Just in case there weren't 5% to delete, subtract only what was deleted
                rows -= (await query(`WITH deleted AS (
                        DELETE FROM ${RECORDS} WHERE id IN(
                            SELECT id FROM ${RECORDS} WHERE env = $1 ORDER BY id LIMIT ${buffer} 
                        ) RETURNING *
                    ) SELECT count(*) AS total FROM deleted`, [process.env.NODE_ENV]).catch((reason) => {
                        // To avoid an infinite loop when saving logs, the database will now be disabled
                        isReady = false
            
                        const logMessage = `Failed to truncate database: ${reason}`
                        logger.error(logMessage)
            
                        // Because the database has failed, we can no longer save the current state of the trader
                        shutDown(logMessage)
            
                        return Promise.reject(logMessage)
                    })).rows[0].total
                logger.debug(`There will be ${rows} rows remaining in the database.`)
            }

            // Write the record
            const command = `INSERT INTO ${RECORDS} (env, type, json) VALUES ($1, $2, $3)`
            const param = [process.env.NODE_ENV, type, toJSON(record)]
            return await execute([command], [param]).catch((reason) => {
                // To avoid an infinite loop when saving logs, the database will now be disabled
                isReady = false

                const logMessage = `Failed to save ${type} record: ${reason}`
                logger.error(logMessage)

                // Because the database has failed, we can no longer save the current state of the trader
                shutDown(logMessage)

                return Promise.reject(logMessage)
            })
        })
    }
}

// Loads a page of records from the JSON in the database and returns them as an array of objects
// Each page size will be the defined MAX_LOG_LENGTH with the most recent record at the start
export async function loadRecords(type: string, page: number) {
    if (isReady) {
        const command = `SELECT json FROM ${RECORDS} WHERE env = $1 AND type = $2 ORDER BY id DESC LIMIT ${env().MAX_LOG_LENGTH} OFFSET ${(page-1) * env().MAX_LOG_LENGTH}`
        const param = [process.env.NODE_ENV, type]
        return (await query(command, param)
            .then(result => {
                return result.rows.map(row => fromJSON(row.json))
            })
            .catch(reason => {
                logger.error(`Failed to load ${type} records: ${reason}`)
                return []
            })
        )
    }
    return []
}

// Converts an object to JSON and saves it into the database
export async function saveObjects(objects: any) {
    if (isReady) {
        const commands: string[] = []
        const params: any[] = []
        for (const type of Object.keys(objects)) {
            commands.push(`INSERT INTO ${OBJECTS} (env, type, json) VALUES ($1, $2, $3) ON CONFLICT (env, type) DO UPDATE SET json = EXCLUDED.json`)
            // Convert object to JSON
            params.push([process.env.NODE_ENV, type, toJSON(objects[type])])
        }
        return await execute(commands, params).catch((reason) => {
            // If the database has completely failed, then writing the log will also fail and it will shut down the trader
            const logMessage = `Failed to save objects: ${reason}`
            logger.error(logMessage)
            return Promise.reject(logMessage)
        })
    }
}

// Restores an object from the JSON in the database
export async function loadObject(type: string): Promise<any> {
    if (isReady) {
        // This is a bit of a hack, rather than tracking when an object is written, we expect them all to be loaded once on startup, so this will cover the maximum
        rows++

        const command = `SELECT json FROM ${OBJECTS} WHERE env = $1 AND type = $2`
        return query(command, [process.env.NODE_ENV, type])
        .then((result) => {
            if (result.rows.length) {
                logger.silly(`Loaded object "${type}": ${result.rows[0].json}`)
                return Promise.resolve(fromJSON(result.rows[0].json))
            } else {
                return Promise.resolve(undefined)
            }
        })
        .catch((reason) => {
            const logMessage = `Failed to load object "${type}": ${reason}`
            logger.error(logMessage)
            return Promise.reject(logMessage)
        })
    } else {
        return Promise.reject("Database is not available.")
    }
}

// Executes a series of commands with no return result
async function execute(commands: string[], params?: any[]) {
    const client = await pool.connect()
    try {
        for (let i = 0; i < commands.length; ++i) {
            const command = commands[i]
            const param = params ? params[i] : undefined
            logger.silly(`Executing: ${command} ${param}`)
            client.query(command, param)
        }
    }
    finally {
        client.release()
    }
}

// Executes a single query and returns the results
async function query(command: string, params?: any): Promise<QueryResult<any>> {
    const client = await pool.connect()
    logger.silly(`Querying: ${command} ${params}`)
    try {
        return client.query(command, params)
    }
    finally {
        client.release()
    }
}