import { Event } from "./interfaces/event"
import { PostgresDbConfig } from "./interfaces/postgres-db-config"
import { Snapshot } from "./interfaces/snapshot"
import { Pool } from 'pg'
import retry from 'async-retry';

export class EventStore  {
  private pool: Pool
  private namespace: string
  private eventStoreName: string = "event_store"
  private snapshotStoreName: string = "snapshot_store"
  private snapshotInterval: number = 50

  private stringToAlphaNumeric(value: string) {
    return value.replace(new RegExp("[^0-9a-zA-Z_]", "g"), '') 
  }

  public constructor() {}

  public async connect() {
    return await this.pool.connect()
  }

  public async create(
    dbConfig: PostgresDbConfig, 
    eventStoreName?: string,
    snapshotStoreName?: string,
    snapshotInterval?: number
  ): Promise<void> {
    if(eventStoreName) {
      this.eventStoreName = this.stringToAlphaNumeric(eventStoreName)
    }

    if(snapshotStoreName) {
      this.snapshotStoreName = this.stringToAlphaNumeric(snapshotStoreName)
    }

    if(snapshotInterval) {
      this.snapshotInterval = snapshotInterval
    }

    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.dbName,
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
    })

    const connection = await this.connect()
    try {
      await retry(async () => {
        await connection.query(`
        CREATE TABLE IF NOT EXISTS "${this.eventStoreName}" (
          position bigserial NOT NULL,
          id uuid NOT NULL,
          "aggregateId" uuid NOT NULL,
          revision integer NOT NULL,
          event jsonb NOT NULL,

          CONSTRAINT "${this.namespace}_events_pk" PRIMARY KEY("position"),
          CONSTRAINT "${this.namespace}_aggregateId_revision_unique" UNIQUE ("id", "revision")
        );

        CREATE TABLE IF NOT EXISTS "${this.snapshotStoreName}" (
          "aggregateId" uuid NOT NULL,
          "revision" integer NOT NULL,
          "data" jsonb NOT NULL,

          CONSTRAINT "${this.namespace}_snapshots_pk" PRIMARY KEY("aggregateId")
        );
      `)
      }, { retries: 3 })
    } catch(error) {
      console.log("Unable to connect to the database:\n ", error)
    } finally {
      connection.release()
    }
  }

  public async saveEvents (...events: Event[]) {
    if (events.length === 0) {
      throw new Error('Please specify at least one or more events.')
    }

    const connection = await this.connect()

    try{
      events.forEach(async (event) => {
        if (event.metadata.revision < 1) { 
          throw new Error('The revision number must be greater than 0.'); 
        }

        await connection.query(`
          INSERT INTO "${this.eventStoreName}" (id, "aggregateId", revision, event)
          VALUES('${event.id}', '${event.aggregate.id}', '${event.metadata.revision}', '${JSON.stringify(event)}');
        `)
      })
    } catch(error) {
      console.log("Unable to insert values into the database:\n", error)
    } finally {
      connection.release()
    }

    const indices = events.map((event: Event, index: number) => 
      event.metadata.revision % this.snapshotInterval === 0 ? index : '').filter(String) as number[]

    for(const index of indices) {
      const aggregateId = events[index].aggregate.id;
      const revision = events[index].metadata.revision;
      const data = events[index].data;
      await this.saveSnapshot(aggregateId, revision, data);
    }
    return events;
  }

  public async getEventsById (
    aggregateId: string,
    startRevisionNumber: number = 1,
    endRevisionNumber: number = Math.pow(2, 31) - 1
  ): Promise<Event[]> {
    if (startRevisionNumber > endRevisionNumber) {
      throw new Error('Start revision number cannot be greater than end revision number.');
    }

    const connection = await this.connect()
    const queryResult = await connection.query(
      `SELECT *
          FROM "${this.eventStoreName}"
          WHERE "aggregateId" = '${aggregateId}'
            AND "revision" >= '${startRevisionNumber}'
            AND "revision" <= '${endRevisionNumber}'
          ORDER BY "revision";`
    );
    return queryResult.rows;
  }

  public async getLastEventById (aggregateId: string): Promise<Event> {
    const connection = await this.connect()
    try {
      const queryResult = await connection.query(`
          SELECT *
            FROM "${this.eventStoreName}"
            WHERE "aggregateId" = '${aggregateId}'
            ORDER BY "revision" DESC
            LIMIT 1
        `, );
      return queryResult.rows[0].event;
    } finally {
      connection.release();
    }
  }

  public async saveSnapshot (aggregateId: string, revision: number, data: { [key: string]: any} ): Promise<void> {
    const connection = await this.connect()
    try {
      await connection.query(`
        INSERT INTO "${this.snapshotStoreName}" (
          "aggregateId", revision, data
        ) VALUES ('${aggregateId}', '${revision}', '${JSON.stringify(data)}')
        ON CONFLICT DO NOTHING;
        `);
    } finally {
      connection.release();
    }
  }

  public async getSnapshotById (aggregateId: string): Promise<Snapshot> {
    const connection = await this.connect()
    try {
      const queryResult = await connection.query(`
          SELECT *
            FROM "${this.snapshotStoreName}"
            WHERE "aggregateId" = '${aggregateId}'
            ORDER BY "revision" DESC
            LIMIT 1
        `);
      return queryResult.rows[0]
    } finally {
      connection.release();
    }
  }

  public async getAllEventsChronologically (startRevisionNumber: number = 1, endRevisionNumber: number = Math.pow(2, 31) - 1): Promise<Event[]> {
    if (startRevisionNumber > endRevisionNumber) {
      throw new Error('Start revision number cannot be greater than end revision number.');
    }
    const connection = await this.connect()
    try {
      const queryResult = await connection.query(`
        SELECT *
          FROM "${this.eventStoreName}"
          WHERE "position" >= '${startRevisionNumber}'
            AND "position" <= '${endRevisionNumber}'
          ORDER BY "position"
    `);
      return queryResult.rows
    } finally {
      connection.release()
    }
  }

  public async disconnect() {
    if(!!this.pool) {
      await this.pool.end()
    }
  }
}
