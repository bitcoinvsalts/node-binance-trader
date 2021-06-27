import BigNumber from 'bignumber.js'
import { Pool, QueryResult } from 'pg'
import logger from '../../logger'
import env from '../env'
import { shutDown } from '../trader'

// Tracks whether the database is available and initialised
let isReady = false

// Tracks the number of rows in the database
// It is better to do this in memory rather than querying the database all the time
let rows = 0

// Connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

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
        logger.info("Initialising database...")

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
        logger.warn("A PostgreSQL database has not been configured, logs and history will be lost if it restarts.")
    }
    return Promise.resolve(isReady)
}

// Writes the log and transaction records to the database
export async function saveRecord(type: string, record: string) {
    if (isReady) {
        rows++
        // Check if this row will put us over the maximum limit
        if (env().MAX_DATABASE_ROWS && rows > env().MAX_DATABASE_ROWS) {
            const buffer = Math.round(env().MAX_DATABASE_ROWS * 0.05)
            logger.debug(`Truncating ${buffer} database records.`)
            // So that we're not truncating every time a new entry is written, we'll drop the oldest 5% of records
            // Just in case there weren't 5% to delete, just subtract the actual count
            rows -= (await query(`WITH deleted AS (
                    DELETE FROM ${RECORDS} WHERE id IN(
                        SELECT TOP ${buffer} id FROM ${RECORDS} WHERE env = $1 ORDER BY id
                    ) RETURNING *
                ) SELECT count(*) AS total FROM deleted`, [process.env.NODE_ENV])).rows[0].total
            logger.debug(`There are ${rows} rows remaining in the database.`)
        }

        const command = `INSERT INTO ${RECORDS} (env, type, json) VALUES ($1, $2, $3)`
        const param = [process.env.NODE_ENV, type, record]
        return await execute([command], [param]).catch((reason) => {
            // To avoid an infinite loop when saving logs, the database will now be disabled
            isReady = false

            const logMessage = `Failed to save ${type} record: ${reason}`
            logger.error(logMessage)

            // Because the database has failed, we can no longer save the current state of the trader
            shutDown(logMessage)

            return Promise.reject(logMessage)
        })
    }
}

// Check for BigNumber to construct correctly
function reviveJSON(key: string, value: any) {
    if ((typeof value == 'object' && value != null) && (value.hasOwnProperty('_type'))) {
        switch (value._type) {
            case 'BigNumber':
                return new BigNumber(value.value)
            case 'Date':
                return new Date(value.value)
        }
    }
    return value;
}

// Converts an object to JSON and saves it into the database
export async function saveObjects(objects: any) {
    if (isReady) {
        const commands: string[] = []
        const params: any[] = []
        for (const type of Object.keys(objects)) {
            commands.push(`INSERT INTO ${OBJECTS} (env, type, json) VALUES ($1, $2, $3) ON CONFLICT (env, type) DO UPDATE SET json = EXCLUDED.json`)

            // Temporarily change the toJSON functions for BigNumber and Date so that it includes the type name for restoring
            const originalBigNumber = BigNumber.prototype.toJSON
            const originalDate = Date.prototype.toJSON
            BigNumber.prototype.toJSON = function toJSON(): any {
                return {
                    _type: 'BigNumber',
                    value: this.toFixed(),
                }
            }
            Date.prototype.toJSON = function toJSON(): any {
                return {
                    _type: 'Date',
                    value: this.toISOString(),
                }
            }

            // Convert object to JSON
            params.push([process.env.NODE_ENV, type, JSON.stringify(objects[type])])

            // Restore original functions
            BigNumber.prototype.toJSON = originalBigNumber
            Date.prototype.toJSON = originalDate
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
                return Promise.resolve(JSON.parse(result.rows[0].json, reviveJSON))
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