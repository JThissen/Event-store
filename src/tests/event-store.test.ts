import { EventStore } from "../event-store"
import { v4 as uuid } from 'uuid';
import { Event } from "../interfaces/event";

require('dotenv').config()

describe("event-store", () => {
  let eventStore: EventStore

  let createRequestEvent: Event
  let updateRequestEvent: Event
  let updateRequestAgainEvent: Event

  let createCalculationEvent: Event
  let updateCalculationEvent: Event
  let updateCalculationAgainEvent: Event

  let requestEventIds: string[]
  let requestAggregateId: string
  let requestAggregateName = "Request"
  let requestCommandId: string
  let requestRevision: number

  let calculationEventIds: string[]
  let calculationAggregateId: string
  let calculationAggregateName = "Calculation"
  let calculationCommandId: string
  let calculationRevision: number

  beforeAll(async () => {
    requestEventIds = [uuid(), uuid(), uuid()]
    requestAggregateId = uuid()
    requestAggregateName = "Request"
    requestCommandId = uuid()
    requestRevision = 1

    calculationEventIds = [uuid(), uuid(), uuid()]
    calculationAggregateId = uuid()
    calculationAggregateName = "Calculation"
    calculationCommandId = uuid()
    calculationRevision = 1

    eventStore = new EventStore()

    createRequestEvent = {
      id: requestEventIds[0],
      aggregate: { id: requestAggregateId, name: requestAggregateName },
      name: "RequestCreated",
      data: { a: 111, b: "222" },
      metadata: {
        revision: requestRevision,
        timestamp: (new Date()).getTime(),
        correlationId: requestCommandId,
        causationId: requestCommandId,
      }
    }

    requestRevision += 1

    updateRequestEvent = {
      id: requestEventIds[1],
      aggregate: { id: requestAggregateId, name: requestAggregateName },
      name: "RequestUpdated",
      data: { a: 111, b: "222", c: 333 },
      metadata: {
        revision: requestRevision,
        timestamp: (new Date()).getTime(),
        correlationId: requestCommandId,
        causationId: requestCommandId,
      }
    }

    requestRevision += 1

    updateRequestAgainEvent = {
      id: requestEventIds[2],
      aggregate: { id: requestAggregateId, name: requestAggregateName },
      name: "RequestUpdatedAgain",
      data: { a: 111, b: "222", d: false },
      metadata: {
        revision: requestRevision,
        timestamp: (new Date()).getTime(),
        correlationId: requestCommandId,
        causationId: requestCommandId,
      }
    }

    createCalculationEvent = {
      id: calculationEventIds[0],
      aggregate: { id: calculationAggregateId, name: calculationAggregateName },
      name: "CalculationCreated",
      data: { id: uuid() },
      metadata: {
        revision: calculationRevision,
        timestamp: (new Date()).getTime(),
        correlationId: calculationCommandId,
        causationId: calculationCommandId,
      }
    }

    calculationRevision += 1

    updateCalculationEvent = {
      id: calculationEventIds[1],
      aggregate: { id: calculationAggregateId, name: calculationAggregateName },
      name: "CalculationUpdated",
      data: { a: 777, b: true },
      metadata: {
        revision: calculationRevision,
        timestamp: (new Date()).getTime(),
        correlationId: calculationCommandId,
        causationId: calculationCommandId,
      }
    }

    calculationRevision += 1

    updateCalculationAgainEvent = {
      id: calculationEventIds[2],
      aggregate: { id: calculationAggregateId, name: calculationAggregateName },
      name: "CalculationUpdatedAgain",
      data: { a: 777, b: true, c: "123" },
      metadata: {
        revision: calculationRevision,
        timestamp: (new Date()).getTime(),
        correlationId: calculationCommandId,
        causationId: calculationCommandId,
      }
    }

    await eventStore.create({
      host: process.env.POSTGRES_HOST!,
      port: Number(process.env.POSTGRES_PORT!),
      dbName: process.env.POSTGRES_DB!,
      user: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!,
      ssl: false,
    }, undefined, undefined, 3)
  })

  afterAll(async done => {
    const connection = await eventStore.connect()
    await connection.query(`
      DROP TABLE IF EXISTS "event_store";
      DROP TABLE IF EXISTS "snapshot_store";
    `)
    connection.release()
    eventStore.disconnect()
    done()
  })

  test("requestAggregateId should return 3 events", async () => {
    await eventStore.saveEvents(createRequestEvent, updateRequestEvent, updateRequestAgainEvent)
    const queryResult = await eventStore.getEventsById(requestAggregateId)
    expect(queryResult.length).toEqual(3)
  })

  test("calculationAggregateId should return 3 events", async () => {
    await eventStore.saveEvents(createCalculationEvent, updateCalculationEvent, updateCalculationAgainEvent)
    const queryResult = await eventStore.getEventsById(calculationAggregateId)
    expect(queryResult.length).toEqual(3)
  })

  test("should return the last event (requestAggregateId)", async () => {
    const event = await eventStore.getLastEventById(requestAggregateId)
    expect(event.id).toEqual(requestEventIds[requestEventIds.length - 1])
  })

  test("should return the last event (calculationAggregateId)", async () => {
    const event = await eventStore.getLastEventById(calculationAggregateId)
    expect(event.id).toEqual(calculationEventIds[calculationEventIds.length - 1])
  })

  test("should make a snapshot after the 3rd revision (requestAggregateId)", async () => {
    const snapshot = await eventStore.getSnapshotById(requestAggregateId)
    expect(snapshot.data).toEqual({ a: 111, b: '222', d: false })
  })

  test("should make a snapshot after the 3rd revision (calculationAggregateId)", async () => {
    const snapshot = await eventStore.getSnapshotById(calculationAggregateId)
    expect(snapshot.data).toEqual({ a: 777, b: true, c: "123" })
  })

  test("should return all events", async () => {
    const events = await eventStore.getAllEventsChronologically()
    expect(events.length).toEqual(6)
  })
})
